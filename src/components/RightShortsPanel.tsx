import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Zap, SlidersHorizontal, Check, FolderTree } from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  useShortsStore, usePanelSentinel, SHORTS_PANEL_SLOT, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH,
} from '../store/useShortsStore';
import type { FolderNode } from '../utils/directoryScanner';
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
    if (!dragging) return;
    const onMove = (e: PointerEvent) => setPanelWidth(window.innerWidth - e.clientX);
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

  if (!open) return null;

  return (
    <aside
      style={{ width }}
      className="fixed bottom-0 right-0 top-14 z-[150] flex flex-col border-l border-content/10 bg-base"
    >
      {/* ── Drag handle ── */}
      <div
        onPointerDown={(e) => { e.preventDefault(); setDragging(true); }}
        onDoubleClick={() => setPanelWidth(360)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Shorts panel"
        title="Drag to resize · double-click to reset"
        className={`absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors ${
          dragging ? 'bg-primary/60' : 'hover:bg-primary/30'
        }`}
      />

      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-content/10 px-3 py-2">
        <Zap className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-semibold text-content">Shorts</span>

        <div className="relative ml-auto flex items-center gap-1">
          <button
            onClick={() => setSourceOpen((o) => !o)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-content/10 ${
              sourceOpen ? 'bg-content/10 text-content' : 'text-content/60'
            }`}
            aria-label="Choose source folders"
            title="Source folders"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-content/60 transition hover:bg-content/10 hover:text-content"
            aria-label="Close Shorts panel"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {sourceOpen && <SourcePicker onClose={() => setSourceOpen(false)} />}
        </div>
      </div>

      {/* ── The feed ──
          Keyed by source: changing folders should restart the feed rather
          than leave the previous folder's video on screen. */}
      <div className="min-h-0 flex-1 p-2">
        <ShortsPlayer key={sentinel} slot={SHORTS_PANEL_SLOT} sentinel={sentinel} variant="panel" />
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  SOURCE PICKER
 * ─────────────────────────────────────────────────────────────
 *  Multi-select over the workspace tree. "All folders" is not one of the
 *  checkboxes but the state of having none ticked — the same thing the empty
 *  sentinel means, so an emptied selection cannot strand the feed with
 *  nothing to play.
 * ───────────────────────────────────────────────────────────── */
function SourcePicker({ onClose }: { onClose: () => void }) {
  const directoryTree = useStore((s) => s.directoryTree);
  const selected = useShortsStore((s) => s.panelFolders);
  const setPanelFolders = useShortsStore((s) => s.setPanelFolders);
  const ref = useRef<HTMLDivElement>(null);

  const folders = useMemo(() => {
    const out: { path: string; name: string; depth: number; count: number }[] = [];
    const walk = (node: FolderNode, depth: number) => {
      for (const child of node.children) {
        if (child.mediaCount > 0) out.push({ path: child.path, name: child.name, depth, count: child.mediaCount });
        walk(child, depth + 1);
      }
    };
    if (directoryTree) walk(directoryTree, 0);
    return out;
  }, [directoryTree]);

  /* Dismiss on outside click / Escape, like the app's other popovers. */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    /* Deferred: the click that opened this would otherwise close it. */
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const toggle = useCallback(
    (path: string) => {
      setPanelFolders(
        selected.includes(path) ? selected.filter((p) => p !== path) : [...selected, path],
      );
    },
    [selected, setPanelFolders],
  );

  return (
    <div
      ref={ref}
      className="absolute right-0 top-9 z-30 max-h-[60vh] w-64 overflow-y-auto rounded-xl border border-content/10 bg-surface p-1.5 shadow-2xl shadow-black/50"
    >
      <button
        onClick={() => setPanelFolders([])}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition hover:bg-content/10 ${
          selected.length === 0 ? 'font-semibold text-primary' : 'text-content/80'
        }`}
      >
        <FolderTree className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">All workspace folders</span>
        {selected.length === 0 && <Check className="h-3.5 w-3.5 shrink-0" />}
      </button>

      <div className="my-1 h-px bg-content/10" />

      {folders.length === 0 && (
        <p className="px-2 py-3 text-center text-[11px] text-content/40">No folders with media.</p>
      )}

      {folders.map((f) => {
        const on = selected.includes(f.path);
        return (
          <button
            key={f.path}
            onClick={() => toggle(f.path)}
            title={f.path}
            style={{ paddingLeft: `${0.5 + f.depth * 0.6}rem` }}
            className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[12px] transition hover:bg-content/10 ${
              on ? 'text-content' : 'text-content/70'
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                on ? 'border-primary bg-primary text-white' : 'border-content/25'
              }`}
            >
              {on && <Check className="h-2.5 w-2.5" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-content/30">{f.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Clamp hint for callers that size around the drawer. */
export const SHORTS_PANEL_BOUNDS = { min: PANEL_MIN_WIDTH, max: PANEL_MAX_WIDTH };
