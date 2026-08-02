import type { LayoutTemplateId } from '../store/useStore';

/* Drag-and-drop payload types (media cards → slots, and slot ↔ slot). */
export const DND_MEDIA_ID = 'application/x-localtube-media';
export const DND_SLOT = 'application/x-localtube-slot';

/*
 * Maps a layout template → Tailwind CSS-Grid classes.
 *
 * The literal class strings below are what Tailwind's JIT scanner picks up,
 * so every grid-cols/grid-rows/col-span/row-span used here is guaranteed to
 * exist in the final CSS (don't build these class names dynamically elsewhere).
 */
export interface GridConfig {
  /** Container grid classes (columns + rows). */
  container: string;
  /** Per-slot span classes, by slot index. */
  spanFor: (index: number) => string;
}

const noSpan = () => '';

/* '1 large + 2 small' — first cell spans the full height on the left. */
const onePlusTwo: GridConfig = {
  container: 'grid-cols-3 grid-rows-2',
  spanFor: (i) => (i === 0 ? 'col-span-2 row-span-2' : 'col-span-1 row-span-1'),
};

export function getGridConfig(id: LayoutTemplateId, length: number): GridConfig {
  switch (id) {
    case 'single':
      return { container: 'grid-cols-1 grid-rows-1', spanFor: noSpan };
    case 'sideBySide':
      return { container: 'grid-cols-2 grid-rows-1', spanFor: noSpan };
    case 'onePlusTwo':
      return onePlusTwo;
    case 'grid2x2':
      return { container: 'grid-cols-2 grid-rows-2', spanFor: noSpan };
    case 'custom': {
      /* 'Auto' — the grid reshapes itself to however many cells exist. */
      const n = Math.max(1, length);
      if (n <= 1) return { container: 'grid-cols-1 grid-rows-1', spanFor: noSpan };
      if (n === 2) return { container: 'grid-cols-2 grid-rows-1', spanFor: noSpan };
      if (n === 3) return onePlusTwo;
      return { container: 'grid-cols-2 grid-rows-2', spanFor: noSpan };
    }
    default:
      return { container: 'grid-cols-1 grid-rows-1', spanFor: noSpan };
  }
}
