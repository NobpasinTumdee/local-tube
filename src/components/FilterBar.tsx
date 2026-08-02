import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { LayoutList, Film, Image as ImageIcon, Hash, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { HomeFilter } from '../store/useStore';

/*
 * Advanced filter bar above the grid: media-type segment + dynamic tag pills.
 * Tag pills reflect every unique tag currently used in the library (with counts)
 * and toggle into `activeFilterTags`. Framer Motion `layout` keeps the pills and
 * the active-type indicator gliding as the set changes.
 */
export default function FilterBar() {
  const videos = useStore((s) => s.videos);
  const mediaTags = useStore((s) => s.mediaTags);
  const homeFilter = useStore((s) => s.homeFilter);
  const setHomeFilter = useStore((s) => s.setHomeFilter);
  const activeFilterTags = useStore((s) => s.activeFilterTags);
  const toggleFilterTag = useStore((s) => s.toggleFilterTag);
  const clearFilterTags = useStore((s) => s.clearFilterTags);

  /* Unique tags across the current library, most-used first. */
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of videos) {
      const t = mediaTags[v.id];
      if (!t) continue;
      for (const tag of t) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
  }, [videos, mediaTags]);

  const typeFilters: { label: string; value: HomeFilter; icon: React.ReactNode }[] = [
    { label: 'All', value: 'all', icon: <LayoutList className="h-3.5 w-3.5" /> },
    { label: 'Videos', value: 'videos', icon: <Film className="h-3.5 w-3.5" /> },
    { label: 'Images', value: 'images', icon: <ImageIcon className="h-3.5 w-3.5" /> },
  ];

  const activeCount = activeFilterTags.length;

  return (
    <div className="mb-6 flex items-center gap-3 overflow-x-auto pb-1 scrollbar-thin">
      {/* ── Media-type segment ── */}
      <div className="flex shrink-0 items-center gap-1 rounded-xl border border-content/[0.06] bg-content/[0.03] p-1">
        {typeFilters.map((f) => {
          const active = homeFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setHomeFilter(f.value)}
              className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                active ? 'text-content' : 'text-content/45 hover:text-content/70'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="filterbar-type"
                  className="absolute inset-0 rounded-lg bg-content/15"
                  transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {f.icon}
                {f.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Clear ── */}
      {activeCount > 0 && (
        <button
          onClick={clearFilterTags}
          className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/25"
        >
          <X className="h-3.5 w-3.5" /> Clear {activeCount} tag{activeCount === 1 ? '' : 's'}
        </button>
      )}

      {tags.length > 0 && <span className="h-6 w-px shrink-0 bg-content/10" />}

      {/* ── Tag pills ── */}
      <div className="flex min-w-0 items-center gap-2">
        {tags.length === 0 ? (
          <span className="shrink-0 text-xs text-content/30">No tags yet — add tags from any card</span>
        ) : (
          tags.map(({ tag, count }) => {
            const active = activeFilterTags.includes(tag);
            return (
              <motion.button
                layout
                key={tag}
                onClick={() => toggleFilterTag(tag)}
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-content/10 bg-content/[0.03] text-content/60 hover:border-content/25 hover:text-content'
                }`}
              >
                <Hash className="h-3 w-3 opacity-70" />
                {tag}
                <span className={`tabular-nums ${active ? 'text-primary/70' : 'text-content/30'}`}>{count}</span>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}
