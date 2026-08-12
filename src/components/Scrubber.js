import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useRef, useState } from 'react';
import { formatDuration } from '../utils/format';
import { frameAt } from '../utils/frameExtractor';
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
export default function Scrubber({ current, duration, frames, onSeek, extracting }) {
    const barRef = useRef(null);
    const [hoverRatio, setHoverRatio] = useState(null);
    const [dragging, setDragging] = useState(false);
    const ratioFromEvent = useCallback((clientX) => {
        const bar = barRef.current;
        if (!bar)
            return 0;
        const rect = bar.getBoundingClientRect();
        if (rect.width === 0)
            return 0;
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }, []);
    const handleMove = (e) => {
        const r = ratioFromEvent(e.clientX);
        setHoverRatio(r);
        if (dragging)
            onSeek(r * duration);
    };
    const commit = (e) => {
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
    return (_jsxs("div", { ref: barRef, className: "group/bar relative flex h-5 cursor-pointer items-center", onClick: commit, onMouseMove: handleMove, onMouseLeave: () => {
            setHoverRatio(null);
            setDragging(false);
        }, onMouseDown: (e) => {
            setDragging(true);
            commit(e);
        }, onMouseUp: () => setDragging(false), role: "slider", "aria-label": "Seek", "aria-valuemin": 0, "aria-valuemax": Math.round(duration) || 0, "aria-valuenow": Math.round(current) || 0, "aria-valuetext": `${formatDuration(current)} of ${formatDuration(duration)}`, tabIndex: 0, onKeyDown: (e) => {
            if (e.key === 'ArrowLeft')
                onSeek(Math.max(0, current - 5));
            else if (e.key === 'ArrowRight')
                onSeek(Math.min(duration, current + 5));
        }, children: [_jsxs("div", { className: "h-[3px] w-full rounded-full bg-content/20 transition-all group-hover/bar:h-[5px]", children: [hoverRatio != null && (_jsx("div", { className: "absolute left-0 h-[3px] rounded-full bg-content/30 transition-all group-hover/bar:h-[5px]", style: { width: `${hoverRatio * 100}%` } })), _jsx("div", { className: "relative h-full rounded-full bg-primary transition-all", style: { width: `${progress}%` } })] }), _jsx("div", { className: "pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover/bar:opacity-100", style: { left: `calc(${progress}% - 7px)` } }), hoverRatio != null && duration > 0 && (_jsxs("div", { className: "pointer-events-none absolute bottom-7 z-10 -translate-x-1/2", style: { left: `${clampedLeft}px`, width: `${TOOLTIP_WIDTH}px` }, children: [(preview || extracting) && (_jsx("div", { className: "mb-1 overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl shadow-black/60", children: _jsx("div", { className: "relative aspect-video w-full", children: preview ? (_jsx("img", { src: preview.dataUrl, alt: "", className: "h-full w-full object-cover", draggable: false })) : (_jsx("div", { className: "flex h-full w-full items-center justify-center bg-content/[0.06]", children: _jsx("span", { className: "h-4 w-4 animate-spin rounded-full border-2 border-content/20 border-t-content/60" }) })) }) })), _jsx("p", { className: "text-center text-[11px] font-semibold tabular-nums text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]", children: formatDuration(hoverTime ?? 0) })] }))] }));
}
