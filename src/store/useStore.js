import { create } from 'zustand';
const RECENT_LIMIT = 12;
export const useStore = create((set, get) => ({
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
    playbackQueue: [],
    recentVideoIds: [],
    /* legacy */
    activePlaylist: null,
    setActivePlaylist: (p) => set({ activePlaylist: p, currentFolderPath: p ?? '', searchQuery: '' }),
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
    }),
    /*
     * Navigating to a folder should NOT reset currentVideoId / playerMode —
     * that lets the mini-player keep playing while the user browses.
     * We also clear the search so the folder view is what the user expects.
     */
    setCurrentFolder: (path) => set({ currentFolderPath: path, searchQuery: '' }),
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
}));
