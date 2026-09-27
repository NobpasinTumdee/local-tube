import { create } from 'zustand';
import { useStore, templateById } from './useStore';
import { getVaultHiddenIds } from '../hooks/useVaultGuard';
/* ─────────────────────────────────────────────────────────────
 *  LOCAL SHORTS
 * ─────────────────────────────────────────────────────────────
 *  A Shorts feed is not a view — it is a *kind of grid slot*, so that a
 *  short can play next to a normal video, or next to three other shorts.
 *
 *  The grid's `activeMedia` array holds media ids, and every consumer treats
 *  an id as "look this up in `videos`". Rather than widen that array to a
 *  union type (which would touch drag-drop, swap, persistence and the P2P
 *  payload), a feed slot stores a sentinel id:
 *
 *      shorts://                 → random from the whole workspace
 *      shorts://Movies%2FClips   → random from that folder subtree
 *
 *  It cannot collide with a real id: real ids are mount-prefixed paths like
 *  "Movies/clip.mp4" and never contain "://". Anything that resolves ids
 *  against the library simply finds nothing, which is why MediaViewer checks
 *  `isShortsSlot()` *before* falling through to <MediaTile>.
 *
 *  Each slot owns its own queue, keyed by slot index + sentinel, so two
 *  feeds from the same folder cycle independently instead of playing in
 *  lockstep.
 * ───────────────────────────────────────────────────────────── */
export const SHORTS_PREFIX = 'shorts://';
const FOLDER_SEP = '|';
/** Under this length a video counts as short regardless of its shape. */
export const SHORT_MAX_SECONDS = 90;
/** Builds the sentinel id for a feed slot. No folders = whole workspace. */
export function shortsSlotId(folders = []) {
    return SHORTS_PREFIX + folders.map(encodeURIComponent).join(FOLDER_SEP);
}
export function isShortsSlot(id) {
    return typeof id === 'string' && id.startsWith(SHORTS_PREFIX);
}
/** The folder paths a sentinel draws from ([] = the whole workspace). */
export function shortsFolders(sentinel) {
    const raw = sentinel.slice(SHORTS_PREFIX.length);
    return raw ? raw.split(FOLDER_SEP).map(decodeURIComponent) : [];
}
/** Short human label for the slot's source, e.g. "All folders" or "Clips". */
export function shortsSourceLabel(sentinel) {
    const folders = shortsFolders(sentinel);
    if (folders.length === 0)
        return 'All folders';
    if (folders.length === 1)
        return folders[0].split('/').pop() || folders[0];
    return `${folders.length} folders`;
}
/**
 * Queue key for one live slot.
 *
 * Slot index is part of it on purpose: three feed slots over the same folder
 * must each get their own shuffle, otherwise they would advance together and
 * show the same video three times.
 */
export const shortsSlotKey = (slot, sentinel) => `${slot}@${sentinel}`;
const sentinelOfKey = (key) => key.slice(key.indexOf('@') + 1);
/* ── queue building ── */
/** Fisher-Yates on a copy. */
function shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
/**
 * Does this look like a Short?
 *
 * Portrait shape is the strongest signal, duration the fallback. Both come
 * from `videoMeta`, which is filled in lazily when a card renders its
 * thumbnail — so for a library the user has not scrolled through yet, most
 * entries are simply unknown. Unknown must not mean excluded, hence the
 * tiering in generateShortsQueue rather than a hard filter.
 */
function looksShort(meta) {
    if (!meta)
        return false;
    if (meta.width && meta.height && meta.height > meta.width)
        return true;
    return meta.duration != null && meta.duration > 0 && meta.duration <= SHORT_MAX_SECONDS;
}
/** True when `path` is inside one of the source folder subtrees. */
function inSources(parentPath, folders) {
    if (folders.length === 0)
        return true;
    return folders.some((f) => f === '' || parentPath === f || parentPath.startsWith(`${f}/`));
}
/**
 * Builds a randomized queue of media ids.
 *
 * Preferred (portrait or short) entries are shuffled to the front and
 * everything else is shuffled behind them, so the feed opens with real
 * Shorts where the library has them but never dead-ends on a library whose
 * dimensions have not been probed yet.
 *
 * @param sourceFolders Restrict to these folder subtrees. Empty/omitted =
 *                      the whole active workspace.
 */
export function generateShortsQueue(sourceFolders = []) {
    const { videos, videoMeta } = useStore.getState();
    /* A locked vault must not leak into a random feed — that is exactly the
       surface it exists to stay out of. */
    const hidden = getVaultHiddenIds();
    const pool = videos.filter((v) => v.mediaType === 'video' && !hidden.has(v.id) && inSources(v.parentPath, sourceFolders));
    const preferred = [];
    const rest = [];
    for (const v of pool)
        (looksShort(videoMeta[v.id]) ? preferred : rest).push(v.id);
    return [...shuffle(preferred), ...shuffle(rest)];
}
export const useShortsStore = create()((set, get) => ({
    current: {},
    queues: {},
    getNextShort: (slotKey) => {
        const folders = shortsFolders(sentinelOfKey(slotKey));
        let queue = get().queues[slotKey] ?? [];
        const playing = get().current[slotKey] ?? null;
        if (queue.length === 0)
            queue = generateShortsQueue(folders);
        if (queue.length === 0) {
            set((s) => ({ current: { ...s.current, [slotKey]: null }, queues: { ...s.queues, [slotKey]: [] } }));
            return null;
        }
        /* A reshuffled queue can start on the video that just finished. With more
           than one candidate, skip it rather than repeat immediately. */
        let idx = 0;
        if (queue.length > 1 && queue[0] === playing)
            idx = 1;
        const next = queue[idx];
        const remaining = queue.slice(0, idx).concat(queue.slice(idx + 1));
        set((s) => ({
            current: { ...s.current, [slotKey]: next },
            queues: { ...s.queues, [slotKey]: remaining },
        }));
        return next;
    },
    reshuffle: (slotKey) => set((s) => ({ queues: { ...s.queues, [slotKey]: [] } })),
    releaseSlot: (slotKey) => set((s) => {
        const current = { ...s.current };
        const queues = { ...s.queues };
        delete current[slotKey];
        delete queues[slotKey];
        return { current, queues };
    }),
}));
/** Reactive read of what a slot is playing. */
export function useCurrentShort(slotKey) {
    return useShortsStore((s) => s.current[slotKey] ?? null);
}
/**
 * Turns the grid into a Shorts wall and starts playing immediately.
 *
 * Used by the sidebar entry. `single` gives one centred 9:16 stage, `wall`
 * three side-by-side columns — both are existing layout templates, so the
 * layout selector keeps working afterwards and the user can reshape or drop
 * a normal video into any slot.
 */
export function startShortsFeed(shape = 'wall', folders = []) {
    const { setLayoutTemplate, addToLayout, clearLayout } = useStore.getState();
    const template = shape === 'single' ? 'single' : 'threeCol';
    setLayoutTemplate(template);
    clearLayout();
    const sentinel = shortsSlotId(folders);
    const slots = templateById(template).slots;
    for (let i = 0; i < slots; i++)
        addToLayout(sentinel, i);
}
