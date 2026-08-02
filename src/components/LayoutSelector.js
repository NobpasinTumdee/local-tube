import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Check } from 'lucide-react';
import { useStore, LAYOUT_TEMPLATES } from '../store/useStore';
import { getGridConfig } from '../utils/layoutGrid';
/*
 * Header control for Multi-Video Layout mode: a toggle + a picker of grid
 * templates, each shown as a tiny live preview built from the SAME grid config
 * the real player uses (so what you see is what you get).
 */
export default function LayoutSelector() {
    const layoutMode = useStore((s) => s.layoutMode);
    const currentTemplate = useStore((s) => s.currentLayoutTemplate);
    const toggleLayoutMode = useStore((s) => s.toggleLayoutMode);
    const setLayoutTemplate = useStore((s) => s.setLayoutTemplate);
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
    return (_jsxs("div", { ref: rootRef, className: "relative shrink-0", children: [_jsxs("button", { onClick: () => setOpen((o) => !o), className: `flex h-10 items-center gap-1.5 rounded-full px-3 text-sm transition ${layoutMode
                    ? 'bg-primary/15 text-primary'
                    : 'text-content/80 hover:bg-content/10'}`, "aria-haspopup": "menu", "aria-expanded": open, title: "Multi-video layout", children: [_jsx(LayoutGrid, { className: "h-5 w-5" }), _jsx("span", { className: "hidden md:inline", children: layoutMode ? 'Layout' : 'Single' })] }), open && (_jsxs("div", { role: "menu", className: "absolute right-0 top-12 z-[60] w-72 overflow-hidden rounded-2xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl", children: [_jsxs("label", { className: "flex cursor-pointer items-center justify-between gap-3 border-b border-content/10 px-4 py-3", children: [_jsxs("span", { children: [_jsx("span", { className: "block text-sm font-semibold text-content", children: "Multi-Video Layout" }), _jsx("span", { className: "block text-xs text-content/50", children: "Play several videos at once" })] }), _jsx("span", { onClick: (e) => { e.preventDefault(); toggleLayoutMode(); }, className: `relative h-6 w-11 shrink-0 rounded-full transition ${layoutMode ? 'bg-primary' : 'bg-content/20'}`, children: _jsx("span", { className: `absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${layoutMode ? 'left-[1.375rem]' : 'left-0.5'}` }) })] }), _jsx("div", { className: "grid grid-cols-2 gap-2 p-3", children: LAYOUT_TEMPLATES.map((tpl) => (_jsx(TemplateCard, { tpl: tpl, active: layoutMode && currentTemplate === tpl.id, onSelect: () => setLayoutTemplate(tpl.id) }, tpl.id))) })] }))] }));
}
/* ─── A template button with a mini grid preview ─── */
function TemplateCard({ tpl, active, onSelect, }) {
    const cfg = getGridConfig(tpl.id, tpl.slots);
    const cells = Array.from({ length: tpl.slots });
    return (_jsxs("button", { onClick: onSelect, className: `flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${active
            ? 'border-primary/60 bg-primary/10'
            : 'border-content/10 bg-content/[0.02] hover:border-content/25 hover:bg-content/[0.05]'}`, children: [_jsx("span", { className: `grid h-12 w-full gap-1 ${cfg.container}`, children: cells.map((_, i) => (_jsx("span", { className: `rounded-sm ${active ? 'bg-primary/50' : 'bg-content/25'} ${cfg.spanFor(i)}` }, i))) }), _jsxs("span", { className: "flex items-center gap-1 text-[11px] font-medium text-content/80", children: [tpl.name, active && _jsx(Check, { className: "h-3 w-3 text-primary", strokeWidth: 3 })] })] }));
}
