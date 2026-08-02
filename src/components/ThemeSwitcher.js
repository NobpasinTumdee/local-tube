import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useStore, THEMES } from '../store/useStore';
/*
 * Theme picker — a dropdown from the header showing a live color swatch for
 * every theme so the user can preview and select. Selection is instant:
 * `setTheme` swaps the <body> class and every semantic Tailwind color
 * (bg-base, text-content, bg-primary, …) re-resolves against the new theme.
 */
export default function ThemeSwitcher() {
    const currentTheme = useStore((s) => s.currentTheme);
    const setTheme = useStore((s) => s.setTheme);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    /* Close on outside click / Escape */
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
    return (_jsxs("div", { ref: rootRef, className: "relative shrink-0", children: [_jsx("button", { onClick: () => setOpen((o) => !o), className: "flex h-10 w-10 items-center justify-center rounded-full text-content/80 transition hover:bg-content/10", "aria-label": "Change theme", "aria-haspopup": "menu", "aria-expanded": open, title: "Themes", children: _jsx(Palette, { className: "h-5 w-5" }) }), open && (_jsxs("div", { role: "menu", className: "absolute right-0 top-12 z-[60] w-72 overflow-hidden rounded-2xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl", children: [_jsxs("div", { className: "border-b border-content/10 px-4 py-3", children: [_jsx("p", { className: "text-sm font-semibold text-content", children: "Theme" }), _jsx("p", { className: "text-xs text-content/50", children: "Pick a look \u2014 applies instantly" })] }), _jsx("div", { className: "max-h-[60vh] overflow-y-auto p-2 scrollbar-thin", children: THEMES.map((theme) => (_jsx(ThemeRow, { theme: theme, active: theme.id === currentTheme, onSelect: () => setTheme(theme.id) }, theme.id))) })] }))] }));
}
/* ─── A single selectable theme row with swatches ─── */
function ThemeRow({ theme, active, onSelect, }) {
    return (_jsxs("button", { role: "menuitemradio", "aria-checked": active, onClick: onSelect, className: `group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${active ? 'bg-content/[0.08]' : 'hover:bg-content/[0.05]'}`, children: [_jsxs("span", { className: "relative flex h-10 w-14 shrink-0 items-center gap-1 overflow-hidden rounded-lg border border-content/10 p-1.5", style: { backgroundColor: theme.swatch.bg }, children: [_jsx("span", { className: "h-full w-2.5 rounded-sm", style: { backgroundColor: theme.swatch.surface } }), _jsxs("span", { className: "flex flex-1 flex-col gap-1", children: [_jsx("span", { className: "h-1.5 w-full rounded-full", style: { backgroundColor: theme.swatch.text, opacity: 0.85 } }), _jsx("span", { className: "h-1.5 w-2/3 rounded-full", style: { backgroundColor: theme.swatch.text, opacity: 0.4 } })] }), _jsxs("span", { className: "flex flex-col gap-1", children: [_jsx("span", { className: "h-2 w-2 rounded-full", style: { backgroundColor: theme.swatch.primary } }), _jsx("span", { className: "h-2 w-2 rounded-full", style: { backgroundColor: theme.swatch.accent } })] })] }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "truncate text-sm font-medium text-content", children: theme.name }), active && (_jsx("span", { className: "flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-white", children: _jsx(Check, { className: "h-3 w-3", strokeWidth: 3 }) }))] }), _jsx("span", { className: "mt-0.5 line-clamp-1 text-xs text-content/45", children: theme.description })] })] }));
}
