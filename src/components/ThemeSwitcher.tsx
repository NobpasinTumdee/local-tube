import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useStore, THEMES } from '../store/useStore';
import type { ThemeDef } from '../store/useStore';

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
  const rootRef = useRef<HTMLDivElement>(null);

  /* Close on outside click / Escape */
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
        className="flex h-10 w-10 items-center justify-center rounded-full text-content/80 transition hover:bg-content/10"
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Themes"
      >
        <Palette className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-[60] w-72 overflow-hidden rounded-2xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <div className="border-b border-content/10 px-4 py-3">
            <p className="text-sm font-semibold text-content">Theme</p>
            <p className="text-xs text-content/50">Pick a look — applies instantly</p>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
            {THEMES.map((theme) => (
              <ThemeRow
                key={theme.id}
                theme={theme}
                active={theme.id === currentTheme}
                onSelect={() => setTheme(theme.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── A single selectable theme row with swatches ─── */
function ThemeRow({
  theme,
  active,
  onSelect,
}: {
  theme: ThemeDef;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
        active ? 'bg-content/[0.08]' : 'hover:bg-content/[0.05]'
      }`}
    >
      {/* Swatch preview — a mini mock of the theme */}
      <span
        className="relative flex h-10 w-14 shrink-0 items-center gap-1 overflow-hidden rounded-lg border border-content/10 p-1.5"
        style={{ backgroundColor: theme.swatch.bg }}
      >
        <span
          className="h-full w-2.5 rounded-sm"
          style={{ backgroundColor: theme.swatch.surface }}
        />
        <span className="flex flex-1 flex-col gap-1">
          <span className="h-1.5 w-full rounded-full" style={{ backgroundColor: theme.swatch.text, opacity: 0.85 }} />
          <span className="h-1.5 w-2/3 rounded-full" style={{ backgroundColor: theme.swatch.text, opacity: 0.4 }} />
        </span>
        <span className="flex flex-col gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.swatch.primary }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.swatch.accent }} />
        </span>
      </span>

      {/* Name + description */}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-content">{theme.name}</span>
          {active && (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-1 text-xs text-content/45">{theme.description}</span>
      </span>
    </button>
  );
}
