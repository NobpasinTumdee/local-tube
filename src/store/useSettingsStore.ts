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
      }),
    },
  ),
);
