/* Drag-and-drop payload types (media cards → slots, and slot ↔ slot). */
export const DND_MEDIA_ID = 'application/x-localtube-media';
export const DND_SLOT = 'application/x-localtube-slot';
export function getGridConfig(t, opts) {
    let cols = t.cols;
    let rows = t.rows;
    let spans = t.spans;
    if (t.id === 'auto') {
        /* 'Auto' reshapes itself to however many cells exist. */
        const n = Math.max(1, opts.length);
        if (n <= 1) {
            cols = 1;
            rows = 1;
            spans = undefined;
        }
        else if (n === 2) {
            cols = 2;
            rows = 1;
            spans = undefined;
        }
        else if (n === 3) {
            cols = 3;
            rows = 2;
            spans = { 0: { col: 2, row: 2 } };
        }
        else {
            cols = 2;
            rows = 2;
            spans = undefined;
        }
    }
    else if (t.id === 'custom') {
        cols = Math.max(1, opts.cols);
        rows = Math.max(1, opts.rows);
        spans = undefined;
    }
    return {
        style: {
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        },
        slotStyle: (i) => {
            const s = spans?.[i];
            if (!s)
                return undefined;
            return {
                gridColumn: s.col ? `span ${s.col} / span ${s.col}` : undefined,
                gridRow: s.row ? `span ${s.row} / span ${s.row}` : undefined,
            };
        },
    };
}
