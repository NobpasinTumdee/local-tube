import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
const CACHE_PREFIX = 'localtube:scrub:';
const INDEX_KEY = 'localtube:scrub:index';
/** ~10 strips × ~12 frames × ~4 KB ≈ 500 KB. Deliberately modest. */
const MAX_CACHED_STRIPS = 40;
export const DEFAULT_FRAME_COUNT = 12;
const FRAME_WIDTH = 160;
const JPEG_QUALITY = 0.55;
/** Videos shorter than this get proportionally fewer frames — 12 stills of a 5s clip is waste. */
const MIN_SECONDS_PER_FRAME = 4;
export function frameCountFor(duration) {
    if (!Number.isFinite(duration) || duration <= 0)
        return 1;
    return Math.max(1, Math.min(DEFAULT_FRAME_COUNT, Math.floor(duration / MIN_SECONDS_PER_FRAME)));
}
export function signatureFor(file) {
    return `${file.size}:${file.lastModified}`;
}
/* ── cache ───────────────────────────────────────────────── */
async function touchIndex(mediaId) {
    try {
        const index = (await idbGet(INDEX_KEY)) ?? [];
        const next = [mediaId, ...index.filter((id) => id !== mediaId)];
        const evicted = next.slice(MAX_CACHED_STRIPS);
        await idbSet(INDEX_KEY, next.slice(0, MAX_CACHED_STRIPS));
        /* Evict outside the hot path; a failure here only wastes space. */
        for (const id of evicted)
            await idbDel(CACHE_PREFIX + id).catch(() => undefined);
    }
    catch {
        /* Cache bookkeeping is best-effort. */
    }
}
export async function readCachedStrip(mediaId, signature) {
    try {
        const hit = await idbGet(CACHE_PREFIX + mediaId);
        if (!hit || hit.signature !== signature)
            return null;
        void touchIndex(mediaId);
        return hit;
    }
    catch {
        return null;
    }
}
export async function writeCachedStrip(mediaId, strip) {
    try {
        await idbSet(CACHE_PREFIX + mediaId, strip);
        await touchIndex(mediaId);
    }
    catch {
        /* Quota exceeded — previews just won't be cached. Not worth surfacing. */
    }
}
/** Drops every cached strip. Exposed for the settings "clear cache" action. */
export async function clearFrameCache() {
    const index = (await idbGet(INDEX_KEY)) ?? [];
    await Promise.all(index.map((id) => idbDel(CACHE_PREFIX + id).catch(() => undefined)));
    await idbDel(INDEX_KEY).catch(() => undefined);
}
/* ── extraction ──────────────────────────────────────────── */
/**
 * How long to wait for a single media event before giving up.
 *
 * This timeout is load-bearing, not defensive padding. A hidden/throttled
 * tab suspends media decoding entirely: `loadedmetadata` never fires and
 * never errors, so an untimed wait hangs forever. Because extraction runs
 * through a single-flight queue, one such hang would wedge the queue and
 * silently kill previews for the rest of the session.
 */
const EVENT_TIMEOUT_MS = 12000;
function once(el, type, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`video ${type} timed out`));
        }, EVENT_TIMEOUT_MS);
        const cleanup = () => {
            clearTimeout(timer);
            el.removeEventListener(type, ok);
            el.removeEventListener('error', fail);
            signal?.removeEventListener('abort', onAbort);
        };
        const ok = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error(`video ${type} failed`)); };
        const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
        el.addEventListener(type, ok, { once: true });
        el.addEventListener('error', fail, { once: true });
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
/**
 * Serialises extraction to one job at a time.
 *
 * Two strips decoding at once would double the pressure on the same decoder
 * the foreground player is using, and the user can only hover one scrubber.
 */
class SingleFlight {
    constructor() {
        Object.defineProperty(this, "current", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Promise.resolve()
        });
    }
    run(task) {
        const next = this.current.then(task, task);
        this.current = next.catch(() => undefined);
        return next;
    }
}
const extractionQueue = new SingleFlight();
/**
 * Extracts an evenly-spaced filmstrip from `file`.
 *
 * Frames are sampled at the MIDPOINT of each segment rather than its start:
 * the very first frame of a video is often black or a fade-in, and a
 * filmstrip whose first cell is a black square looks broken.
 */
export async function extractFrames(file, { signal, onFrame } = {}) {
    return extractionQueue.run(async () => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        /* Never attached to the document — it exists only to decode. */
        video.src = url;
        const canvas = document.createElement('canvas');
        try {
            await once(video, 'loadedmetadata', signal);
            const duration = video.duration;
            if (!Number.isFinite(duration) || duration <= 0) {
                throw new Error('Video has no usable duration');
            }
            const count = frameCountFor(duration);
            const srcW = video.videoWidth || FRAME_WIDTH;
            const srcH = video.videoHeight || Math.round((FRAME_WIDTH * 9) / 16);
            const w = Math.min(srcW, FRAME_WIDTH);
            const h = Math.max(1, Math.round(srcH * (w / srcW)));
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: false });
            if (!ctx)
                throw new Error('2D canvas unavailable');
            const frames = [];
            for (let i = 0; i < count; i++) {
                if (signal?.aborted)
                    throw new DOMException('Aborted', 'AbortError');
                const target = ((i + 0.5) / count) * duration;
                /* Keep clear of the final frames; seeking to exactly duration can
                   land past the last keyframe and never fire 'seeked'. */
                video.currentTime = Math.min(target, Math.max(0, duration - 0.1));
                await once(video, 'seeked', signal);
                ctx.drawImage(video, 0, 0, w, h);
                const frame = {
                    time: video.currentTime,
                    dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
                };
                frames.push(frame);
                onFrame?.(frame, i, count);
            }
            return { signature: signatureFor(file), duration, frames };
        }
        finally {
            URL.revokeObjectURL(url);
            video.removeAttribute('src');
            /* Forces the element to drop its decoder rather than waiting for GC. */
            video.load();
        }
    });
}
/** Nearest frame to a timestamp — the strip is sparse, so "nearest" is the best we can do. */
export function frameAt(frames, time) {
    if (frames.length === 0)
        return null;
    let best = frames[0];
    let bestDelta = Math.abs(best.time - time);
    for (let i = 1; i < frames.length; i++) {
        const d = Math.abs(frames[i].time - time);
        if (d < bestDelta) {
            best = frames[i];
            bestDelta = d;
        }
    }
    return best;
}
