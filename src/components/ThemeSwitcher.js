import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check } from 'lucide-react';
import { useStore, THEMES } from '../store/useStore';
/*
 * Theme picker — a live color swatch for every theme so the user can preview
 * and select. Selection is instant: `setTheme` swaps the <body> class and
 * every semantic Tailwind color (bg-base, text-content, bg-primary, …)
 * re-resolves against the new theme.
 *
 * This used to be a dropdown anchored to its own header button. It now lives
 * in the Settings modal instead: theme is a set-once preference, and a
 * permanent slot in the top bar is expensive real estate for something you
 * touch twice a year. The list is exported on its own so whatever hosts it
 * owns the surrounding chrome.
 */
export default function ThemePicker() {
    const currentTheme = useStore((s) => s.currentTheme);
    const setTheme = useStore((s) => s.setTheme);
    return (_jsx("div", { role: "radiogroup", "aria-label": "Theme", className: "flex flex-col gap-0.5", children: THEMES.map((theme) => (_jsx(ThemeRow, { theme: theme, active: theme.id === currentTheme, onSelect: () => setTheme(theme.id) }, theme.id))) }));
}
/* ─── A single selectable theme row with swatches ─── */
function ThemeRow({ theme, active, onSelect, }) {
    return (_jsxs("button", { role: "radio", "aria-checked": active, onClick: onSelect, className: `group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${active ? 'bg-content/[0.08]' : 'hover:bg-content/[0.05]'}`, children: [_jsxs("span", { className: "relative flex h-10 w-14 shrink-0 items-center gap-1 overflow-hidden rounded-lg border border-content/10 p-1.5", style: { backgroundColor: theme.swatch.bg }, children: [_jsx("span", { className: "h-full w-2.5 rounded-sm", style: { backgroundColor: theme.swatch.surface } }), _jsxs("span", { className: "flex flex-1 flex-col gap-1", children: [_jsx("span", { className: "h-1.5 w-full rounded-full", style: { backgroundColor: theme.swatch.text, opacity: 0.85 } }), _jsx("span", { className: "h-1.5 w-2/3 rounded-full", style: { backgroundColor: theme.swatch.text, opacity: 0.4 } })] }), _jsxs("span", { className: "flex flex-col gap-1", children: [_jsx("span", { className: "h-2 w-2 rounded-full", style: { backgroundColor: theme.swatch.primary } }), _jsx("span", { className: "h-2 w-2 rounded-full", style: { backgroundColor: theme.swatch.accent } })] })] }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "truncate text-sm font-medium text-content", children: theme.name }), active && (_jsx("span", { className: "flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-white", children: _jsx(Check, { className: "h-3 w-3", strokeWidth: 3 }) }))] }), _jsx("span", { className: "mt-0.5 line-clamp-1 text-xs text-content/45", children: theme.description })] })] }));
}
