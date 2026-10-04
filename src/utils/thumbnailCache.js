import { useStore } from '../store/useStore';
import { resourceLimits } from '../store/useSettingsStore';
/* ─────────────────────────────────────────────────────────────
 *  THUMBNAIL LRU
 * ─────────────────────────────────────────────────────────────
 *  Thumbnails used to accumulate without limit: one entry per file ever
 *  scrolled past, held in `videoMeta` for the lifetime of the session. On a
 *  directory of a few thousand files that is the single largest thing the app
 *  keeps in memory.
 *
 *  Every generated thumbnail is now a blob: URL, so it CAN be released — a
 *  data: URL cannot, which is why the generator stopped producing them. This
 *  cache decides when: hold the most recently seen N, revoke the rest.
 *
 *  Eviction also clears the entry from the store, so a card scrolled back to
 *  after a long detour simply regenerates. That costs one decode and keeps a
 *  10,000-file library using the same memory as a 100-file one.
 * ───────────────────────────────────────────────────────────── */
/**
 * Comes from the resource mode: 150 in 'save-ram', 1000 in 'performance'.
 * Read per call rather than captured, so flipping the mode takes effect on
 * the next write instead of after a reload.
 */
const maxEntries = () => resourceLimits().cacheLimit;
/** Insertion order = recency; Map preserves it, so the oldest key is first. */
const order = new Map();
/** Marks a thumbnail as the most recently used, evicting if we are over. */
export function rememberThumbnail(mediaId, url) {
    if (order.has(mediaId))
        order.delete(mediaId);
    order.set(mediaId, url);
    evictExcess();
}
/** Re-marks an existing entry without changing what it points at. */
export function touchThumbnail(mediaId) {
    const url = order.get(mediaId);
    if (url === undefined)
        return;
    order.delete(mediaId);
    order.set(mediaId, url);
}
function evictExcess() {
    const limit = maxEntries();
    if (order.size <= limit)
        return;
    const { videoMeta, setVideoMeta } = useStore.getState();
    for (const [id, url] of order) {
        if (order.size <= limit)
            break;
        order.delete(id);
        /*
         * Only the full thumbnail is dropped. `lqipUrl` is a ~1KB data: URL and
         * stays — that is what lets an evicted card come back as a blurred frame
         * instead of an empty box, and it is why the smaller cache limit is not
         * something the user sees.
         */
        if (videoMeta[id]?.thumbnailUrl === url) {
            setVideoMeta(id, { thumbnailUrl: undefined });
            if (url.startsWith('blob:'))
                URL.revokeObjectURL(url);
        }
        else if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }
}
/** Drops everything — used when the workspace itself changes. */
export function clearThumbnailCache() {
    for (const url of order.values()) {
        if (url.startsWith('blob:'))
            URL.revokeObjectURL(url);
    }
    order.clear();
}
/** Live size, for diagnostics. */
export function thumbnailCacheSize() {
    return order.size;
}
