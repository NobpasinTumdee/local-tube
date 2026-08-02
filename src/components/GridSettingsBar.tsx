import { RectangleHorizontal, RectangleVertical, Square, Columns3 } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { CardAspectRatio, GridColumns } from '../store/useStore';

/*
 * Display controls for the uniform media grid: card aspect-ratio selector +
 * column-count selector. Both write to persisted store prefs, so MediaGrid /
 * MediaCard re-render and Framer Motion `layout` animates the reflow.
 */
const ASPECTS: { value: CardAspectRatio; label: string; icon: React.ReactNode }[] = [
  { value: '16/9', label: 'Landscape', icon: <RectangleHorizontal className="h-4 w-4" /> },
  { value: '9/16', label: 'Portrait', icon: <RectangleVertical className="h-4 w-4" /> },
  { value: '1/1', label: 'Square', icon: <Square className="h-4 w-4" /> },
];

const COLUMNS: GridColumns[] = ['auto', 2, 3, 4, 5, 6];

export default function GridSettingsBar() {
  const cardAspectRatio = useStore((s) => s.cardAspectRatio);
  const setCardAspectRatio = useStore((s) => s.setCardAspectRatio);
  const gridColumns = useStore((s) => s.gridColumns);
  const setGridColumns = useStore((s) => s.setGridColumns);

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* aspect ratio */}
      <div
        className="flex items-center gap-0.5 rounded-xl border border-content/[0.06] bg-content/[0.03] p-1"
        role="group"
        aria-label="Card shape"
      >
        {ASPECTS.map((a) => {
          const active = cardAspectRatio === a.value;
          return (
            <button
              key={a.value}
              onClick={() => setCardAspectRatio(a.value)}
              title={a.label}
              aria-label={a.label}
              aria-pressed={active}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                active ? 'bg-primary/20 text-primary' : 'text-content/45 hover:bg-content/10 hover:text-content'
              }`}
            >
              {a.icon}
            </button>
          );
        })}
      </div>

      {/* columns */}
      <div
        className="flex items-center gap-0.5 rounded-xl border border-content/[0.06] bg-content/[0.03] p-1"
        role="group"
        aria-label="Columns"
      >
        <span className="flex h-8 items-center pl-1.5 pr-0.5 text-content/30" title="Columns">
          <Columns3 className="h-4 w-4" />
        </span>
        {COLUMNS.map((c) => {
          const active = gridColumns === c;
          return (
            <button
              key={String(c)}
              onClick={() => setGridColumns(c)}
              title={c === 'auto' ? 'Auto (responsive)' : `${c} columns`}
              aria-pressed={active}
              className={`flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${
                active ? 'bg-primary/20 text-primary' : 'text-content/45 hover:bg-content/10 hover:text-content'
              }`}
            >
              {c === 'auto' ? 'Auto' : c}
            </button>
          );
        })}
      </div>
    </div>
  );
}
