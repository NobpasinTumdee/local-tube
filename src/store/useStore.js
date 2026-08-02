import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
/** Normalize a raw tag input: trim, strip leading '#', collapse whitespace. */
export const normalizeTag = (raw) => raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim();
export const THEMES = [
    {
        id: 'dark',
        name: 'Default Dark',
        description: 'The classic YouTube-like look',
        swatch: { bg: '#0f0f0f', surface: '#181818', primary: '#ff0000', accent: '#3b82f6', text: '#ffffff' },
    },
    {
        id: 'oled',
        name: 'OLED Black',
        description: 'Pure black — saves battery on OLED screens',
        swatch: { bg: '#000000', surface: '#0c0c0c', primary: '#ff0000', accent: '#3b82f6', text: '#f5f5f5' },
    },
    {
        id: 'terminal',
        name: 'Retro Terminal',
        description: 'Green monospaced text on black',
        swatch: { bg: '#000000', surface: '#081408', primary: '#00ff41', accent: '#39ff14', text: '#33ff66' },
    },
    {
        id: 'deepsea',
        name: 'Deep Sea',
        description: 'Dark blue depths with teal accents',
        swatch: { bg: '#081423', surface: '#0e2036', primary: '#14b8a6', accent: '#2dd4bf', text: '#e0f2f1' },
    },
    {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        description: 'Neon purple with cyan & magenta contrast',
        swatch: { bg: '#140a23', surface: '#211236', primary: '#22d3ee', accent: '#e879f9', text: '#ece9ff' },
    },
    {
        id: 'light',
        name: 'Soft Light',
        description: 'A clean, warm daytime theme',
        swatch: { bg: '#faf9f6', surface: '#ffffff', primary: '#dc2626', accent: '#2563eb', text: '#18181b' },
    },
];
const THEME_STORAGE_KEY = 'localtube:theme';
const DEFAULT_THEME = 'dark';
function isThemeId(v) {
    return !!v && THEMES.some((t) => t.id === v);
}
/** Read the persisted theme (falls back to the default). */
export function getInitialTheme() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (isThemeId(stored))
            return stored;
    }
    catch {
        /* localStorage unavailable — ignore */
    }
    return DEFAULT_THEME;
}
/** Apply a theme to <body> (and persist it). Safe to call before render. */
export function applyTheme(id) {
    document.body.className = `theme-${id}`;
    try {
        localStorage.setItem(THEME_STORAGE_KEY, id);
    }
    catch {
        /* ignore persistence failures */
    }
}
const RECENT_LIMIT = 12;
/* Hard cap on simultaneous tiles (custom grids go up to 4×4). Videos are muted
 * + preload=metadata, but large grids still cost decode/bandwidth — see notes. */
export const LAYOUT_MAX_SLOTS = 16;
export const CUSTOM_MIN = 1;
export const CUSTOM_MAX = 4;
export const LAYOUT_TEMPLATES = [
    { id: 'single', name: 'Single', cols: 1, rows: 1, slots: 1 },
    { id: 'sideBySide', name: 'Side by Side', cols: 2, rows: 1, slots: 2 },
    { id: 'stacked', name: 'Stacked', cols: 1, rows: 2, slots: 2 },
    { id: 'threeCol', name: '3 Columns', cols: 3, rows: 1, slots: 3 },
    { id: 'onePlusTwo', name: '1 + 2', cols: 3, rows: 2, slots: 3, spans: { 0: { col: 2, row: 2 } } },
    { id: 'featured', name: '1 + 3', cols: 4, rows: 3, slots: 4, spans: { 0: { col: 3, row: 3 } } },
    { id: 'grid2x2', name: '2 × 2', cols: 2, rows: 2, slots: 4 },
    { id: 'grid3x2', name: '3 × 2', cols: 3, rows: 2, slots: 6 },
    { id: 'grid3x3', name: '3 × 3', cols: 3, rows: 3, slots: 9 },
    { id: 'auto', name: 'Auto', cols: 2, rows: 2, slots: 4 },
    { id: 'custom', name: 'Custom', cols: 2, rows: 2, slots: 4 },
];
export const templateById = (id) => LAYOUT_TEMPLATES.find((t) => t.id === id) ?? LAYOUT_TEMPLATES[0];
/** Number of cells a template currently occupies. */
export function slotCountFor(id, customCols, customRows) {
    if (id === 'auto')
        return 1; // grows as items are added
    if (id === 'custom')
        return Math.max(1, customCols * customRows);
    return templateById(id).slots;
}
/** Build a fresh slot array of `n` empty cells. */
function emptySlots(n) {
    return Array.from({ length: Math.max(1, n) }, () => null);
}
export const useStore = create()(persist((set, get) => ({
    rootName: '',
    videos: [],
    playlists: [],
    directoryTree: null,
    currentFolderPath: '',
    searchQuery: '',
    sidebarOpen: true,
    view: 'home',
    homeFilter: 'all',
    viewMode: 'nested',
    currentVideoId: null,
    playerMode: 'none',
    theaterMode: false,
    currentImageId: null,
    videoMeta: {},
    currentTheme: getInitialTheme(),
    layoutMode: false,
    currentLayoutTemplate: 'grid2x2',
    activeMedia: emptySlots(slotCountFor('grid2x2', 2, 2)),
    customCols: 2,
    customRows: 2,
    /* virtual collections — favorites/virtualPlaylists are rehydrated by persist */
    favorites: [],
    virtualPlaylists: [],
    collection: { type: 'all' },
    /* tags — mediaTags rehydrated by persist */
    mediaTags: {},
    activeFilterTags: [],
    /* continue watching — rehydrated by persist */
    playbackProgress: {},
    playbackQueue: [],
    recentVideoIds: [],
    /* legacy */
    activePlaylist: null,
    setActivePlaylist: (p) => set({ activePlaylist: p, currentFolderPath: p ?? '', searchQuery: '', collection: { type: 'all' } }),
    setLibrary: (scan) => set({
        rootName: scan.rootName,
        videos: scan.videos,
        playlists: scan.playlists,
        directoryTree: scan.directoryTree,
        currentFolderPath: '',
        activePlaylist: null,
        searchQuery: '',
        currentVideoId: null,
        currentImageId: null,
        playerMode: 'none',
        view: 'home',
        homeFilter: 'all',
        viewMode: 'nested',
        videoMeta: {},
        playbackQueue: [],
        recentVideoIds: [],
        collection: { type: 'all' },
        activeFilterTags: [],
        /* NOTE: favorites, virtualPlaylists & mediaTags intentionally preserved across re-scans */
    }),
    /*
     * Navigating to a folder should NOT reset currentVideoId / playerMode —
     * that lets the mini-player keep playing while the user browses.
     * We also clear the search so the folder view is what the user expects.
     */
    setCurrentFolder: (path) => set({ currentFolderPath: path, searchQuery: '', collection: { type: 'all' } }),
    setSearchQuery: (q) => set({ searchQuery: q }),
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setHomeFilter: (f) => set({ homeFilter: f }),
    setViewMode: (m) => set({ viewMode: m }),
    playVideo: (id) => set((s) => ({
        currentVideoId: id,
        playerMode: 'full',
        view: 'playing',
        currentImageId: null,
        /* track recent (move-to-front, cap at RECENT_LIMIT) */
        recentVideoIds: [id, ...s.recentVideoIds.filter((x) => x !== id)].slice(0, RECENT_LIMIT),
    })),
    /*
     * Close player but KEEP folder/search/filter state so the user returns to
     * exactly the browsing context they left.
     */
    closePlayer: () => set({ currentVideoId: null, playerMode: 'none', view: 'home' }),
    goHome: () => set((s) => ({
        view: 'home',
        playerMode: s.currentVideoId ? 'mini' : 'none',
    })),
    toggleMiniPlayer: () => set((s) => {
        if (!s.currentVideoId)
            return {};
        if (s.playerMode === 'full')
            return { playerMode: 'mini', view: 'home' };
        if (s.playerMode === 'mini')
            return { playerMode: 'full', view: 'playing' };
        return {};
    }),
    setTheaterMode: (on) => set({ theaterMode: on }),
    viewImage: (id) => set({ currentImageId: id, view: 'viewing_image' }),
    closeImage: () => set({ currentImageId: null, view: 'home' }),
    setVideoMeta: (id, meta) => set((s) => ({
        videoMeta: { ...s.videoMeta, [id]: { ...s.videoMeta[id], ...meta } },
    })),
    setTheme: (id) => {
        applyTheme(id);
        set({ currentTheme: id });
    },
    /* ── multi-video layout ── */
    setLayoutMode: (on) => set((s) => {
        if (!on)
            return { layoutMode: false };
        /* Smooth handoff: seed slot 0 with the single video that was playing */
        const slots = [...s.activeMedia];
        let anyFilled = false;
        for (const x of slots)
            if (x != null) {
                anyFilled = true;
                break;
            }
        if (s.currentVideoId && !anyFilled)
            slots[0] = s.currentVideoId;
        return { layoutMode: true, activeMedia: slots };
    }),
    toggleLayoutMode: () => get().setLayoutMode(!get().layoutMode),
    setLayoutTemplate: (id) => set((s) => {
        let slots;
        if (id === 'auto') {
            /* adaptive: keep only the real entries (grid reshapes to the count) */
            slots = s.activeMedia.filter((x) => x != null).slice(0, LAYOUT_MAX_SLOTS);
            if (slots.length === 0)
                slots = [null];
        }
        else {
            /* resize to this template's cell count, preserving slot order */
            const n = slotCountFor(id, s.customCols, s.customRows);
            slots = Array.from({ length: n }, (_, i) => s.activeMedia[i] ?? null);
        }
        return { currentLayoutTemplate: id, activeMedia: slots, layoutMode: true };
    }),
    addToLayout: (videoId, slot) => set((s) => {
        const slots = [...s.activeMedia];
        const isAuto = s.currentLayoutTemplate === 'auto';
        if (slot != null) {
            if (slot < 0 || slot >= LAYOUT_MAX_SLOTS)
                return {};
            if (slot >= slots.length) {
                if (!isAuto)
                    return {}; // fixed grids can't grow past their cells
                while (slots.length <= slot)
                    slots.push(null);
            }
            slots[slot] = videoId;
            return { activeMedia: slots, layoutMode: true };
        }
        /* no target slot → fill the first empty cell */
        const empty = slots.indexOf(null);
        if (empty >= 0) {
            slots[empty] = videoId;
            return { activeMedia: slots, layoutMode: true };
        }
        /* full: 'auto' grows, fixed/custom grids replace the last slot */
        if (isAuto && slots.length < LAYOUT_MAX_SLOTS) {
            slots.push(videoId);
        }
        else {
            slots[slots.length - 1] = videoId;
        }
        return { activeMedia: slots, layoutMode: true };
    }),
    removeFromLayout: (slot) => set((s) => {
        const slots = [...s.activeMedia];
        if (slot < 0 || slot >= slots.length)
            return {};
        if (s.currentLayoutTemplate === 'auto') {
            /* adaptive grid compacts so the layout reflows */
            slots.splice(slot, 1);
            if (slots.length === 0)
                slots.push(null);
        }
        else {
            slots[slot] = null;
        }
        return { activeMedia: slots };
    }),
    swapSlots: (a, b) => set((s) => {
        const slots = [...s.activeMedia];
        if (a < 0 || b < 0 || a >= slots.length || b >= slots.length || a === b)
            return {};
        [slots[a], slots[b]] = [slots[b], slots[a]];
        return { activeMedia: slots };
    }),
    clearLayout: () => set((s) => ({ activeMedia: emptySlots(slotCountFor(s.currentLayoutTemplate, s.customCols, s.customRows)) })),
    setCustomGrid: (cols, rows) => set((s) => {
        const c = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, Math.round(cols)));
        const r = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, Math.round(rows)));
        /* If the custom grid is live, resize its slots (preserving order). */
        const activeMedia = s.currentLayoutTemplate === 'custom'
            ? Array.from({ length: c * r }, (_, i) => s.activeMedia[i] ?? null)
            : s.activeMedia;
        return { customCols: c, customRows: r, activeMedia };
    }),
    /* ── favorites & virtual playlists ── */
    toggleFavorite: (mediaId) => set((s) => ({
        favorites: s.favorites.includes(mediaId)
            ? s.favorites.filter((x) => x !== mediaId)
            : [mediaId, ...s.favorites],
    })),
    createPlaylist: (title) => {
        const id = newId();
        const playlist = {
            id,
            title: title.trim() || 'New Playlist',
            createdAt: Date.now(),
            mediaIds: [],
        };
        set((s) => ({ virtualPlaylists: [...s.virtualPlaylists, playlist] }));
        return id;
    },
    deletePlaylist: (id) => set((s) => ({
        virtualPlaylists: s.virtualPlaylists.filter((p) => p.id !== id),
        /* if we were viewing it, fall back to the whole library */
        collection: s.collection.type === 'playlist' && s.collection.playlistId === id
            ? { type: 'all' }
            : s.collection,
    })),
    renamePlaylist: (id, title) => set((s) => ({
        virtualPlaylists: s.virtualPlaylists.map((p) => p.id === id ? { ...p, title: title.trim() || p.title } : p),
    })),
    addToPlaylist: (playlistId, mediaId) => set((s) => ({
        virtualPlaylists: s.virtualPlaylists.map((p) => p.id === playlistId && !p.mediaIds.includes(mediaId)
            ? { ...p, mediaIds: [...p.mediaIds, mediaId] }
            : p),
    })),
    removeFromPlaylist: (playlistId, mediaId) => set((s) => ({
        virtualPlaylists: s.virtualPlaylists.map((p) => p.id === playlistId ? { ...p, mediaIds: p.mediaIds.filter((x) => x !== mediaId) } : p),
    })),
    togglePlaylistItem: (playlistId, mediaId) => set((s) => ({
        virtualPlaylists: s.virtualPlaylists.map((p) => {
            if (p.id !== playlistId)
                return p;
            const has = p.mediaIds.includes(mediaId);
            return { ...p, mediaIds: has ? p.mediaIds.filter((x) => x !== mediaId) : [...p.mediaIds, mediaId] };
        }),
    })),
    setCollection: (c) => set({ collection: c, searchQuery: '' }),
    /* ── custom tags ── */
    addTag: (mediaId, raw) => set((s) => {
        const tag = normalizeTag(raw);
        if (!tag)
            return {};
        const cur = s.mediaTags[mediaId] ?? [];
        if (cur.includes(tag))
            return {};
        return { mediaTags: { ...s.mediaTags, [mediaId]: [...cur, tag] } };
    }),
    removeTag: (mediaId, tag) => set((s) => {
        const cur = s.mediaTags[mediaId];
        if (!cur || !cur.includes(tag))
            return {};
        const next = cur.filter((t) => t !== tag);
        const mediaTags = { ...s.mediaTags };
        if (next.length)
            mediaTags[mediaId] = next;
        else
            delete mediaTags[mediaId];
        return { mediaTags };
    }),
    toggleFilterTag: (tag) => set((s) => ({
        activeFilterTags: s.activeFilterTags.includes(tag)
            ? s.activeFilterTags.filter((t) => t !== tag)
            : [...s.activeFilterTags, tag],
    })),
    clearFilterTags: () => set({ activeFilterTags: [] }),
    /* ── continue watching + backup/restore ── */
    setPlaybackProgress: (mediaId, seconds) => set((s) => {
        const pp = { ...s.playbackProgress };
        /* clear when finished / barely started, otherwise store whole seconds */
        if (!Number.isFinite(seconds) || seconds < 3)
            delete pp[mediaId];
        else
            pp[mediaId] = Math.floor(seconds);
        return { playbackProgress: pp };
    }),
    applyImportedData: (data) => {
        set({
            favorites: data.favorites,
            virtualPlaylists: data.virtualPlaylists,
            mediaTags: data.mediaTags,
            playbackProgress: data.playbackProgress,
            /* leave any active filter/collection view — reset so nothing looks stale */
            collection: { type: 'all' },
            activeFilterTags: [],
        });
        if (data.currentTheme)
            get().setTheme(data.currentTheme);
    },
    setPlaybackQueue: (ids) => {
        const cur = get().playbackQueue;
        if (cur.length === ids.length && cur.every((x, i) => x === ids[i]))
            return;
        set({ playbackQueue: ids });
    },
    /*
     * Returns the id of the next video in the current playback queue.
     * - Index-based: files[currentIndex + 1]
     * - If currentVideoId isn't in the queue (user started from a different view),
     *   fall back to the first video in the queue (or null if empty).
     * - At the end of the queue we loop back to the first item so playback never
     *   dead-ends — callers that prefer "stop" can compare against the first id.
     */
    getNextVideoId: () => {
        const { playbackQueue, currentVideoId } = get();
        if (playbackQueue.length === 0)
            return null;
        if (!currentVideoId)
            return playbackQueue[0];
        const idx = playbackQueue.indexOf(currentVideoId);
        if (idx < 0)
            return playbackQueue[0];
        if (idx >= playbackQueue.length - 1)
            return playbackQueue[0]; // loop
        return playbackQueue[idx + 1];
    },
}), {
    name: 'localtube:collections',
    storage: createJSONStorage(() => localStorage),
    version: 1,
    /* Persist ONLY user customizations — never the live library/handles. */
    partialize: (s) => ({
        favorites: s.favorites,
        virtualPlaylists: s.virtualPlaylists,
        mediaTags: s.mediaTags,
        playbackProgress: s.playbackProgress,
    }),
}));
