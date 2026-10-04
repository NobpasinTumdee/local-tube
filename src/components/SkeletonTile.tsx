import { useStore } from '../store/useStore';

/* ─────────────────────────────────────────────────────────────
 *  SKELETON TILE
 * ─────────────────────────────────────────────────────────────
 *  Stands in for a card that has nothing to show yet: off-screen, or on
 *  screen while the frame extractor is still working.
 *
 *  It takes its aspect ratio from the same `cardAspectRatio` preference the
 *  real card uses, and reserves the same two text lines underneath. That is
 *  the whole point — if the placeholder and the card disagree about height,
 *  the grid reflows as each thumbnail lands and the scroll position drifts
 *  under the user's cursor.
 *
 *  The shimmer is a gradient sweep rather than a bare `animate-pulse`:
 *  pulsing opacity on a few hundred tiles is a lot of compositing for very
 *  little information. The sweep is one transform-animated element, and it is
 *  only rendered for tiles the user can actually see.
 * ───────────────────────────────────────────────────────────── */

interface Props {
  /** True when this stands in for a visible, loading card — adds the sweep. */
  active?: boolean;
  /** Hides the two text lines where the caller draws its own. */
  bare?: boolean;
  /** Fill the parent box instead of imposing the card's aspect ratio —
   *  for use inside a card that has already reserved the space. */
  fill?: boolean;
}

export default function SkeletonTile({ active = false, bare = false, fill = false }: Props) {
  const cardAspectRatio = useStore((s) => s.cardAspectRatio);
  const aspectClass =
    cardAspectRatio === '9/16' ? 'aspect-[9/16]' : cardAspectRatio === '1/1' ? 'aspect-square' : 'aspect-video';

  return (
    <div aria-hidden="true" className={fill ? 'h-full w-full' : undefined}>
      <div
        className={`relative overflow-hidden bg-content/[0.06] ${
          fill ? 'h-full w-full' : `rounded-2xl ring-1 ring-content/[0.06] ${aspectClass}`
        }`}
      >
        {active && (
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-content/[0.09] to-transparent" />
        )}
      </div>

      {!bare && (
        <div className="mt-3 flex gap-3">
          <div className={`h-9 w-9 shrink-0 rounded-full bg-content/[0.06] ${active ? 'animate-pulse' : ''}`} />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className={`h-3 w-[85%] rounded bg-content/[0.06] ${active ? 'animate-pulse' : ''}`} />
            <div className={`h-2.5 w-[45%] rounded bg-content/[0.04] ${active ? 'animate-pulse' : ''}`} />
          </div>
        </div>
      )}
    </div>
  );
}
