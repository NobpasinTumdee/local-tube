import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Combo } from '../utils/shortcutUtils';

/* ─────────────────────────────────────────────────────────────
 *  PRIVACY SETTINGS
 * ─────────────────────────────────────────────────────────────
 *  Kept out of the main useStore deliberately. That store persists a large
 *  blob of library/user data under one key; privacy config is small,
 *  security-relevant and read by a window-level listener that must not
 *  re-run whenever a playlist changes. Separate key, separate lifetime.
 *
 *  `isStealthActive` is NOT persisted — a panic screen that survives a
 *  reload would lock the user out of their own library with no obvious way
 *  back, and the point is to hide the screen from someone standing behind
 *  you, not to be a durable lock. (That is what the Vault is for.)
 * ───────────────────────────────────────────────────────────── */

export type StealthStyle = 'blackout' | 'terminal';

/* ─────────────────────────────────────────────────────────────
 *  RESOURCE MODE
 * ─────────────────────────────────────────────────────────────
 *  How hard the thumbnail pipeline is allowed to push the machine.
 *
 *  'save-ram'    — the default. Holds a few screens of thumbnails and
 *                  extracts ten at a time.
 *  'performance' — keeps far more decoded thumbnails resident so scrolling
 *                  back is instant, and extracts more at once.
 *
 *  Measured on a 200-file library of 47MB-540MB phone video: per-item
 *  extraction at 10 vs 24 concurrent came out 117/91ms vs 119/30ms across two
 *  runs — i.e. no reproducible gain past ~12, but no failures either (zero
 *  decoder errors at 24). The honest summary is that 24 is safe and
 *  occasionally faster, not that it is twice as fast.
 *
 *  The cache limit is the setting that actually changes what the user feels:
 *  at 150 entries, scrolling back through a big folder re-extracts; at 1000
 *  it does not.
 * ───────────────────────────────────────────────────────────── */
export type ResourceMode = 'save-ram' | 'performance';

export interface ResourceLimits {
  /** Simultaneous extractions. */
  concurrency: number;
  /** Full-size thumbnails kept before the oldest are revoked. */
  cacheLimit: number;
}

export const RESOURCE_LIMITS: Record<ResourceMode, ResourceLimits> = {
  'save-ram': { concurrency: 10, cacheLimit: 150 },
  performance: { concurrency: 24, cacheLimit: 1000 },
};

/** Non-reactive read, for the extractor and cache (not components). */
export function resourceLimits(): ResourceLimits {
  return RESOURCE_LIMITS[useSettingsStore.getState().resourceMode];
}

export const DEFAULT_STEALTH_COMBO: Combo = ['Control', 'Escape'];

interface SettingsState {
  /** Key combination that toggles the privacy screen. */
  stealthShortcut: Combo;
  /** Transient — never persisted. */
  isStealthActive: boolean;
  stealthStyle: StealthStyle;
  /**
   * Also hide when the window loses focus (alt-tab, screen share picker).
   * Off by default: it surprises people who tab away to read something.
   */
  stealthOnBlur: boolean;

  /** How much memory and CPU the thumbnail pipeline may use. */
  resourceMode: ResourceMode;

  setResourceMode: (mode: ResourceMode) => void;
  setStealthShortcut: (combo: Combo) => void;
  setStealthActive: (on: boolean) => void;
  toggleStealth: () => void;
  setStealthStyle: (style: StealthStyle) => void;
  setStealthOnBlur: (on: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      stealthShortcut: DEFAULT_STEALTH_COMBO,
      isStealthActive: false,
      stealthStyle: 'blackout',
      stealthOnBlur: false,
      resourceMode: 'save-ram',

      setResourceMode: (mode) => set({ resourceMode: mode }),
      setStealthShortcut: (combo) => set({ stealthShortcut: combo }),
      setStealthActive: (on) => set({ isStealthActive: on }),
      toggleStealth: () => set((s) => ({ isStealthActive: !s.isStealthActive })),
      setStealthStyle: (style) => set({ stealthStyle: style }),
      setStealthOnBlur: (on) => set({ stealthOnBlur: on }),
    }),
    {
      name: 'localtube:privacy',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      /* Config only — the live panic flag stays in memory. */
      partialize: (s) => ({
        stealthShortcut: s.stealthShortcut,
        stealthStyle: s.stealthStyle,
        stealthOnBlur: s.stealthOnBlur,
        resourceMode: s.resourceMode,
      }),
    },
  ),
);
