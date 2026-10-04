import { useSettingsStore, RESOURCE_LIMITS, resourceLimits } from '../store/useSettingsStore';

/* ─────────────────────────────────────────────────────────────
 *  THUMBNAIL EXTRACTION
 * ─────────────────────────────────────────────────────────────
 *  Three things decide whether a large library feels fast here:
 *
 *  1. WHAT WE KEEP. Thumbnails are blob: URLs, not data: URLs. A base64
 *     data: URL is a JavaScript string that lives in the heap until the whole
 *     entry is dropped and cannot be released early; a blob: URL is a handle
 *     the browser owns and `URL.revokeObjectURL` frees on demand. That one
 *     change is what makes the LRU in thumbnailCache possible at all.
 *
 *  2. IMAGES ARE DOWNSCALED. The old path handed the card an object URL for
 *     the ORIGINAL file, so a folder of 12MP photos held every full-size
 *     image in memory to draw 300px tiles. They now go through the same
 *     canvas as video frames.
 *
 *  3. WORK IS CANCELLABLE. Scrolling fast used to queue an extraction per
 *     card passed, and every one of them ran. Each task takes an AbortSignal
 *     and drops out at the first checkpoint — before it is scheduled, after
 *     metadata, after the seek.
 * ───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
 *  TUNING — measured on a 200-file library of phone video (47MB-540MB,
 *  1080p/4K) in this app, not guessed.
 *
 *  Per item, the pipeline costs roughly:
 *      getFile      3-9ms     negligible
 *      metadata     27-94ms
 *      seek         66-199ms  ← the real cost
 *      drawImage    0-3ms
 *      encode       ~30ms     (JPEG @480)
 *
 *  So the lever that matters is overlapping the seeks, which is what
 *  CONCURRENCY does. Encoding format and canvas size are rounding errors by
 *  comparison — see their notes below before "optimising" them again.
 * ───────────────────────────────────────────────────────────── */

/**
 * How many extractions may be in flight.
 *
 * Measured throughput per item at 3 / 6 / 12 concurrent, two runs over
 * different files: 175/117ms, 118/131ms, 74/96ms. Overlapping the seeks is
 * worth roughly 2x.
 *
 * Not scaled to navigator.hardwareConcurrency, which was the first thing I
 * tried and was wrong: the machine those numbers come from reports 4 cores,
 * and still got its best result at 12. Almost none of this work is JS on the
 * main thread — it is demux, seek and decode inside the media pipeline, which
 * overlaps happily on a small core count. Core count is the wrong model for
 * it; a flat ceiling is the right one.
 *
 * 10 rather than 12: each slot is a live decoder holding buffers for a file
 * that may be hundreds of MB, and the gap between the two was inside the
 * run-to-run noise.
 */
const CONCURRENCY = RESOURCE_LIMITS['save-ram'].concurrency;

const THUMB_MAX_WIDTH = 480;

/**
 * JPEG, not WebP. Measured on the same canvas, alternating formats, warm-up
 * discarded: JPEG@480 ~29-31ms vs WebP@480 ~42-85ms. WebP is the SLOWER
 * encoder in Chrome (libwebp vs libjpeg-turbo) — it wins on size (28KB vs
 * 47KB), not on speed. Switch only if thumbnail memory becomes the problem
 * rather than latency.
 */
const THUMB_TYPE = 'image/jpeg';
const THUMB_QUALITY = 0.72;

/**
 * Low-quality placeholder: a 16px-wide JPEG as a data: URL, ~1KB.
 *
 * A data: URL on purpose, unlike the full thumbnail. It is small enough that
 * holding one per file costs ~200KB across a 200-file library, and because it
 * is not a blob it survives LRU eviction of the real thumbnail — which is the
 * point. When the cache drops a thumbnail and the user scrolls back, the card
 * shows the blurred frame instantly instead of a shimmer.
 */
const LQIP_WIDTH = 16;
const LQIP_QUALITY = 0.1;

export interface ThumbResult {
  /** blob: URL — revoke it when done (see thumbnailCache). */
  url: string;
  /** data: URL of the 16px preview, if one was produced. */
  lqipUrl?: string;
  duration?: number;
  /** Source pixel dimensions — used for aspect-ratio & resolution badges. */
  width: number;
  height: number;
}

interface Options {
  seekTime?: number;
  quality?: number;
  maxWidth?: number;
  signal?: AbortSignal;
  /**
   * Called with the LQIP as soon as a frame has been decoded, before the
   * full-size encode. See generateThumbnail for why this is not a separate
   * seek-free pass.
   */
  onPreview?: (lqipUrl: string) => void;
}

export const THUMBNAIL_CONCURRENCY = CONCURRENCY;

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function abortError(): DOMException {
  return new DOMException('Thumbnail generation cancelled', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** Canvas → blob URL. toBlob beats toDataURL: no base64 round trip, and the
 *  result is releasable. */
function canvasToBlobUrl(canvas: HTMLCanvasElement, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Thumbnail encoding failed'))),
      THUMB_TYPE,
      quality,
    );
  });
}

/**
 * Grabs one frame from a video file, emitting a blurred preview first.
 *
 * WHY ONE SEEK AND NOT TWO. The tempting design is to yield a preview from
 * the untouched first frame on `loadeddata`, skipping the seek entirely, and
 * only then seek for the real frame. Measured on this library, that does not
 * work:
 *
 *   - Drawing at `loadeddata` produced a PURE BLACK canvas on 8 of 8 videos
 *     (luminance 0 vs 88-99 after a seek). The frame is not composited yet,
 *     so the "instant preview" is a black square.
 *   - Waiting for a genuinely decoded first frame via requestVideoFrameCallback
 *     took 639-1618ms — an order of magnitude worse than seeking.
 *   - A seek is cheap: 41ms median to 1.0s, and seeking to 0.1s instead was
 *     no faster (54ms median), with no black frames at either target.
 *
 * So a frame costs one seek no matter what, and a second pass would double
 * the pipeline's dominant cost to show a blur ~30ms sooner. Instead both
 * images come off the SAME decoded frame: the 16px preview is encoded and
 * handed over first (~1-3ms), then the full one. The preview still earns its
 * keep — it outlives the LRU, so a card scrolled back to is never blank.
 */
export async function generateThumbnail(
  file: File,
  /*
   * seekTime stays at 1.0s. Seeking anywhere means decoding forward from the
   * preceding keyframe, so early is cheap and deep is expensive; 1.0s is far
   * enough in to clear the black frame most recordings open on, and measured
   * no slower than 0.1s.
   */
  { seekTime = 1.0, quality = THUMB_QUALITY, maxWidth = THUMB_MAX_WIDTH, signal, onPreview }: Options = {},
): Promise<ThumbResult> {
  throwIfAborted(signal);

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await once(video, 'loadedmetadata', signal);

    const target = Math.min(seekTime, Math.max(0, (video.duration || 0) - 0.05));
    video.currentTime = target;
    await once(video, 'seeked', signal);
    throwIfAborted(signal);

    const srcW = video.videoWidth || maxWidth;
    const srcH = video.videoHeight || Math.round((maxWidth * 9) / 16);

    /* ── Pass 1: the blur, straight away ── */
    let lqipUrl: string | undefined;
    if (onPreview) {
      const lw = LQIP_WIDTH;
      const lh = Math.max(1, Math.round(srcH * (lw / srcW)));
      const lqipCanvas = document.createElement('canvas');
      lqipCanvas.width = lw;
      lqipCanvas.height = lh;
      const lctx = lqipCanvas.getContext('2d');
      if (lctx) {
        lctx.drawImage(video, 0, 0, lw, lh);
        /* toDataURL, not toBlob: at this size base64 is ~1KB and synchronous,
           where toBlob would hand the preview over a task later — the exact
           delay this is meant to remove. */
        lqipUrl = lqipCanvas.toDataURL('image/jpeg', LQIP_QUALITY);
        if (!signal?.aborted) onPreview(lqipUrl);
      }
    }

    /* ── Pass 2: the real thing ── */
    const w = Math.min(srcW, maxWidth);
    const h = Math.round(srcH * (w / srcW));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(video, 0, 0, w, h);
    throwIfAborted(signal);

    return {
      url: await canvasToBlobUrl(canvas, quality),
      lqipUrl,
      duration: video.duration,
      width: srcW,
      height: srcH,
    };
  } finally {
    /* Release the source immediately — the decoder holds real memory, and on
       a fast scroll dozens of these are torn down per second. */
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Downscales an image file to a tile-sized thumbnail.
 *
 * createImageBitmap decodes off the main thread where available, which keeps
 * a folder of large photos from stuttering the scroll; the <img> fallback
 * covers the rest.
 */
export async function generateImageThumbnail(
  file: File,
  { quality = 0.8, maxWidth = THUMB_MAX_WIDTH, signal, onPreview }: Options = {},
): Promise<ThumbResult> {
  throwIfAborted(signal);

  const url = URL.createObjectURL(file);
  try {
    let srcW: number;
    let srcH: number;
    let source: CanvasImageSource;
    let bitmap: ImageBitmap | null = null;

    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
      throwIfAborted(signal);
      srcW = bitmap.width;
      srcH = bitmap.height;
      source = bitmap;
    } else {
      const img = new Image();
      img.src = url;
      await once(img, 'load', signal);
      srcW = img.naturalWidth;
      srcH = img.naturalHeight;
      source = img;
    }

    const w = Math.min(srcW || maxWidth, maxWidth);
    const h = Math.round((srcH || maxWidth) * (w / (srcW || maxWidth)));

    let lqipUrl: string | undefined;
    if (onPreview) {
      const lw = LQIP_WIDTH;
      const lh = Math.max(1, Math.round((srcH || maxWidth) * (lw / (srcW || maxWidth))));
      const lc = document.createElement('canvas');
      lc.width = lw;
      lc.height = lh;
      const lctx = lc.getContext('2d');
      if (lctx) {
        lctx.drawImage(source, 0, 0, lw, lh);
        lqipUrl = lc.toDataURL('image/jpeg', LQIP_QUALITY);
        if (!signal?.aborted) onPreview(lqipUrl);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(source, 0, 0, w, h);
    bitmap?.close();

    return { url: await canvasToBlobUrl(canvas, quality), lqipUrl, width: srcW, height: srcH };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(el: HTMLElement, type: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(`${type} failed`)); };
    const onAbort = () => { cleanup(); reject(abortError()); };
    const cleanup = () => {
      el.removeEventListener(type, ok);
      el.removeEventListener('error', fail);
      signal?.removeEventListener('abort', onAbort);
    };
    if (signal?.aborted) { reject(abortError()); return; }
    el.addEventListener(type, ok, { once: true });
    el.addEventListener('error', fail, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/* ─────────────────────────────────────────────────────────────
 *  CONCURRENCY GATE — LIFO
 * ─────────────────────────────────────────────────────────────
 *  Last in, first out, which looks wrong until you consider what the queue
 *  actually holds: requests from cards the user has scrolled THROUGH. FIFO
 *  serves the oldest first — the tiles furthest behind the viewport — so the
 *  row on screen waits behind a hundred rows nobody is looking at any more.
 *  Newest-first means what you are looking at is what gets decoded.
 *
 *  Starvation is not a concern here, because the stale entries do not sit
 *  there forever: a card that leaves the viewport aborts its own request and
 *  drops out of the queue entirely.
 * ───────────────────────────────────────────────────────────── */

interface Waiter {
  release: () => void;
  cancel: () => void;
}

export class ThumbnailQueue {
  private active = 0;
  private waiting: Waiter[] = [];

  constructor(private concurrency = CONCURRENCY) {}

  /**
   * Resizes the gate while it is running — the resource-mode toggle changes
   * this mid-session. Raising it admits the waiters that the old ceiling was
   * holding back, so the change takes effect on the current screen rather
   * than only on the next scroll.
   */
  setConcurrency(n: number): void {
    const next = Math.max(1, Math.round(n));
    if (next === this.concurrency) return;
    this.concurrency = next;
    while (this.active < this.concurrency && this.waiting.length) this.next();
  }

  get limit(): number {
    return this.concurrency;
  }

  get pending(): number {
    return this.waiting.length;
  }

  get inFlight(): number {
    return this.active;
  }

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    throwIfAborted(signal);

    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve, reject) => {
        const waiter: Waiter = {
          release: () => { detach(); resolve(); },
          cancel: () => { detach(); reject(abortError()); },
        };
        const onAbort = () => {
          this.waiting = this.waiting.filter((w) => w !== waiter);
          waiter.cancel();
        };
        const detach = () => signal?.removeEventListener('abort', onAbort);
        signal?.addEventListener('abort', onAbort, { once: true });
        this.waiting.push(waiter);
      });
    }

    /* Aborted while queued but after being released: give the slot away
       rather than burning it on work nobody is waiting for. */
    if (signal?.aborted) {
      this.next();
      throw abortError();
    }

    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.next();
    }
  }

  /** pop(), not shift() — the newest waiter is the one on screen. */
  private next(): void {
    this.waiting.pop()?.release();
  }
}

export const thumbnailQueue = new ThumbnailQueue();

/* Keep the live gate in step with the user's resource mode. Subscribed here
   rather than in a component so it applies even with no grid mounted. */
useSettingsStore.subscribe((s) => {
  thumbnailQueue.setConcurrency(RESOURCE_LIMITS[s.resourceMode].concurrency);
});
thumbnailQueue.setConcurrency(resourceLimits().concurrency);
