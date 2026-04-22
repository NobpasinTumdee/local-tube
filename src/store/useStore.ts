import { create } from 'zustand';
import type { MediaEntry, ScanResult } from '../utils/directoryScanner';

export interface VideoMeta {
  thumbnailUrl?: string;
  duration?: number;
}

export type PlayerMode = 'none' | 'full' | 'mini';
export type View = 'home' | 'playing' | 'viewing_image';
export type HomeFilter = 'all' | 'videos' | 'images';

interface StoreState {
  /* library */
  rootName: string;
  videos: MediaEntry[];
  playlists: string[];

  /* navigation */
  activePlaylist: string | null;
  searchQuery: string;
  sidebarOpen: boolean;
  view: View;
  homeFilter: HomeFilter;

  /* video player */
  currentVideoId: string | null;
  playerMode: PlayerMode;
  theaterMode: boolean;

  /* image viewer */
  currentImageId: string | null;

  /* per‑item lazily loaded meta */
  videoMeta: Record<string, VideoMeta>;

  /* actions */
  setLibrary: (scan: ScanResult) => void;
  setActivePlaylist: (p: string | null) => void;
  setSearchQuery: (q: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setHomeFilter: (f: HomeFilter) => void;

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
}

export const useStore = create<StoreState>((set) => ({
  rootName: '',
  videos: [],
  playlists: [],

  activePlaylist: null,
  searchQuery: '',
  sidebarOpen: true,
  view: 'home',
  homeFilter: 'all',

  currentVideoId: null,
  playerMode: 'none',
  theaterMode: false,

  currentImageId: null,

  videoMeta: {},

  setLibrary: (scan) =>
    set({
      rootName: scan.rootName,
      videos: scan.videos,
      playlists: scan.playlists,
      activePlaylist: null,
      searchQuery: '',
      currentVideoId: null,
      currentImageId: null,
      playerMode: 'none',
      view: 'home',
      homeFilter: 'all',
      videoMeta: {},
    }),

  setActivePlaylist: (p) => set({ activePlaylist: p, searchQuery: '' }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setHomeFilter: (f) => set({ homeFilter: f }),

  playVideo: (id) =>
    set({ currentVideoId: id, playerMode: 'full', view: 'playing', currentImageId: null }),

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

  viewImage: (id) =>
    set({ currentImageId: id, view: 'viewing_image' }),

  closeImage: () =>
    set({ currentImageId: null, view: 'home' }),

  setVideoMeta: (id, meta) =>
    set((s) => ({
      videoMeta: { ...s.videoMeta, [id]: { ...s.videoMeta[id], ...meta } },
    })),
}));
