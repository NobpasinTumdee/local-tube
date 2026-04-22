import { create } from 'zustand';
import type { VideoEntry, ScanResult } from '../utils/directoryScanner';

export interface VideoMeta {
  thumbnailUrl?: string;
  duration?: number;
}

export type PlayerMode = 'none' | 'full' | 'mini';
export type View = 'home' | 'playing';

interface StoreState {
  /* library */
  rootName: string;
  videos: VideoEntry[];
  playlists: string[];

  /* navigation */
  activePlaylist: string | null;
  searchQuery: string;
  sidebarOpen: boolean;
  view: View;

  /* player */
  currentVideoId: string | null;
  playerMode: PlayerMode;
  theaterMode: boolean;

  /* per‑video lazily loaded meta (thumbnail + duration) */
  videoMeta: Record<string, VideoMeta>;

  /* actions */
  setLibrary: (scan: ScanResult) => void;
  setActivePlaylist: (p: string | null) => void;
  setSearchQuery: (q: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  playVideo: (id: string) => void;
  closePlayer: () => void;
  goHome: () => void;
  toggleMiniPlayer: () => void;
  setTheaterMode: (on: boolean) => void;
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

  currentVideoId: null,
  playerMode: 'none',
  theaterMode: false,

  videoMeta: {},

  setLibrary: (scan) =>
    set({
      rootName: scan.rootName,
      videos: scan.videos,
      playlists: scan.playlists,
      activePlaylist: null,
      searchQuery: '',
      currentVideoId: null,
      playerMode: 'none',
      view: 'home',
      videoMeta: {},
    }),

  setActivePlaylist: (p) => set({ activePlaylist: p, searchQuery: '' }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  playVideo: (id) =>
    set({ currentVideoId: id, playerMode: 'full', view: 'playing' }),

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
      if (s.playerMode === 'full')
        return { playerMode: 'mini', view: 'home' };
      if (s.playerMode === 'mini')
        return { playerMode: 'full', view: 'playing' };
      return {};
    }),

  setTheaterMode: (on) => set({ theaterMode: on }),

  setVideoMeta: (id, meta) =>
    set((s) => ({
      videoMeta: { ...s.videoMeta, [id]: { ...s.videoMeta[id], ...meta } },
    })),
}));
