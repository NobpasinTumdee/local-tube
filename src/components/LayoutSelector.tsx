import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Check } from 'lucide-react';
import { useStore, LAYOUT_TEMPLATES } from '../store/useStore';
import type { LayoutTemplateDef } from '../store/useStore';
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-sm transition ${
          layoutMode
            ? 'bg-primary/15 text-primary'
            : 'text-content/80 hover:bg-content/10'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Multi-video layout"
      >
        <LayoutGrid className="h-5 w-5" />
        <span className="hidden md:inline">{layoutMode ? 'Layout' : 'Single'}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-[60] w-72 overflow-hidden rounded-2xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          {/* mode toggle */}
          <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-content/10 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-content">Multi-Video Layout</span>
              <span className="block text-xs text-content/50">Play several videos at once</span>
            </span>
            <span
              onClick={(e) => { e.preventDefault(); toggleLayoutMode(); }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                layoutMode ? 'bg-primary' : 'bg-content/20'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  layoutMode ? 'left-[1.375rem]' : 'left-0.5'
                }`}
              />
            </span>
          </label>

          {/* templates */}
          <div className="grid grid-cols-2 gap-2 p-3">
            {LAYOUT_TEMPLATES.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                active={layoutMode && currentTemplate === tpl.id}
                onSelect={() => setLayoutTemplate(tpl.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── A template button with a mini grid preview ─── */
function TemplateCard({
  tpl,
  active,
  onSelect,
}: {
  tpl: LayoutTemplateDef;
  active: boolean;
  onSelect: () => void;
}) {
  const cfg = getGridConfig(tpl.id, tpl.slots);
  const cells = Array.from({ length: tpl.slots });

  return (
    <button
      onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${
        active
          ? 'border-primary/60 bg-primary/10'
          : 'border-content/10 bg-content/[0.02] hover:border-content/25 hover:bg-content/[0.05]'
      }`}
    >
      <span className={`grid h-12 w-full gap-1 ${cfg.container}`}>
        {cells.map((_, i) => (
          <span
            key={i}
            className={`rounded-sm ${active ? 'bg-primary/50' : 'bg-content/25'} ${cfg.spanFor(i)}`}
          />
        ))}
      </span>
      <span className="flex items-center gap-1 text-[11px] font-medium text-content/80">
        {tpl.name}
        {active && <Check className="h-3 w-3 text-primary" strokeWidth={3} />}
      </span>
    </button>
  );
}
