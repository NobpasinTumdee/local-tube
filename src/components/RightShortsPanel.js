import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Zap, SlidersHorizontal, Check, FolderTree } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useShortsStore, usePanelSentinel, SHORTS_PANEL_SLOT, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH, } from '../store/useShortsStore';
import ShortsPlayer from './ShortsPlayer';
/* ─────────────────────────────────────────────────────────────
 *  RIGHT SHORTS DRAWER
 * ─────────────────────────────────────────────────────────────
 *  Shorts as a companion surface rather than a destination: the drawer sits
 *  beside whatever the main column is doing, so a normal video in the grid
 *  and an endless feed can run at the same time.
 *
 *  It is a sibling of the page content (not an overlay) so the two share the
 *  viewport instead of the feed covering the library. Width is dragged, not
 *  `resize-x`: that CSS property only grows an element down-right from its
 *  own edge, which is the wrong edge for a right-anchored drawer, and it
 *  cannot be clamped or persisted.
 * ───────────────────────────────────────────────────────────── */
export default function RightShortsPanel() {
    const open = useShortsStore((s) => s.isShortsPanelOpen);
    const width = useShortsStore((s) => s.panelWidth);
    const setPanelWidth = useShortsStore((s) => s.setPanelWidth);
    const setOpen = useShortsStore((s) => s.setShortsPanelOpen);
    const sentinel = usePanelSentinel();
    const [dragging, setDragging] = useState(false);
    const [sourceOpen, setSourceOpen] = useState(false);
    /* Drag on window, not the handle: the pointer routinely outruns a 6px
       target, and losing the drag halfway feels broken. */
    useEffect(() => {
        if (!dragging)
            return;
        const onMove = (e) => setPanelWidth(window.innerWidth - e.clientX);
        const onUp = () => setDragging(false);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        /* Stops the drag from selecting the page text it passes over. */
        document.body.style.userSelect = 'none';
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            document.body.style.userSelect = '';
        };
    }, [dragging, setPanelWidth]);
    if (!open)
        return null;
    return (_jsxs("aside", { style: { width }, className: "fixed bottom-0 right-0 top-14 z-[150] flex flex-col border-l border-content/10 bg-base", children: [_jsx("div", { onPointerDown: (e) => { e.preventDefault(); setDragging(true); }, onDoubleClick: () => setPanelWidth(360), role: "separator", "aria-orientation": "vertical", "aria-label": "Resize Shorts panel", title: "Drag to resize \u00B7 double-click to reset", className: `absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors ${dragging ? 'bg-primary/60' : 'hover:bg-primary/30'}` }), _jsxs("div", { className: "flex shrink-0 items-center gap-2 border-b border-content/10 px-3 py-2", children: [_jsx(Zap, { className: "h-4 w-4 shrink-0 text-primary" }), _jsx("span", { className: "text-sm font-semibold text-content", children: "Shorts" }), _jsxs("div", { className: "relative ml-auto flex items-center gap-1", children: [_jsx("button", { onClick: () => setSourceOpen((o) => !o), className: `flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-content/10 ${sourceOpen ? 'bg-content/10 text-content' : 'text-content/60'}`, "aria-label": "Choose source folders", title: "Source folders", children: _jsx(SlidersHorizontal, { className: "h-4 w-4" }) }), _jsx("button", { onClick: () => setOpen(false), className: "flex h-8 w-8 items-center justify-center rounded-lg text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": "Close Shorts panel", title: "Close", children: _jsx(X, { className: "h-4 w-4" }) }), sourceOpen && _jsx(SourcePicker, { onClose: () => setSourceOpen(false) })] })] }), _jsx("div", { className: "min-h-0 flex-1 p-2", children: _jsx(ShortsPlayer, { slot: SHORTS_PANEL_SLOT, sentinel: sentinel, variant: "panel" }, sentinel) })] }));
}
/* ─────────────────────────────────────────────────────────────
 *  SOURCE PICKER
 * ─────────────────────────────────────────────────────────────
 *  Multi-select over the workspace tree. "All folders" is not one of the
 *  checkboxes but the state of having none ticked — the same thing the empty
 *  sentinel means, so an emptied selection cannot strand the feed with
 *  nothing to play.
 * ───────────────────────────────────────────────────────────── */
function SourcePicker({ onClose }) {
    const directoryTree = useStore((s) => s.directoryTree);
    const selected = useShortsStore((s) => s.panelFolders);
    const setPanelFolders = useShortsStore((s) => s.setPanelFolders);
    const ref = useRef(null);
    const folders = useMemo(() => {
        const out = [];
        const walk = (node, depth) => {
            for (const child of node.children) {
                if (child.mediaCount > 0)
                    out.push({ path: child.path, name: child.name, depth, count: child.mediaCount });
                walk(child, depth + 1);
            }
        };
        if (directoryTree)
            walk(directoryTree, 0);
        return out;
    }, [directoryTree]);
    /* Dismiss on outside click / Escape, like the app's other popovers. */
    useEffect(() => {
        const onDown = (e) => {
            if (!ref.current?.contains(e.target))
                onClose();
        };
        const onKey = (e) => { if (e.key === 'Escape')
            onClose(); };
        /* Deferred: the click that opened this would otherwise close it. */
        const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
        document.addEventListener('keydown', onKey);
        return () => {
            clearTimeout(t);
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);
    const toggle = useCallback((path) => {
        setPanelFolders(selected.includes(path) ? selected.filter((p) => p !== path) : [...selected, path]);
    }, [selected, setPanelFolders]);
    return (_jsxs("div", { ref: ref, className: "absolute right-0 top-9 z-30 max-h-[60vh] w-64 overflow-y-auto rounded-xl border border-content/10 bg-surface p-1.5 shadow-2xl shadow-black/50", children: [_jsxs("button", { onClick: () => setPanelFolders([]), className: `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition hover:bg-content/10 ${selected.length === 0 ? 'font-semibold text-primary' : 'text-content/80'}`, children: [_jsx(FolderTree, { className: "h-3.5 w-3.5 shrink-0" }), _jsx("span", { className: "flex-1", children: "All workspace folders" }), selected.length === 0 && _jsx(Check, { className: "h-3.5 w-3.5 shrink-0" })] }), _jsx("div", { className: "my-1 h-px bg-content/10" }), folders.length === 0 && (_jsx("p", { className: "px-2 py-3 text-center text-[11px] text-content/40", children: "No folders with media." })), folders.map((f) => {
                const on = selected.includes(f.path);
                return (_jsxs("button", { onClick: () => toggle(f.path), title: f.path, style: { paddingLeft: `${0.5 + f.depth * 0.6}rem` }, className: `flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[12px] transition hover:bg-content/10 ${on ? 'text-content' : 'text-content/70'}`, children: [_jsx("span", { className: `flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-white' : 'border-content/25'}`, children: on && _jsx(Check, { className: "h-2.5 w-2.5" }) }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: f.name }), _jsx("span", { className: "shrink-0 text-[10px] tabular-nums text-content/30", children: f.count })] }, f.path));
            })] }));
}
/** Clamp hint for callers that size around the drawer. */
export const SHORTS_PANEL_BOUNDS = { min: PANEL_MIN_WIDTH, max: PANEL_MAX_WIDTH };
