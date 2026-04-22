import { create } from 'zustand';
import type { VideoEntry, ScanResult } from '../utils/directoryScanner';

export interface VideoMeta {
  thumbnailUrl?: string;
  duration?: number;
}

interface StoreState {
  /* library */
  rootName: string;
  videos: VideoEntry[];
  playlists: string[];

  /* navigation */
  activePlaylist: string | null;
  searchQuery: string;
  sidebarOpen: boolean;

  /* player */
  currentVideoId: string | null;
  theaterMode: boolean;

  /* per‑video lazily loaded meta (thumbnail + duration) */
  videoMeta: Record<string, VideoMeta>;

  /* actions */
  setLibrary: (scan: ScanResult) => void;
  setActivePlaylist: (p: string | null) => void;
  setSearchQuery: (q: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  playVideo: (id: string | null) => void;
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

  currentVideoId: null,
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
      videoMeta: {},
    }),

  setActivePlaylist: (p) => set({ activePlaylist: p, searchQuery: '' }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  playVideo: (id) => set({ currentVideoId: id }),
  setTheaterMode: (on) => set({ theaterMode: on }),

  setVideoMeta: (id, meta) =>
    set((s) => ({
      videoMeta: { ...s.videoMeta, [id]: { ...s.videoMeta[id], ...meta } },
    })),
}));
