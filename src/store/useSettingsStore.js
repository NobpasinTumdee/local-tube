import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
export const RESOURCE_LIMITS = {
    'save-ram': { concurrency: 10, cacheLimit: 150 },
    performance: { concurrency: 24, cacheLimit: 1000 },
};
/** Non-reactive read, for the extractor and cache (not components). */
export function resourceLimits() {
    return RESOURCE_LIMITS[useSettingsStore.getState().resourceMode];
}
export const DEFAULT_STEALTH_COMBO = ['Control', 'Escape'];
export const useSettingsStore = create()(persist((set) => ({
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
}), {
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
}));
