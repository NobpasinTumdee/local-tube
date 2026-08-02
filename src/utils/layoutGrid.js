/* Drag-and-drop payload types (media cards → slots, and slot ↔ slot). */
export const DND_MEDIA_ID = 'application/x-localtube-media';
export const DND_SLOT = 'application/x-localtube-slot';
const noSpan = () => '';
/* '1 large + 2 small' — first cell spans the full height on the left. */
const onePlusTwo = {
    container: 'grid-cols-3 grid-rows-2',
    spanFor: (i) => (i === 0 ? 'col-span-2 row-span-2' : 'col-span-1 row-span-1'),
};
export function getGridConfig(id, length) {
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
            if (n <= 1)
                return { container: 'grid-cols-1 grid-rows-1', spanFor: noSpan };
            if (n === 2)
                return { container: 'grid-cols-2 grid-rows-1', spanFor: noSpan };
            if (n === 3)
                return onePlusTwo;
            return { container: 'grid-cols-2 grid-rows-2', spanFor: noSpan };
        }
        default:
            return { container: 'grid-cols-1 grid-rows-1', spanFor: noSpan };
    }
}
