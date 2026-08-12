import { Check } from 'lucide-react';
import { useStore, THEMES } from '../store/useStore';
import type { ThemeDef } from '../store/useStore';

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

  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-col gap-0.5">
      {THEMES.map((theme) => (
        <ThemeRow
          key={theme.id}
          theme={theme}
          active={theme.id === currentTheme}
          onSelect={() => setTheme(theme.id)}
        />
      ))}
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
      role="radio"
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
