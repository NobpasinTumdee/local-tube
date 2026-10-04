import { useStore } from '../store/useStore';

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

/** Roughly a few screens' worth at any grid density. */
const MAX_ENTRIES = 150;

/** Insertion order = recency; Map preserves it, so the oldest key is first. */
const order = new Map<string, string>();

/** Marks a thumbnail as the most recently used, evicting if we are over. */
export function rememberThumbnail(mediaId: string, url: string): void {
  if (order.has(mediaId)) order.delete(mediaId);
  order.set(mediaId, url);
  evictExcess();
}

/** Re-marks an existing entry without changing what it points at. */
export function touchThumbnail(mediaId: string): void {
  const url = order.get(mediaId);
  if (url === undefined) return;
  order.delete(mediaId);
  order.set(mediaId, url);
}

function evictExcess(): void {
  if (order.size <= MAX_ENTRIES) return;

  const { videoMeta, setVideoMeta } = useStore.getState();
  for (const [id, url] of order) {
    if (order.size <= MAX_ENTRIES) break;
    order.delete(id);
    /*
     * Only revoke what this cache minted. A URL the store has since replaced
     * (re-scan, a newer extraction) belongs to someone else.
     */
    if (videoMeta[id]?.thumbnailUrl === url) {
      setVideoMeta(id, { thumbnailUrl: undefined });
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    } else if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
}

/** Drops everything — used when the workspace itself changes. */
export function clearThumbnailCache(): void {
  for (const url of order.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  order.clear();
}

/** Live size, for diagnostics. */
export function thumbnailCacheSize(): number {
  return order.size;
}
