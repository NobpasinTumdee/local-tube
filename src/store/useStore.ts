import { create } from 'zustand';
import type { MediaEntry, ScanResult, FolderNode } from '../utils/directoryScanner';

export interface VideoMeta {
  thumbnailUrl?: string;
  duration?: number;
}

export type PlayerMode = 'none' | 'full' | 'mini';
export type View = 'home' | 'playing' | 'viewing_image';
export type HomeFilter = 'all' | 'videos' | 'images';
export type ViewMode = 'nested' | 'flat';

const RECENT_LIMIT = 12;

interface StoreState {
  /* library */
  rootName: string;
  videos: MediaEntry[];
  playlists: string[];
  directoryTree: FolderNode | null;

  /* navigation */
  currentFolderPath: string;   // '' = root
  searchQuery: string;
  sidebarOpen: boolean;
  view: View;
  homeFilter: HomeFilter;
  viewMode: ViewMode;

  /* video player */
  currentVideoId: string | null;
  playerMode: PlayerMode;
  theaterMode: boolean;

  /* image viewer */
  currentImageId: string | null;

  /* per-item lazily loaded meta */
  videoMeta: Record<string, VideoMeta>;

  /*
   * Ordered list of video ids that represent the CURRENT filtered view.
   * App.tsx keeps this in sync with its `visible` list so the player can do
   * index-based sequential playback (files[currentIndex + 1]).
   */
  playbackQueue: string[];

  /* Most recently played video ids (newest first) */
  recentVideoIds: string[];

  /* actions */
  setLibrary: (scan: ScanResult) => void;
  setCurrentFolder: (path: string) => void;
  setSearchQuery: (q: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setHomeFilter: (f: HomeFilter) => void;
  setViewMode: (m: ViewMode) => void;

  /* video player actions */
  playVideo: (id: string) => void;
  closePlayer: () => void;
  goHome: () => void;
  toggleMiniPlayer: () => void;
  setTheaterMode: (on: boolean) => void;

  /* image viewer actions */
  viewImage: (id: string) => void;
  closeImage: () => void;

  setVideoMeta: (id: string, meta: VideoMeta) => void;

  /* queue / recent */
  setPlaybackQueue: (ids: string[]) => void;
  getNextVideoId: () => string | null;

  /* legacy compat */
  activePlaylist: string | null;
  setActivePlaylist: (p: string | null) => void;
}

export const useStore = create<StoreState>((set, get) => ({
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

  setLibrary: (scan) =>
    set({
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

  playVideo: (id) =>
    set((s) => ({
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
  closePlayer: () =>
    set({ currentVideoId: null, playerMode: 'none', view: 'home' }),

  goHome: () =>
    set((s) => ({
      view: 'home',
      playerMode: s.currentVideoId ? 'mini' : 'none',
    })),

  toggleMiniPlayer: () =>
    set((s) => {
      if (!s.currentVideoId) return {};
      if (s.playerMode === 'full') return { playerMode: 'mini', view: 'home' };
      if (s.playerMode === 'mini') return { playerMode: 'full', view: 'playing' };
      return {};
    }),

  setTheaterMode: (on) => set({ theaterMode: on }),

  viewImage: (id) => set({ currentImageId: id, view: 'viewing_image' }),
  closeImage: () => set({ currentImageId: null, view: 'home' }),

  setVideoMeta: (id, meta) =>
    set((s) => ({
      videoMeta: { ...s.videoMeta, [id]: { ...s.videoMeta[id], ...meta } },
    })),

  setPlaybackQueue: (ids) => {
    const cur = get().playbackQueue;
    if (cur.length === ids.length && cur.every((x, i) => x === ids[i])) return;
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
    if (playbackQueue.length === 0) return null;
    if (!currentVideoId) return playbackQueue[0];
    const idx = playbackQueue.indexOf(currentVideoId);
    if (idx < 0) return playbackQueue[0];
    if (idx >= playbackQueue.length - 1) return playbackQueue[0]; // loop
    return playbackQueue[idx + 1];
  },
}));
