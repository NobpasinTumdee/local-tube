import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, SkipForward, SkipBack, Volume2, VolumeX, X, GripVertical, Zap, Shuffle, Play, Pause, Maximize2, Minimize2, } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useShortsStore, useCurrentShort, useCanGoBack, shortsSlotKey, shortsSourceLabel, } from '../store/useShortsStore';
import { formatDuration } from '../utils/format';
import { DND_SLOT } from '../utils/layoutGrid';
/* ─────────────────────────────────────────────────────────────
 *  SHORTS PLAYER
 * ─────────────────────────────────────────────────────────────
 *  One endless vertical feed, sized to live inside a single grid cell.
 *
 *  Memory is the thing to get right here, because unlike a normal tile this
 *  component churns files for as long as it is mounted: every advance creates
 *  a blob URL for the next file, and the effect's cleanup revokes the
 *  previous one. Nothing accumulates whether the video ended on its own, was
 *  skipped, or the whole slot was torn down — three feeds cycling for an hour
 *  hold three blob URLs, not three hundred.
 *
 *  Muted by default and per slot: several of these can be on screen at once,
 *  and four soundtracks at full volume is not a feature.
 * ───────────────────────────────────────────────────────────── */
export default function ShortsPlayer({ slot, sentinel, onRegister, variant = 'tile' }) {
    const isPanel = variant === 'panel';
    const slotKey = useMemo(() => shortsSlotKey(slot, sentinel), [slot, sentinel]);
    const videos = useStore((s) => s.videos);
    const favorites = useStore((s) => s.favorites);
    const toggleFavorite = useStore((s) => s.toggleFavorite);
    const removeFromLayout = useStore((s) => s.removeFromLayout);
    const videoMeta = useStore((s) => s.videoMeta);
    const getNextShort = useShortsStore((s) => s.getNextShort);
    const getPrevShort = useShortsStore((s) => s.getPrevShort);
    const reshuffle = useShortsStore((s) => s.reshuffle);
    const releaseSlot = useShortsStore((s) => s.releaseSlot);
    const fit = useShortsStore((s) => s.fit);
    const setFit = useShortsStore((s) => s.setFit);
    const currentId = useCurrentShort(slotKey);
    const canGoBack = useCanGoBack(slotKey);
    const videoRef = useRef(null);
    const [src, setSrc] = useState(null);
    const [muted, setMuted] = useState(true);
    const [playing, setPlaying] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [liked, setLiked] = useState(false);
    /* Live playhead for the scrubber. Kept local: at ~4Hz per feed this would
       re-render every other slot if it lived in the store. */
    const [time, setTime] = useState(0);
    const [length, setLength] = useState(0);
    const [scrubbing, setScrubbing] = useState(false);
    const item = useMemo(() => videos.find((v) => v.id === currentId) ?? null, [videos, currentId]);
    const isFavorite = !!currentId && favorites.includes(currentId);
    const next = useCallback(() => {
        getNextShort(slotKey);
    }, [getNextShort, slotKey]);
    const prev = useCallback(() => {
        getPrevShort(slotKey);
    }, [getPrevShort, slotKey]);
    /* First video for this slot, and a fresh one whenever the library changes
       under it (folder unmounted, re-scan) leaves the slot empty. */
    useEffect(() => {
        if (!currentId)
            next();
    }, [currentId, next]);
    /* Forget this slot's queue when the tile goes away, so a later feed in the
       same cell starts from a new shuffle instead of the old leftovers. */
    useEffect(() => () => releaseSlot(slotKey), [releaseSlot, slotKey]);
    /* ── Blob lifecycle: exactly one live URL per feed ── */
    useEffect(() => {
        if (!item) {
            setSrc(null);
            return;
        }
        let url;
        let cancelled = false;
        (async () => {
            try {
                const file = await item.handle.getFile();
                url = URL.createObjectURL(file);
                if (!cancelled)
                    setSrc(url);
            }
            catch {
                /* Unreadable file (moved, permission lost): don't stall the feed. */
                if (!cancelled)
                    next();
            }
        })();
        return () => {
            cancelled = true;
            if (url)
                URL.revokeObjectURL(url); // ← revoke on advance, skip and unmount
        };
    }, [item, next]);
    useEffect(() => {
        onRegister?.(slot, videoRef.current);
        return () => onRegister?.(slot, null);
    }, [slot, src, onRegister]);
    /* The heart pulses on the way in; reset it when the video changes. */
    useEffect(() => setLiked(false), [currentId]);
    /* New video, new timeline. */
    useEffect(() => { setTime(0); setLength(0); }, [currentId]);
    const onLike = () => {
        if (!currentId)
            return;
        toggleFavorite(currentId);
        setLiked(true);
    };
    const togglePlay = () => {
        const el = videoRef.current;
        if (!el)
            return;
        el.paused ? el.play().catch(() => { }) : el.pause();
    };
    const toggleMute = () => {
        const el = videoRef.current;
        if (!el)
            return;
        el.muted = !el.muted;
        setMuted(el.muted);
    };
    const seek = (to) => {
        const el = videoRef.current;
        if (!el || !Number.isFinite(el.duration))
            return;
        el.currentTime = Math.max(0, Math.min(el.duration, to));
        setTime(el.currentTime);
    };
    /* The element's own duration once loaded; the library's cached value only
       until then, so the scrubber is not stuck at 0 on the first frame. */
    const duration = length || (currentId ? videoMeta[currentId]?.duration ?? 0 : 0);
    const progress = duration > 0 ? (time / duration) * 100 : 0;
    return (_jsxs("div", { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), className: "group relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-black ring-1 ring-content/10", children: [_jsxs("div", { className: "relative aspect-[9/16] max-h-full max-w-full overflow-hidden", children: [src ? (_jsx("video", { ref: videoRef, src: src, autoPlay: true, muted: muted, playsInline: true, preload: "auto", className: `h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`, onClick: togglePlay, onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onLoadedMetadata: () => setLength(videoRef.current?.duration ?? 0), 
                        /* While dragging the range input the element keeps firing
                           timeupdate at the old position and would fight the thumb. */
                        onTimeUpdate: () => { if (!scrubbing)
                            setTime(videoRef.current?.currentTime ?? 0); }, 
                        /* The feed itself: roll straight into the next random pick. */
                        onEnded: next, 
                        /* A codec the browser cannot decode would otherwise freeze the
                           feed on a black cell forever. */
                        onError: next })) : (_jsxs("div", { className: "flex h-full w-full flex-col items-center justify-center gap-2 text-content/30", children: [_jsx(Zap, { className: "h-7 w-7 animate-pulse" }), _jsx("span", { className: "text-[11px] font-medium", children: item ? 'Loading short…' : 'No videos in this source' })] })), _jsxs("div", { className: "absolute bottom-3 right-2 z-30 flex flex-col items-center gap-3", children: [_jsx(RailBtn, { label: isFavorite ? 'Remove from favorites' : 'Add to favorites', onClick: onLike, disabled: !currentId, children: _jsx(Heart, { className: `h-5 w-5 transition-transform duration-200 ${isFavorite ? 'fill-primary text-primary' : 'text-white'} ${liked ? 'scale-125' : 'scale-100'}` }) }), _jsx(RailBtn, { label: "Previous short", onClick: prev, disabled: !canGoBack, children: _jsx(SkipBack, { className: "h-5 w-5 text-white" }) }), _jsx(RailBtn, { label: "Next short", onClick: next, children: _jsx(SkipForward, { className: "h-5 w-5 text-white" }) }), _jsx(RailBtn, { label: fit === 'cover' ? 'Show original aspect ratio' : 'Fill vertical frame', onClick: () => setFit(fit === 'cover' ? 'contain' : 'cover'), children: fit === 'cover'
                                    ? _jsx(Minimize2, { className: "h-5 w-5 text-white" })
                                    : _jsx(Maximize2, { className: "h-5 w-5 text-primary" }) }), _jsx(RailBtn, { label: muted ? 'Unmute' : 'Mute', onClick: toggleMute, disabled: !src, children: muted ? _jsx(VolumeX, { className: "h-5 w-5 text-white" }) : _jsx(Volume2, { className: "h-5 w-5 text-primary" }) })] }), src && !playing && (_jsx("button", { onClick: togglePlay, "aria-label": "Play", className: "absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/30", children: _jsx("span", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm", children: _jsx(Play, { className: "ml-0.5 h-6 w-6 text-white" }) }) })), _jsxs("div", { className: "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8", children: [_jsx("p", { className: "truncate pr-14 text-[12px] font-semibold text-white/95", children: item?.title ?? '—' }), _jsx("p", { className: "truncate pr-14 text-[10px] text-white/55", children: item?.rootFolderName }), _jsxs("div", { className: "pointer-events-auto mt-1.5 flex items-center gap-2 pr-12", children: [_jsx("input", { type: "range", min: 0, max: duration || 0, step: 0.1, value: Math.min(time, duration || 0), disabled: !src || !duration, onPointerDown: () => setScrubbing(true), onPointerUp: () => setScrubbing(false), onKeyDown: (e) => e.stopPropagation(), onChange: (e) => { setTime(+e.target.value); seek(+e.target.value); }, "aria-label": "Seek", className: "shorts-range h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 disabled:cursor-default", style: { backgroundImage: `linear-gradient(to right, rgb(var(--color-primary)) ${progress}%, transparent ${progress}%)` } }), _jsxs("span", { className: "shrink-0 text-[10px] tabular-nums text-white/70", children: [formatDuration(time), " / ", formatDuration(duration || 0)] })] })] })] }), _jsxs("div", { className: `pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-2 py-1.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`, children: [!isPanel && _jsx("span", { draggable: true, onDragStart: (e) => {
                            e.dataTransfer.setData(DND_SLOT, String(slot));
                            e.dataTransfer.effectAllowed = 'move';
                        }, className: "pointer-events-auto flex h-6 w-6 cursor-grab items-center justify-center rounded text-white/70 hover:bg-white/15 hover:text-white active:cursor-grabbing", title: "Drag to swap slot", children: _jsx(GripVertical, { className: "h-4 w-4" }) }), _jsxs("span", { className: "flex items-center gap-1 rounded bg-primary/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white", children: [_jsx(Zap, { className: "h-3 w-3" }), "Shorts"] }), _jsx("span", { className: "min-w-0 flex-1 truncate text-[11px] font-medium text-white/70", children: shortsSourceLabel(sentinel) }), _jsx("button", { onClick: () => { reshuffle(slotKey); next(); }, className: "pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/80 transition hover:bg-white/20", "aria-label": "Reshuffle this feed", title: "Reshuffle", children: _jsx(Shuffle, { className: "h-3.5 w-3.5" }) }), !isPanel && (_jsx("button", { onClick: () => removeFromLayout(slot), className: "pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/80 transition hover:bg-primary hover:text-white", "aria-label": "Remove feed from layout", title: "Remove", children: _jsx(X, { className: "h-3.5 w-3.5" }) }))] }), src && playing && hovered && (_jsx("button", { onClick: togglePlay, "aria-label": "Pause", className: "absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white/90 transition hover:bg-black/75", children: _jsx(Pause, { className: "h-4 w-4" }) }))] }));
}
function RailBtn({ label, onClick, disabled, children, }) {
    return (_jsx("button", { onClick: onClick, disabled: disabled, "aria-label": label, title: label, className: "flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30", children: children }));
}
