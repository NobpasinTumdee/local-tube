import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Check, Minus, Plus } from 'lucide-react';
import { useStore, LAYOUT_TEMPLATES, CUSTOM_MIN, CUSTOM_MAX } from '../store/useStore';
import { getGridConfig } from '../utils/layoutGrid';
/*
 * Header control for Multi-Media Layout mode: a toggle + a picker of grid
 * templates (each a live mini-preview built from the SAME grid config the real
 * viewer uses), plus a Custom builder with column/row steppers.
 */
export default function LayoutSelector() {
    const layoutMode = useStore((s) => s.layoutMode);
    const currentTemplate = useStore((s) => s.currentLayoutTemplate);
    const customCols = useStore((s) => s.customCols);
    const customRows = useStore((s) => s.customRows);
    const toggleLayoutMode = useStore((s) => s.toggleLayoutMode);
    const setLayoutTemplate = useStore((s) => s.setLayoutTemplate);
    const setCustomGrid = useStore((s) => s.setCustomGrid);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        function onDown(e) {
            if (rootRef.current && !rootRef.current.contains(e.target))
                setOpen(false);
        }
        function onKey(e) {
            if (e.key === 'Escape')
                setOpen(false);
        }
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);
    const customActive = layoutMode && currentTemplate === 'custom';
    return (_jsxs("div", { ref: rootRef, className: "relative shrink-0", children: [_jsxs("button", { onClick: () => setOpen((o) => !o), className: `flex h-10 items-center gap-1.5 rounded-full px-3 text-sm transition ${layoutMode ? 'bg-primary/15 text-primary' : 'text-content/80 hover:bg-content/10'}`, "aria-haspopup": "menu", "aria-expanded": open, title: "Multi-media layout", children: [_jsx(LayoutGrid, { className: "h-5 w-5" }), _jsx("span", { className: "hidden md:inline", children: layoutMode ? 'Layout' : 'Single' })] }), open && (_jsxs("div", { role: "menu", className: "absolute right-0 top-12 z-[60] flex max-h-[80vh] w-80 flex-col overflow-hidden rounded-2xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl", children: [_jsxs("label", { className: "flex cursor-pointer items-center justify-between gap-3 border-b border-content/10 px-4 py-3", children: [_jsxs("span", { children: [_jsx("span", { className: "block text-sm font-semibold text-content", children: "Multi-Media Layout" }), _jsx("span", { className: "block text-xs text-content/50", children: "Play videos & images at once" })] }), _jsx("span", { onClick: (e) => { e.preventDefault(); toggleLayoutMode(); }, className: `relative h-6 w-11 shrink-0 rounded-full transition ${layoutMode ? 'bg-primary' : 'bg-content/20'}`, children: _jsx("span", { className: `absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${layoutMode ? 'left-[1.375rem]' : 'left-0.5'}` }) })] }), _jsx("div", { className: "grid grid-cols-3 gap-2 overflow-y-auto p-3 scrollbar-thin", children: LAYOUT_TEMPLATES.map((tpl) => (_jsx(TemplateCard, { tpl: tpl, active: layoutMode && currentTemplate === tpl.id, cols: customCols, rows: customRows, onSelect: () => setLayoutTemplate(tpl.id) }, tpl.id))) }), customActive && (_jsxs("div", { className: "border-t border-content/10 px-4 py-3", children: [_jsx("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wide text-content/50", children: "Custom grid" }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsx(Stepper, { label: "Columns", value: customCols, min: CUSTOM_MIN, max: CUSTOM_MAX, onChange: (v) => setCustomGrid(v, customRows) }), _jsx(Stepper, { label: "Rows", value: customRows, min: CUSTOM_MIN, max: CUSTOM_MAX, onChange: (v) => setCustomGrid(customCols, v) }), _jsxs("span", { className: "ml-auto self-end text-xs font-medium text-content/40", children: [customCols * customRows, " cells"] })] })] }))] }))] }));
}
/* ─── A template button with a mini grid preview ─── */
function TemplateCard({ tpl, active, cols, rows, onSelect, }) {
    const cellCount = tpl.id === 'custom' ? cols * rows : tpl.slots;
    const cfg = getGridConfig(tpl, { length: cellCount, cols, rows });
    const cells = Array.from({ length: cellCount });
    return (_jsxs("button", { onClick: onSelect, className: `flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${active
            ? 'border-primary/60 bg-primary/10'
            : 'border-content/10 bg-content/[0.02] hover:border-content/25 hover:bg-content/[0.05]'}`, children: [_jsx("span", { className: "grid h-10 w-full gap-1", style: cfg.style, children: cells.map((_, i) => (_jsx("span", { style: cfg.slotStyle(i), className: `rounded-sm ${active ? 'bg-primary/50' : 'bg-content/25'}` }, i))) }), _jsxs("span", { className: "flex items-center gap-1 text-[10px] font-medium text-content/80", children: [tpl.name, active && _jsx(Check, { className: "h-3 w-3 text-primary", strokeWidth: 3 })] })] }));
}
/* ─── −/+ stepper ─── */
function Stepper({ label, value, min, max, onChange, }) {
    return (_jsxs("div", { children: [_jsx("span", { className: "mb-1 block text-[11px] font-medium text-content/50", children: label }), _jsxs("div", { className: "flex items-center gap-1 rounded-lg border border-content/10 bg-content/[0.03] p-0.5", children: [_jsx(StepBtn, { label: `Fewer ${label.toLowerCase()}`, disabled: value <= min, onClick: () => onChange(value - 1), children: _jsx(Minus, { className: "h-3.5 w-3.5" }) }), _jsx("span", { className: "w-6 text-center text-sm font-bold tabular-nums text-content", children: value }), _jsx(StepBtn, { label: `More ${label.toLowerCase()}`, disabled: value >= max, onClick: () => onChange(value + 1), children: _jsx(Plus, { className: "h-3.5 w-3.5" }) })] })] }));
}
function StepBtn({ onClick, disabled, label, children, }) {
    return (_jsx("button", { onClick: onClick, disabled: disabled, "aria-label": label, className: "flex h-7 w-7 items-center justify-center rounded-md text-content/70 transition hover:bg-content/10 hover:text-content disabled:cursor-not-allowed disabled:opacity-30", children: children }));
}
