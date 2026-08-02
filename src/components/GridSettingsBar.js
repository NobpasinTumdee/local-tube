import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { RectangleHorizontal, RectangleVertical, Square, Columns3 } from 'lucide-react';
import { useStore } from '../store/useStore';
/*
 * Display controls for the uniform media grid: card aspect-ratio selector +
 * column-count selector. Both write to persisted store prefs, so MediaGrid /
 * MediaCard re-render and Framer Motion `layout` animates the reflow.
 */
const ASPECTS = [
    { value: '16/9', label: 'Landscape', icon: _jsx(RectangleHorizontal, { className: "h-4 w-4" }) },
    { value: '9/16', label: 'Portrait', icon: _jsx(RectangleVertical, { className: "h-4 w-4" }) },
    { value: '1/1', label: 'Square', icon: _jsx(Square, { className: "h-4 w-4" }) },
];
const COLUMNS = ['auto', 2, 3, 4, 5, 6];
export default function GridSettingsBar() {
    const cardAspectRatio = useStore((s) => s.cardAspectRatio);
    const setCardAspectRatio = useStore((s) => s.setCardAspectRatio);
    const gridColumns = useStore((s) => s.gridColumns);
    const setGridColumns = useStore((s) => s.setGridColumns);
    return (_jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [_jsx("div", { className: "flex items-center gap-0.5 rounded-xl border border-content/[0.06] bg-content/[0.03] p-1", role: "group", "aria-label": "Card shape", children: ASPECTS.map((a) => {
                    const active = cardAspectRatio === a.value;
                    return (_jsx("button", { onClick: () => setCardAspectRatio(a.value), title: a.label, "aria-label": a.label, "aria-pressed": active, className: `flex h-8 w-8 items-center justify-center rounded-lg transition ${active ? 'bg-primary/20 text-primary' : 'text-content/45 hover:bg-content/10 hover:text-content'}`, children: a.icon }, a.value));
                }) }), _jsxs("div", { className: "flex items-center gap-0.5 rounded-xl border border-content/[0.06] bg-content/[0.03] p-1", role: "group", "aria-label": "Columns", children: [_jsx("span", { className: "flex h-8 items-center pl-1.5 pr-0.5 text-content/30", title: "Columns", children: _jsx(Columns3, { className: "h-4 w-4" }) }), COLUMNS.map((c) => {
                        const active = gridColumns === c;
                        return (_jsx("button", { onClick: () => setGridColumns(c), title: c === 'auto' ? 'Auto (responsive)' : `${c} columns`, "aria-pressed": active, className: `flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${active ? 'bg-primary/20 text-primary' : 'text-content/45 hover:bg-content/10 hover:text-content'}`, children: c === 'auto' ? 'Auto' : c }, String(c)));
                    })] })] }));
}
