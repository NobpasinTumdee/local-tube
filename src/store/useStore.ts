import { create } from 'zustand';
import type { MediaEntry, ScanResult, FolderNode } from '../utils/directoryScanner';

export interface VideoMeta {
  thumbnailUrl?: string;
  duration?: number;
}

/* ─────────────────────────────────────────────────────────────
 *  THEMES
 * ─────────────────────────────────────────────────────────────
 *  Single source of truth for the theme system. Each entry pairs a
 *  `body` class (see index.css) with the swatch colors the UI shows so
 *  users can preview + pick. `id` maps to the `theme-<id>` class.
 * ───────────────────────────────────────────────────────────── */
export type ThemeId =
  | 'dark'
  | 'oled'
  | 'terminal'
  | 'deepsea'
  | 'cyberpunk'
  | 'light';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  description: string;
  /** Preview swatch colors (must mirror the CSS variables in index.css). */
  swatch: {
    bg: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
  };
}

export const THEMES: ThemeDef[] = [
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
const DEFAULT_THEME: ThemeId = 'dark';

function isThemeId(v: string | null): v is ThemeId {
  return !!v && THEMES.some((t) => t.id === v);
}

/** Read the persisted theme (falls back to the default). */
export function getInitialTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    /* localStorage unavailable — ignore */
  }
  return DEFAULT_THEME;
}

/** Apply a theme to <body> (and persist it). Safe to call before render. */
export function applyTheme(id: ThemeId) {
  document.body.className = `theme-${id}`;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* ignore persistence failures */
  }
}

export type PlayerMode = 'none' | 'full' | 'mini';
export type View = 'home' | 'playing' | 'viewing_image';
export type HomeFilter = 'all' | 'videos' | 'images';
export type ViewMode = 'nested' | 'flat';

const RECENT_LIMIT = 12;

/* ─────────────────────────────────────────────────────────────
 *  MULTI-VIDEO LAYOUT
 * ─────────────────────────────────────────────────────────────
 *  A parallel "layout mode" that plays several videos at once in a
 *  CSS-grid. It coexists with the single-video player (which keeps
 *  the mini-player, Up Next & autoplay countdown) — enabling layout
 *  mode simply renders the grid instead.
 *
 *  `activeVideos` is a SLOT array (index = grid position, null = empty)
 *  so drag-and-drop / click-to-fill can target a specific cell.
 * ───────────────────────────────────────────────────────────── */
export type LayoutTemplateId = 'single' | 'sideBySide' | 'onePlusTwo' | 'grid2x2' | 'custom';

export interface LayoutTemplateDef {
  id: LayoutTemplateId;
  name: string;
  /** Nominal slot count. 'custom' auto-arranges up to LAYOUT_MAX_SLOTS. */
  slots: number;
}

/* Hard cap on simultaneous videos — see the Performance notes below. */
export const LAYOUT_MAX_SLOTS = 4;

export const LAYOUT_TEMPLATES: LayoutTemplateDef[] = [
  { id: 'single', name: 'Single', slots: 1 },
  { id: 'sideBySide', name: 'Side by Side', slots: 2 },
  { id: 'onePlusTwo', name: '1 + 2', slots: 3 },
  { id: 'grid2x2', name: '2 × 2', slots: 4 },
  { id: 'custom', name: 'Auto', slots: LAYOUT_MAX_SLOTS },
];

const templateById = (id: LayoutTemplateId) =>
  LAYOUT_TEMPLATES.find((t) => t.id === id) ?? LAYOUT_TEMPLATES[0];

/** Build a fresh slot array for a template (all empty). */
function emptySlots(id: LayoutTemplateId): (string | null)[] {
  if (id === 'custom') return [null];
  return Array.from({ length: templateById(id).slots }, () => null);
}

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

  /* theming */
  currentTheme: ThemeId;

  /* multi-video layout */
  layoutMode: boolean;
  currentLayoutTemplate: LayoutTemplateId;
  activeVideos: (string | null)[]; // slot array; null = empty cell

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

  /* theming */
  setTheme: (id: ThemeId) => void;

  /* multi-video layout actions */
  setLayoutMode: (on: boolean) => void;
  toggleLayoutMode: () => void;
  setLayoutTemplate: (id: LayoutTemplateId) => void;
  addToLayout: (videoId: string, slot?: number) => void;
  removeFromLayout: (slot: number) => void;
  swapSlots: (a: number, b: number) => void;
  clearLayout: () => void;

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

  currentTheme: getInitialTheme(),

  layoutMode: false,
  currentLayoutTemplate: 'grid2x2',
  activeVideos: emptySlots('grid2x2'),

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

  setTheme: (id) => {
    applyTheme(id);
    set({ currentTheme: id });
  },

  /* ── multi-video layout ── */
  setLayoutMode: (on) =>
    set((s) => {
      if (!on) return { layoutMode: false };
      /* Smooth handoff: seed slot 0 with the single video that was playing */
      const slots: (string | null)[] = [...s.activeVideos];
      let anyFilled = false;
      for (const x of slots) if (x != null) { anyFilled = true; break; }
      if (s.currentVideoId && !anyFilled) slots[0] = s.currentVideoId;
      return { layoutMode: true, activeVideos: slots };
    }),

  toggleLayoutMode: () => get().setLayoutMode(!get().layoutMode),

  setLayoutTemplate: (id) =>
    set((s) => {
      const tpl = templateById(id);
      let slots: (string | null)[];
      if (id === 'custom') {
        /* keep what's there (compacted to real entries), capped at MAX */
        slots = s.activeVideos.filter((x) => x != null).slice(0, LAYOUT_MAX_SLOTS);
        if (slots.length === 0) slots = [null];
      } else {
        /* resize to the fixed slot count, preserving slot order */
        slots = Array.from({ length: tpl.slots }, (_, i) => s.activeVideos[i] ?? null);
      }
      return { currentLayoutTemplate: id, activeVideos: slots, layoutMode: true };
    }),

  addToLayout: (videoId, slot) =>
    set((s) => {
      const slots = [...s.activeVideos];
      if (slot != null) {
        if (slot < 0 || slot >= LAYOUT_MAX_SLOTS) return {};
        while (slots.length <= slot) slots.push(null); // grow for 'custom'
        slots[slot] = videoId;
        return { activeVideos: slots, layoutMode: true };
      }
      /* no target slot → fill the first empty cell */
      const empty = slots.indexOf(null);
      if (empty >= 0) {
        slots[empty] = videoId;
        return { activeVideos: slots, layoutMode: true };
      }
      /* full: 'custom' grows, fixed templates replace the last slot */
      if (s.currentLayoutTemplate === 'custom' && slots.length < LAYOUT_MAX_SLOTS) {
        slots.push(videoId);
      } else {
        slots[slots.length - 1] = videoId;
      }
      return { activeVideos: slots, layoutMode: true };
    }),

  removeFromLayout: (slot) =>
    set((s) => {
      const slots = [...s.activeVideos];
      if (slot < 0 || slot >= slots.length) return {};
      if (s.currentLayoutTemplate === 'custom') {
        slots.splice(slot, 1);
        if (slots.length === 0) slots.push(null);
      } else {
        slots[slot] = null;
      }
      return { activeVideos: slots };
    }),

  swapSlots: (a, b) =>
    set((s) => {
      const slots = [...s.activeVideos];
      if (a < 0 || b < 0 || a >= slots.length || b >= slots.length || a === b) return {};
      [slots[a], slots[b]] = [slots[b], slots[a]];
      return { activeVideos: slots };
    }),

  clearLayout: () =>
    set((s) => ({ activeVideos: emptySlots(s.currentLayoutTemplate) })),

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
