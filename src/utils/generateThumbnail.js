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
const CONCURRENCY = 10;
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
export const THUMBNAIL_CONCURRENCY = CONCURRENCY;
export function isAbortError(err) {
    return err instanceof DOMException && err.name === 'AbortError';
}
function abortError() {
    return new DOMException('Thumbnail generation cancelled', 'AbortError');
}
function throwIfAborted(signal) {
    if (signal?.aborted)
        throw abortError();
}
/** Canvas → blob URL. toBlob beats toDataURL: no base64 round trip, and the
 *  result is releasable. */
function canvasToBlobUrl(canvas, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Thumbnail encoding failed'))), THUMB_TYPE, quality);
    });
}
/** Grabs one frame from a video file. */
export async function generateThumbnail(file, 
/*
 * seekTime stays at 1.0s. Seeking anywhere means decoding forward from the
 * preceding keyframe, so early is cheap and deep is expensive; 1.0s is far
 * enough in to clear the black frame most recordings open on.
 */
{ seekTime = 1.0, quality = THUMB_QUALITY, maxWidth = THUMB_MAX_WIDTH, signal } = {}) {
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
        const w = Math.min(srcW, maxWidth);
        const h = Math.round(srcH * (w / srcW));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('2D canvas unavailable');
        ctx.drawImage(video, 0, 0, w, h);
        return {
            url: await canvasToBlobUrl(canvas, quality),
            duration: video.duration,
            width: srcW,
            height: srcH,
        };
    }
    finally {
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
export async function generateImageThumbnail(file, { quality = 0.8, maxWidth = THUMB_MAX_WIDTH, signal } = {}) {
    throwIfAborted(signal);
    const url = URL.createObjectURL(file);
    try {
        let srcW;
        let srcH;
        let source;
        let bitmap = null;
        if (typeof createImageBitmap === 'function') {
            bitmap = await createImageBitmap(file);
            throwIfAborted(signal);
            srcW = bitmap.width;
            srcH = bitmap.height;
            source = bitmap;
        }
        else {
            const img = new Image();
            img.src = url;
            await once(img, 'load', signal);
            srcW = img.naturalWidth;
            srcH = img.naturalHeight;
            source = img;
        }
        const w = Math.min(srcW || maxWidth, maxWidth);
        const h = Math.round((srcH || maxWidth) * (w / (srcW || maxWidth)));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('2D canvas unavailable');
        ctx.drawImage(source, 0, 0, w, h);
        bitmap?.close();
        return { url: await canvasToBlobUrl(canvas, quality), width: srcW, height: srcH };
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
function once(el, type, signal) {
    return new Promise((resolve, reject) => {
        const ok = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error(`${type} failed`)); };
        const onAbort = () => { cleanup(); reject(abortError()); };
        const cleanup = () => {
            el.removeEventListener(type, ok);
            el.removeEventListener('error', fail);
            signal?.removeEventListener('abort', onAbort);
        };
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        el.addEventListener(type, ok, { once: true });
        el.addEventListener('error', fail, { once: true });
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
export class ThumbnailQueue {
    constructor(concurrency = CONCURRENCY) {
        Object.defineProperty(this, "concurrency", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: concurrency
        });
        Object.defineProperty(this, "active", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "waiting", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    get pending() {
        return this.waiting.length;
    }
    get inFlight() {
        return this.active;
    }
    async run(task, signal) {
        throwIfAborted(signal);
        if (this.active >= this.concurrency) {
            await new Promise((resolve, reject) => {
                const waiter = {
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
        }
        finally {
            this.active--;
            this.next();
        }
    }
    /** pop(), not shift() — the newest waiter is the one on screen. */
    next() {
        this.waiting.pop()?.release();
    }
}
export const thumbnailQueue = new ThumbnailQueue();
