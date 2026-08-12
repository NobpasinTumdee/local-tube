import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getFolderNode } from '../utils/directoryScanner';
import type { MediaEntry, ScanResult, FolderNode, MountedRoot } from '../utils/directoryScanner';

/* ─────────────────────────────────────────────────────────────
 *  LEGACY MEDIA-ID MIGRATION
 * ─────────────────────────────────────────────────────────────
 *  Before the multi-path workspace, a MediaEntry id was the path relative to
 *  the single picked folder ("Action/hero.mp4"). Ids are now mount-prefixed
 *  ("MyVideos/Action/hero.mp4") so files from different folders can't collide.
 *
 *  That rename would silently orphan every favorite, tag and resume position
 *  saved by an existing user. This walks the persisted keys once per scan and
 *  re-points any id that no longer resolves but has exactly one unambiguous
 *  match under a mount prefix. Ambiguous matches are left alone — losing a
 *  favorite is recoverable, attaching it to the wrong file is not.
 * ───────────────────────────────────────────────────────────── */
export function buildLegacyIdMap(
  videos: readonly MediaEntry[],
  knownIds: Iterable<string>,
): Map<string, string> {
  const current = new Set(videos.map((v) => v.id));
  const remap = new Map<string, string>();

  /* suffix ("Action/hero.mp4") → the ids that end with it */
  const bySuffix = new Map<string, string[]>();
  for (const v of videos) {
    const suffix = v.id.slice(v.rootFolderName.length + 1);
    const list = bySuffix.get(suffix);
    if (list) list.push(v.id);
    else bySuffix.set(suffix, [v.id]);
  }

  for (const oldId of knownIds) {
    if (current.has(oldId)) continue; // still valid — nothing to do
    const matches = bySuffix.get(oldId);
    if (matches?.length === 1) remap.set(oldId, matches[0]);
  }
  return remap;
}

/** Applies a legacy→current id map across every persisted user-data shape. */
function applyIdRemap(
  s: Pick<StoreState, 'favorites' | 'virtualPlaylists' | 'mediaTags' | 'playbackProgress'>,
  remap: Map<string, string>,
) {
  const to = (id: string) => remap.get(id) ?? id;
  const remapRecord = <T>(rec: Record<string, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(rec)) out[to(k)] = v;
    return out;
  };
  return {
    favorites: [...new Set(s.favorites.map(to))],
    virtualPlaylists: s.virtualPlaylists.map((p) => ({
      ...p,
      mediaIds: [...new Set(p.mediaIds.map(to))],
    })),
    mediaTags: remapRecord(s.mediaTags),
    playbackProgress: remapRecord(s.playbackProgress),
  };
}

/* ─────────────────────────────────────────────────────────────
 *  VIRTUAL PLAYLISTS & FAVORITES
 * ─────────────────────────────────────────────────────────────
 *  These never move physical files — they're pure browser state keyed by a
 *  stable `mediaId`. That id is simply `MediaEntry.id`, which the scanner
 *  already sets to the file's relative path + name (e.g. "Movies/Action/hero.mp4"),
 *  so favorites/playlists survive re-scans of the same folder.
 *
 *  Only `favorites` and `virtualPlaylists` are persisted to localStorage (see
 *  the persist() partialize below) — the live library (file handles, blob URLs)
 *  is intentionally NOT serialized.
 * ───────────────────────────────────────────────────────────── */
export interface VirtualPlaylist {
  id: string;
  title: string;
  createdAt: number;
  mediaIds: string[];
}

/** Which "virtual collection" the main view is showing. */
export type CollectionFilter =
  | { type: 'all' }
  | { type: 'favorites' }
  | { type: 'playlist'; playlistId: string }
  /* Membership lives in useVaultStore (encrypted at rest), not here — this
     is only the view selector. Selecting it while locked shows nothing. */
  | { type: 'vault' };

/** Restorable user data (see utils/backupUtils for export/import). */
export interface ImportedUserData {
  favorites: string[];
  virtualPlaylists: VirtualPlaylist[];
  mediaTags: Record<string, string[]>;
  currentTheme?: ThemeId;
  playbackProgress: Record<string, number>;
}

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);

/** Normalize a raw tag input: trim, strip leading '#', collapse whitespace. */
export const normalizeTag = (raw: string) => raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim();

export interface VideoMeta {
  thumbnailUrl?: string;
  duration?: number;
  /** Source pixel dimensions (video frame or image), when known. */
  width?: number;
  height?: number;
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

/* Display preferences for the uniform media grid. */
export type CardAspectRatio = '16/9' | '9/16' | '1/1';
export type GridColumns = 'auto' | 2 | 3 | 4 | 5 | 6;

const RECENT_LIMIT = 12;

/* ─────────────────────────────────────────────────────────────
 *  MULTI-MEDIA LAYOUT
 * ─────────────────────────────────────────────────────────────
 *  A parallel "layout mode" that shows several media items at once in
 *  a CSS-grid — videos AND images, freely mixed. It coexists with the
 *  single-video player (which keeps the mini-player, Up Next & autoplay
 *  countdown) — enabling layout mode simply renders the grid instead.
 *
 *  `activeMedia` is a SLOT array of media ids (index = grid position,
 *  null = empty) so drag-and-drop / click-to-fill can target a cell.
 *  Each id resolves to a MediaEntry whose `mediaType` decides how the
 *  slot renders (video player vs. image viewer).
 * ───────────────────────────────────────────────────────────── */
export type LayoutTemplateId =
  | 'single'
  | 'sideBySide'
  | 'stacked'
  | 'threeCol'
  | 'onePlusTwo'
  | 'featured'
  | 'grid2x2'
  | 'grid3x2'
  | 'grid3x3'
  | 'auto'
  | 'custom';

export interface LayoutTemplateDef {
  id: LayoutTemplateId;
  name: string;
  /** Grid shape. For 'auto' these are placeholders (it adapts to item count);
   *  for 'custom' the live size comes from customCols/customRows in state. */
  cols: number;
  rows: number;
  /** Nominal cell count (auto/custom are computed from state via slotCountFor). */
  slots: number;
  /** Optional per-slot spans for asymmetric templates (slot → span counts). */
  spans?: Record<number, { col?: number; row?: number }>;
}

/* Hard cap on simultaneous tiles (custom grids go up to 4×4). Videos are muted
 * + preload=metadata, but large grids still cost decode/bandwidth — see notes. */
export const LAYOUT_MAX_SLOTS = 16;
export const CUSTOM_MIN = 1;
export const CUSTOM_MAX = 4;

export const LAYOUT_TEMPLATES: LayoutTemplateDef[] = [
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

export const templateById = (id: LayoutTemplateId) =>
  LAYOUT_TEMPLATES.find((t) => t.id === id) ?? LAYOUT_TEMPLATES[0];

/** Number of cells a template currently occupies. */
export function slotCountFor(id: LayoutTemplateId, customCols: number, customRows: number): number {
  if (id === 'auto') return 1; // grows as items are added
  if (id === 'custom') return Math.max(1, customCols * customRows);
  return templateById(id).slots;
}

/** Build a fresh slot array of `n` empty cells. */
function emptySlots(n: number): (string | null)[] {
  return Array.from({ length: Math.max(1, n) }, () => null);
}

interface StoreState {
  /* library */
  rootName: string;
  videos: MediaEntry[];
  playlists: string[];
  directoryTree: FolderNode | null;
  /** The folders mounted into the current workspace (see useLibraryStore). */
  roots: MountedRoot[];
  /** True while a workspace scan is walking the mounted folders. */
  scanning: boolean;
  /** Files discovered so far by the in-flight scan. */
  scanProgress: number;

  /* navigation */
  currentFolderPath: string;   // '' = root
  searchQuery: string;
  sidebarOpen: boolean;
  view: View;
  homeFilter: HomeFilter;
  viewMode: ViewMode;

  /* display preferences (persisted) */
  cardAspectRatio: CardAspectRatio;
  gridColumns: GridColumns;
  isAmbientMode: boolean;   // cinema-glow behind the player

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

  /* multi-media layout */
  layoutMode: boolean;
  currentLayoutTemplate: LayoutTemplateId;
  activeMedia: (string | null)[]; // slot array; null = empty cell
  customCols: number;             // user-defined grid size (for 'custom' template)
  customRows: number;

  /* virtual playlists & favorites (persisted) */
  favorites: string[];            // mediaId list
  virtualPlaylists: VirtualPlaylist[];
  collection: CollectionFilter;   // which virtual view the grid shows

  /* custom tags (mediaTags persisted; activeFilterTags is a transient view filter) */
  mediaTags: Record<string, string[]>;  // mediaId → tags
  activeFilterTags: string[];

  /* continue watching (persisted): mediaId → seconds */
  playbackProgress: Record<string, number>;

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
  setScanning: (on: boolean, progress?: number) => void;
  setCurrentFolder: (path: string) => void;
  setSearchQuery: (q: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setHomeFilter: (f: HomeFilter) => void;
  setViewMode: (m: ViewMode) => void;
  setCardAspectRatio: (r: CardAspectRatio) => void;
  setGridColumns: (c: GridColumns) => void;
  setAmbientMode: (on: boolean) => void;
  toggleAmbientMode: () => void;

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
  setCustomGrid: (cols: number, rows: number) => void;

  /* favorites & virtual playlist actions */
  toggleFavorite: (mediaId: string) => void;
  createPlaylist: (title: string) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, title: string) => void;
  addToPlaylist: (playlistId: string, mediaId: string) => void;
  removeFromPlaylist: (playlistId: string, mediaId: string) => void;
  togglePlaylistItem: (playlistId: string, mediaId: string) => void;
  setCollection: (c: CollectionFilter) => void;

  /* custom tag actions */
  addTag: (mediaId: string, tag: string) => void;
  removeTag: (mediaId: string, tag: string) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;

  /* continue watching + backup/restore */
  setPlaybackProgress: (mediaId: string, seconds: number) => void;
  applyImportedData: (data: ImportedUserData) => void;

  /* queue / recent */
  setPlaybackQueue: (ids: string[]) => void;
  getNextVideoId: () => string | null;

  /* legacy compat */
  activePlaylist: string | null;
  setActivePlaylist: (p: string | null) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
  rootName: '',
  videos: [],
  playlists: [],
  directoryTree: null,
  roots: [],
  scanning: false,
  scanProgress: 0,

  currentFolderPath: '',
  searchQuery: '',
  sidebarOpen: true,
  view: 'home',
  homeFilter: 'all',
  viewMode: 'nested',

  /* display preferences — rehydrated by persist */
  cardAspectRatio: '16/9',
  gridColumns: 'auto',
  isAmbientMode: true,

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

  /*
   * Called on every workspace change, not just once at startup — mounting or
   * unmounting a folder re-scans. So this preserves as much context as the new
   * library still supports instead of resetting the app: a video keeps playing
   * while you add a folder, and thumbnails already generated are not thrown
   * away and recomputed.
   */
  setLibrary: (scan) =>
    set((s) => {
      const ids = new Set(scan.videos.map((v) => v.id));

      /* One-time id migration for libraries saved before mount prefixes. */
      const remap = buildLegacyIdMap(scan.videos, [
        ...s.favorites,
        ...Object.keys(s.mediaTags),
        ...Object.keys(s.playbackProgress),
        ...s.virtualPlaylists.flatMap((p) => p.mediaIds),
      ]);
      const migrated = remap.size ? applyIdRemap(s, remap) : null;

      /* Keep meta for files that survived; revoke blob: URLs for the rest so
         they don't leak. Video thumbnails are inline data: URLs — nothing to
         revoke. Purely local cleanup; nothing leaves the browser. */
      const videoMeta: Record<string, VideoMeta> = {};
      for (const [id, m] of Object.entries(s.videoMeta)) {
        const liveId = remap.get(id) ?? id;
        if (ids.has(liveId)) videoMeta[liveId] = m;
        else if (m.thumbnailUrl?.startsWith('blob:')) URL.revokeObjectURL(m.thumbnailUrl);
      }

      /* A folder path survives if the tree still contains it. */
      const folderStillExists =
        s.currentFolderPath === '' || !!getFolderNode(scan.directoryTree, s.currentFolderPath);
      const currentVideoId = s.currentVideoId && ids.has(s.currentVideoId) ? s.currentVideoId : null;
      const currentImageId = s.currentImageId && ids.has(s.currentImageId) ? s.currentImageId : null;

      return {
        rootName: scan.rootName,
        videos: scan.videos,
        playlists: scan.playlists,
        directoryTree: scan.directoryTree,
        roots: scan.roots,
        currentFolderPath: folderStillExists ? s.currentFolderPath : '',
        activePlaylist: null,
        searchQuery: '',
        currentVideoId,
        currentImageId,
        playerMode: currentVideoId ? s.playerMode : 'none',
        view: currentVideoId && s.view === 'playing' ? 'playing' : 'home',
        videoMeta,
        playbackQueue: [],
        recentVideoIds: s.recentVideoIds.map((id) => remap.get(id) ?? id).filter((id) => ids.has(id)),
        activeMedia: s.activeMedia.map((id) => {
          if (id == null) return null;
          const liveId = remap.get(id) ?? id;
          return ids.has(liveId) ? liveId : null;
        }),
        activeFilterTags: [],
        /* favorites, virtualPlaylists & mediaTags survive re-scans by design */
        ...(migrated ?? {}),
      };
    }),

  setScanning: (on, progress) =>
    set((s) => ({ scanning: on, scanProgress: on ? progress ?? s.scanProgress : 0 })),

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
  setCardAspectRatio: (r) => set({ cardAspectRatio: r }),
  setGridColumns: (c) => set({ gridColumns: c }),
  setAmbientMode: (on) => set({ isAmbientMode: on }),
  toggleAmbientMode: () => set((s) => ({ isAmbientMode: !s.isAmbientMode })),

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
      const slots: (string | null)[] = [...s.activeMedia];
      let anyFilled = false;
      for (const x of slots) if (x != null) { anyFilled = true; break; }
      if (s.currentVideoId && !anyFilled) slots[0] = s.currentVideoId;
      return { layoutMode: true, activeMedia: slots };
    }),

  toggleLayoutMode: () => get().setLayoutMode(!get().layoutMode),

  setLayoutTemplate: (id) =>
    set((s) => {
      let slots: (string | null)[];
      if (id === 'auto') {
        /* adaptive: keep only the real entries (grid reshapes to the count) */
        slots = s.activeMedia.filter((x) => x != null).slice(0, LAYOUT_MAX_SLOTS);
        if (slots.length === 0) slots = [null];
      } else {
        /* resize to this template's cell count, preserving slot order */
        const n = slotCountFor(id, s.customCols, s.customRows);
        slots = Array.from({ length: n }, (_, i) => s.activeMedia[i] ?? null);
      }
      return { currentLayoutTemplate: id, activeMedia: slots, layoutMode: true };
    }),

  addToLayout: (videoId, slot) =>
    set((s) => {
      const slots = [...s.activeMedia];
      const isAuto = s.currentLayoutTemplate === 'auto';
      if (slot != null) {
        if (slot < 0 || slot >= LAYOUT_MAX_SLOTS) return {};
        if (slot >= slots.length) {
          if (!isAuto) return {}; // fixed grids can't grow past their cells
          while (slots.length <= slot) slots.push(null);
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
      } else {
        slots[slots.length - 1] = videoId;
      }
      return { activeMedia: slots, layoutMode: true };
    }),

  removeFromLayout: (slot) =>
    set((s) => {
      const slots = [...s.activeMedia];
      if (slot < 0 || slot >= slots.length) return {};
      if (s.currentLayoutTemplate === 'auto') {
        /* adaptive grid compacts so the layout reflows */
        slots.splice(slot, 1);
        if (slots.length === 0) slots.push(null);
      } else {
        slots[slot] = null;
      }
      return { activeMedia: slots };
    }),

  swapSlots: (a, b) =>
    set((s) => {
      const slots = [...s.activeMedia];
      if (a < 0 || b < 0 || a >= slots.length || b >= slots.length || a === b) return {};
      [slots[a], slots[b]] = [slots[b], slots[a]];
      return { activeMedia: slots };
    }),

  clearLayout: () =>
    set((s) => ({ activeMedia: emptySlots(slotCountFor(s.currentLayoutTemplate, s.customCols, s.customRows)) })),

  setCustomGrid: (cols, rows) =>
    set((s) => {
      const c = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, Math.round(cols)));
      const r = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, Math.round(rows)));
      /* If the custom grid is live, resize its slots (preserving order). */
      const activeMedia =
        s.currentLayoutTemplate === 'custom'
          ? Array.from({ length: c * r }, (_, i) => s.activeMedia[i] ?? null)
          : s.activeMedia;
      return { customCols: c, customRows: r, activeMedia };
    }),

  /* ── favorites & virtual playlists ── */
  toggleFavorite: (mediaId) =>
    set((s) => ({
      favorites: s.favorites.includes(mediaId)
        ? s.favorites.filter((x) => x !== mediaId)
        : [mediaId, ...s.favorites],
    })),

  createPlaylist: (title) => {
    const id = newId();
    const playlist: VirtualPlaylist = {
      id,
      title: title.trim() || 'New Playlist',
      createdAt: Date.now(),
      mediaIds: [],
    };
    set((s) => ({ virtualPlaylists: [...s.virtualPlaylists, playlist] }));
    return id;
  },

  deletePlaylist: (id) =>
    set((s) => ({
      virtualPlaylists: s.virtualPlaylists.filter((p) => p.id !== id),
      /* if we were viewing it, fall back to the whole library */
      collection:
        s.collection.type === 'playlist' && s.collection.playlistId === id
          ? { type: 'all' }
          : s.collection,
    })),

  renamePlaylist: (id, title) =>
    set((s) => ({
      virtualPlaylists: s.virtualPlaylists.map((p) =>
        p.id === id ? { ...p, title: title.trim() || p.title } : p,
      ),
    })),

  addToPlaylist: (playlistId, mediaId) =>
    set((s) => ({
      virtualPlaylists: s.virtualPlaylists.map((p) =>
        p.id === playlistId && !p.mediaIds.includes(mediaId)
          ? { ...p, mediaIds: [...p.mediaIds, mediaId] }
          : p,
      ),
    })),

  removeFromPlaylist: (playlistId, mediaId) =>
    set((s) => ({
      virtualPlaylists: s.virtualPlaylists.map((p) =>
        p.id === playlistId ? { ...p, mediaIds: p.mediaIds.filter((x) => x !== mediaId) } : p,
      ),
    })),

  togglePlaylistItem: (playlistId, mediaId) =>
    set((s) => ({
      virtualPlaylists: s.virtualPlaylists.map((p) => {
        if (p.id !== playlistId) return p;
        const has = p.mediaIds.includes(mediaId);
        return { ...p, mediaIds: has ? p.mediaIds.filter((x) => x !== mediaId) : [...p.mediaIds, mediaId] };
      }),
    })),

  setCollection: (c) => set({ collection: c, searchQuery: '' }),

  /* ── custom tags ── */
  addTag: (mediaId, raw) =>
    set((s) => {
      const tag = normalizeTag(raw);
      if (!tag) return {};
      const cur = s.mediaTags[mediaId] ?? [];
      if (cur.includes(tag)) return {};
      return { mediaTags: { ...s.mediaTags, [mediaId]: [...cur, tag] } };
    }),

  removeTag: (mediaId, tag) =>
    set((s) => {
      const cur = s.mediaTags[mediaId];
      if (!cur || !cur.includes(tag)) return {};
      const next = cur.filter((t) => t !== tag);
      const mediaTags = { ...s.mediaTags };
      if (next.length) mediaTags[mediaId] = next;
      else delete mediaTags[mediaId];
      return { mediaTags };
    }),

  toggleFilterTag: (tag) =>
    set((s) => ({
      activeFilterTags: s.activeFilterTags.includes(tag)
        ? s.activeFilterTags.filter((t) => t !== tag)
        : [...s.activeFilterTags, tag],
    })),

  clearFilterTags: () => set({ activeFilterTags: [] }),

  /* ── continue watching + backup/restore ── */
  setPlaybackProgress: (mediaId, seconds) =>
    set((s) => {
      const pp = { ...s.playbackProgress };
      /* clear when finished / barely started, otherwise store whole seconds */
      if (!Number.isFinite(seconds) || seconds < 3) delete pp[mediaId];
      else pp[mediaId] = Math.floor(seconds);
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
    if (data.currentTheme) get().setTheme(data.currentTheme);
  },

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
    }),
    {
      name: 'localtube:collections',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      /* Persist ONLY user customizations — never the live library/handles. */
      partialize: (s) => ({
        favorites: s.favorites,
        virtualPlaylists: s.virtualPlaylists,
        mediaTags: s.mediaTags,
        playbackProgress: s.playbackProgress,
        cardAspectRatio: s.cardAspectRatio,
        gridColumns: s.gridColumns,
        isAmbientMode: s.isAmbientMode,
      }),
    },
  ),
);
