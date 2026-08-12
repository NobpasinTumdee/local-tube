import { useCallback, useRef, useState } from 'react';
import { formatDuration } from '../utils/format';
import { frameAt, type ScrubFrame } from '../utils/frameExtractor';

/* ─────────────────────────────────────────────────────────────
 *  SCRUBBER — PROGRESS BAR WITH HOVER PREVIEW
 * ─────────────────────────────────────────────────────────────
 *  Drop-in replacement for the plain progress div, adding a YouTube-style
 *  thumbnail tooltip.
 *
 *  Two details that make it feel right rather than merely work:
 *
 *  - The hover position is derived from getBoundingClientRect(), not
 *    `offsetX`. offsetX is relative to whatever element the pointer is
 *    actually over, so once the cursor crosses the played-portion fill or
 *    the drag handle it silently switches frame of reference and the
 *    tooltip jumps.
 *  - The tooltip is CLAMPED to the bar's width. Near either end an
 *    unclamped tooltip hangs off-screen, and at the left edge it would be
 *    clipped by the player's overflow.
 * ───────────────────────────────────────────────────────────── */

const TOOLTIP_WIDTH = 160;

interface Props {
  current: number;
  duration: number;
  frames: readonly ScrubFrame[];
  onSeek: (time: number) => void;
  /** Rendered inside the tooltip when no frame has been extracted yet. */
  extracting?: boolean;
}

export default function Scrubber({ current, duration, frames, onSeek, extracting }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const ratioFromEvent = useCallback((clientX: number): number => {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = ratioFromEvent(e.clientX);
    setHoverRatio(r);
    if (dragging) onSeek(r * duration);
  };

  const commit = (e: React.MouseEvent<HTMLDivElement>) => {
    onSeek(ratioFromEvent(e.clientX) * duration);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const hoverTime = hoverRatio != null ? hoverRatio * duration : null;
  const preview = hoverTime != null ? frameAt(frames, hoverTime) : null;

  /* Clamp the tooltip's centre so it never leaves the bar. */
  const barWidth = barRef.current?.getBoundingClientRect().width ?? 0;
  const rawLeft = (hoverRatio ?? 0) * barWidth;
  const half = TOOLTIP_WIDTH / 2;
  const clampedLeft = barWidth > TOOLTIP_WIDTH
    ? Math.max(half, Math.min(barWidth - half, rawLeft))
    : barWidth / 2;

  return (
    <div
      ref={barRef}
      className="group/bar relative flex h-5 cursor-pointer items-center"
      onClick={commit}
      onMouseMove={handleMove}
      onMouseLeave={() => {
        setHoverRatio(null);
        setDragging(false);
      }}
      onMouseDown={(e) => {
        setDragging(true);
        commit(e);
      }}
      onMouseUp={() => setDragging(false)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(current) || 0}
      aria-valuetext={`${formatDuration(current)} of ${formatDuration(duration)}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, current - 5));
        else if (e.key === 'ArrowRight') onSeek(Math.min(duration, current + 5));
      }}
    >
      {/* track */}
      <div className="h-[3px] w-full rounded-full bg-content/20 transition-all group-hover/bar:h-[5px]">
        {/* hover shadow — the "seek to here" ghost behind the real fill */}
        {hoverRatio != null && (
          <div
            className="absolute left-0 h-[3px] rounded-full bg-content/30 transition-all group-hover/bar:h-[5px]"
            style={{ width: `${hoverRatio * 100}%` }}
          />
        )}
        <div
          className="relative h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* drag handle */}
      <div
        className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover/bar:opacity-100"
        style={{ left: `calc(${progress}% - 7px)` }}
      />

      {/* preview tooltip */}
      {hoverRatio != null && duration > 0 && (
        <div
          className="pointer-events-none absolute bottom-7 z-10 -translate-x-1/2"
          style={{ left: `${clampedLeft}px`, width: `${TOOLTIP_WIDTH}px` }}
        >
          {(preview || extracting) && (
            <div className="mb-1 overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl shadow-black/60">
              <div className="relative aspect-video w-full">
                {preview ? (
                  <img
                    src={preview.dataUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-content/[0.06]">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-content/20 border-t-content/60" />
                  </div>
                )}
              </div>
            </div>
          )}
          <p className="text-center text-[11px] font-semibold tabular-nums text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {formatDuration(hoverTime ?? 0)}
          </p>
        </div>
      )}
    </div>
  );
}
