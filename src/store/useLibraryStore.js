import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { partitionByPermission, verifyPermission, isDirectoryReadable, } from '../utils/permissionUtils';
/* ─────────────────────────────────────────────────────────────
 *  VIRTUAL MULTI-PATH WORKSPACE
 * ─────────────────────────────────────────────────────────────
 *  Holds the set of folders currently mounted into the library, plus named
 *  presets ("Anime + Movies") that restore a whole set at once. No file is
 *  ever moved or copied — a workspace is just a list of directory handles.
 *
 *  WHY IndexedDB AND NOT localStorage
 *  A FileSystemDirectoryHandle is an opaque platform object, not data:
 *  JSON.stringify() yields "{}" and the reference is lost forever. IndexedDB
 *  stores it via the structured clone algorithm, which preserves the live
 *  reference across reloads — so IDB is not a preference here, it is the only
 *  mechanism that works. `idb-keyval` is a thin key/value wrapper over it.
 *
 *  Zustand's persist() middleware is deliberately NOT used: it is built on a
 *  synchronous JSON storage contract, and both halves (async, non-JSON) are
 *  wrong for handles. Persistence is therefore explicit — every mutator
 *  writes through to IDB itself.
 *
 *  THE INVARIANT THIS STORE MAINTAINS
 *  Everything in `activeHandles` is readable *right now*. Handles restored
 *  from IDB whose grant lapsed go to `pendingRestore` instead, and only move
 *  across once the user re-grants from a click. Consumers can therefore scan
 *  `activeHandles` without ever handling a NotAllowedError.
 * ───────────────────────────────────────────────────────────── */
const ACTIVE_KEY = 'localtube:workspace:active';
const PRESETS_KEY = 'localtube:workspace:presets';
const newId = () => globalThis.crypto?.randomUUID?.() ??
    `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
/**
 * Handle identity is not reference identity: picking the same folder twice
 * yields two distinct objects that must be treated as one mount. isSameEntry
 * is the only correct comparison — names collide across drives, and there is
 * no path to compare.
 */
async function indexOfHandle(list, handle) {
    for (let i = 0; i < list.length; i++) {
        try {
            if (await list[i].isSameEntry(handle))
                return i;
        }
        catch {
            /* Stale handle — can't match, treat as different. */
        }
    }
    return -1;
}
/** Writes survive a failed IDB (private mode, quota); state stays correct. */
async function persist(key, value) {
    try {
        await idbSet(key, value);
    }
    catch (err) {
        console.error(`[workspace] could not persist ${key}`, err);
    }
}
export const useLibraryStore = create()((set, get) => ({
    activeHandles: [],
    presets: [],
    pendingRestore: [],
    hydrated: false,
    busy: false,
    error: null,
    setError: (msg) => set({ error: msg }),
    /*
     * Cold start. Runs with no user gesture available, so it may only *query*
     * permissions — calling requestPermission() here would be suppressed by the
     * browser and would burn the grant check for no benefit.
     */
    hydrate: async () => {
        if (get().hydrated)
            return;
        try {
            const [storedActive, storedPresets] = await Promise.all([
                idbGet(ACTIVE_KEY),
                idbGet(PRESETS_KEY),
            ]);
            const presets = Array.isArray(storedPresets) ? storedPresets : [];
            const active = Array.isArray(storedActive) ? storedActive : [];
            const { granted, denied } = await partitionByPermission(active, 'read');
            /* 'granted' only means the grant survived — the folder itself may be
               gone. Filter to what actually reads, so the scan can't fail. */
            const readable = [];
            for (const h of granted) {
                if (await isDirectoryReadable(h))
                    readable.push(h);
            }
            set({ activeHandles: readable, pendingRestore: denied, presets, hydrated: true });
            /* Drop dead handles from storage so they don't linger forever. */
            if (readable.length + denied.length !== active.length) {
                await persist(ACTIVE_KEY, [...readable, ...denied]);
            }
        }
        catch (err) {
            console.error('[workspace] hydrate failed', err);
            set({ hydrated: true, error: 'Could not read the saved workspace.' });
        }
    },
    addHandleToActive: async (handle) => {
        const { activeHandles } = get();
        if (await indexOfHandle(activeHandles, handle) >= 0) {
            set({ error: `“${handle.name}” is already in the workspace.` });
            return;
        }
        const next = [...activeHandles, handle];
        set({ activeHandles: next, error: null });
        await persist(ACTIVE_KEY, [...next, ...get().pendingRestore]);
    },
    removeHandleFromActive: async (handle) => {
        const { activeHandles } = get();
        const i = await indexOfHandle(activeHandles, handle);
        if (i < 0)
            return;
        const next = activeHandles.filter((_, idx) => idx !== i);
        set({ activeHandles: next, error: null });
        await persist(ACTIVE_KEY, [...next, ...get().pendingRestore]);
    },
    clearActiveHandles: async () => {
        set({ activeHandles: [], pendingRestore: [], error: null });
        await persist(ACTIVE_KEY, []);
    },
    /*
     * MUST be called directly from a click. verifyPermission is the first await
     * so the gesture token is still live when the prompt is raised.
     */
    restorePending: async () => {
        const pending = get().pendingRestore;
        if (pending.length === 0)
            return;
        const stillPending = [];
        const restored = [];
        for (const h of pending) {
            if (await verifyPermission(h, 'read') && await isDirectoryReadable(h))
                restored.push(h);
            else
                stillPending.push(h);
        }
        const active = get().activeHandles;
        const merged = [...active];
        for (const h of restored) {
            if (await indexOfHandle(merged, h) < 0)
                merged.push(h);
        }
        set({
            activeHandles: merged,
            pendingRestore: stillPending,
            error: stillPending.length
                ? `${stillPending.length} folder${stillPending.length === 1 ? '' : 's'} could not be restored.`
                : null,
        });
        await persist(ACTIVE_KEY, [...merged, ...stillPending]);
    },
    dismissPending: async () => {
        set({ pendingRestore: [], error: null });
        await persist(ACTIVE_KEY, get().activeHandles);
    },
    saveActiveAsPreset: async (presetName) => {
        const name = presetName.trim();
        const { activeHandles, presets } = get();
        if (!name) {
            set({ error: 'Give the preset a name first.' });
            return;
        }
        if (activeHandles.length === 0) {
            set({ error: 'Add at least one folder before saving a preset.' });
            return;
        }
        /* Re-saving an existing name overwrites it, which is what "save" means
           to a user staring at a list that already contains that name. */
        const existing = presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
        const preset = {
            id: existing?.id ?? newId(),
            name,
            handles: [...activeHandles],
            createdAt: existing?.createdAt ?? Date.now(),
        };
        const next = existing
            ? presets.map((p) => (p.id === existing.id ? preset : p))
            : [...presets, preset];
        set({ presets: next, error: null });
        await persist(PRESETS_KEY, next);
    },
    /*
     * MUST be called directly from a click — same gesture rule as
     * restorePending(). Each folder is prompted for in turn, and a preset that
     * has outlived one of its folders still loads the rest.
     */
    loadPreset: async (presetId) => {
        const preset = get().presets.find((p) => p.id === presetId);
        if (!preset)
            return { loaded: 0, denied: [] };
        set({ busy: true, error: null });
        try {
            const usable = [];
            const denied = [];
            for (const h of preset.handles) {
                /* verifyPermission first (gesture-sensitive), liveness check second. */
                if (await verifyPermission(h, 'read') && await isDirectoryReadable(h)) {
                    if (await indexOfHandle(usable, h) < 0)
                        usable.push(h);
                }
                else {
                    denied.push(h.name);
                }
            }
            set({
                activeHandles: usable,
                pendingRestore: [],
                busy: false,
                error: denied.length
                    ? `Could not open: ${denied.join(', ')}. The folder may have moved, or access was declined.`
                    : null,
            });
            await persist(ACTIVE_KEY, usable);
            return { loaded: usable.length, denied };
        }
        catch (err) {
            console.error('[workspace] loadPreset failed', err);
            set({ busy: false, error: 'Could not load that preset.' });
            return { loaded: 0, denied: [] };
        }
    },
    deletePreset: async (presetId) => {
        const next = get().presets.filter((p) => p.id !== presetId);
        set({ presets: next, error: null });
        await persist(PRESETS_KEY, next);
    },
}));
