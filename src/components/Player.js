import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { formatDuration, formatSize, formatRelative } from '../utils/format';
/* ───── Icons ───── */
const PlayIcon = () => (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M8 5v14l11-7z" }) }));
const PauseIcon = () => (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M6 4h4v16H6zm8 0h4v16h-4z" }) }));
const VolumeIcon = ({ level }) => (_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }), level > 0 && _jsx("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }), level > 0.5 && _jsx("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" })] }));
const FullscreenIcon = () => (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" }) }));
const PipIcon = () => (_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2" }), _jsx("rect", { x: "11", y: "10", width: "9", height: "6", rx: "1" })] }));
const TheaterIcon = () => (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("rect", { x: "2", y: "4", width: "20", height: "16", rx: "2" }) }));
const CloseIcon = () => (_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }));
const ExpandIcon = () => (_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polyline", { points: "15 3 21 3 21 9" }), _jsx("polyline", { points: "9 21 3 21 3 15" }), _jsx("line", { x1: "21", y1: "3", x2: "14", y2: "10" }), _jsx("line", { x1: "3", y1: "21", x2: "10", y2: "14" })] }));
const MiniIcon = () => (_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2" }), _jsx("rect", { x: "11", y: "10", width: "9", height: "6", rx: "1" })] }));
const COUNTDOWN_SECS = 5;
/* ─────────── Player ─────────── */
export default function Player() {
    const playerMode = useStore((s) => s.playerMode);
    const currentVideoId = useStore((s) => s.currentVideoId);
    const videos = useStore((s) => s.videos);
    const theaterMode = useStore((s) => s.theaterMode);
    const setTheaterMode = useStore((s) => s.setTheaterMode);
    const videoMeta = useStore((s) => s.videoMeta);
    const closePlayer = useStore((s) => s.closePlayer);
    const playVideo = useStore((s) => s.playVideo);
    const toggleMiniPlayer = useStore((s) => s.toggleMiniPlayer);
    const playbackQueue = useStore((s) => s.playbackQueue);
    const getNextVideoId = useStore((s) => s.getNextVideoId);
    const video = useMemo(() => videos.find((v) => v.id === currentVideoId), [videos, currentVideoId]);
    /*
     * Next video = files[currentIndex + 1] within the current playback queue
     * (the filtered list the user is browsing). Falls back to first video if
     * we're at the end or the current video isn't in the queue.
     */
    const nextVideo = useMemo(() => {
        if (!video)
            return null;
        const nextId = (() => {
            if (playbackQueue.length === 0)
                return null;
            const idx = playbackQueue.indexOf(video.id);
            if (idx < 0)
                return playbackQueue[0] ?? null;
            if (idx >= playbackQueue.length - 1) {
                // at end — loop to first, but only if there's more than one item
                return playbackQueue.length > 1 ? playbackQueue[0] : null;
            }
            return playbackQueue[idx + 1];
        })();
        if (!nextId || nextId === video.id)
            return null;
        return videos.find((v) => v.id === nextId) ?? null;
    }, [video, playbackQueue, videos]);
    /* "Up Next" sidebar list: start from next in queue, then remaining, then fill with other videos */
    const upNext = useMemo(() => {
        if (!video)
            return [];
        const seen = new Set([video.id]);
        const out = [];
        if (playbackQueue.length > 0) {
            const idx = playbackQueue.indexOf(video.id);
            const order = idx < 0
                ? playbackQueue
                : [...playbackQueue.slice(idx + 1), ...playbackQueue.slice(0, idx)];
            for (const id of order) {
                if (seen.has(id))
                    continue;
                const v = videos.find((x) => x.id === id);
                if (v && v.mediaType === 'video') {
                    out.push(v);
                    seen.add(id);
                }
            }
        }
        // fallback fill
        for (const v of videos) {
            if (seen.has(v.id) || v.mediaType !== 'video')
                continue;
            out.push(v);
            seen.add(v.id);
        }
        return out;
    }, [videos, video, playbackQueue]);
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const progressRef = useRef(null);
    const [src, setSrc] = useState(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const hideTimerRef = useRef();
    /* ── Countdown overlay state ── */
    const [countdown, setCountdown] = useState(null);
    const countdownTimerRef = useRef();
    const clearCountdown = useCallback(() => {
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = undefined;
        }
        setCountdown(null);
    }, []);
    const startCountdown = useCallback(() => {
        if (!nextVideo)
            return;
        clearCountdown();
        setCountdown(COUNTDOWN_SECS);
        countdownTimerRef.current = setInterval(() => {
            setCountdown((c) => {
                if (c == null)
                    return c;
                if (c <= 1) {
                    if (countdownTimerRef.current)
                        clearInterval(countdownTimerRef.current);
                    countdownTimerRef.current = undefined;
                    /* advance to next */
                    const nextId = getNextVideoId();
                    if (nextId)
                        playVideo(nextId);
                    return null;
                }
                return c - 1;
            });
        }, 1000);
    }, [nextVideo, getNextVideoId, playVideo, clearCountdown]);
    /* Stop countdown if the current video changes (user clicked something, or countdown resolved) */
    useEffect(() => {
        clearCountdown();
        return () => clearCountdown();
    }, [currentVideoId, clearCountdown]);
    /* ── Load video blob ── */
    useEffect(() => {
        if (!video)
            return;
        let url;
        let cancelled = false;
        (async () => {
            const f = await video.handle.getFile();
            url = URL.createObjectURL(f);
            if (!cancelled) {
                setSrc(url);
                setPlaying(true);
            }
        })();
        return () => {
            cancelled = true;
            if (url)
                URL.revokeObjectURL(url);
            setSrc(null);
            setCurrent(0);
            setDuration(0);
        };
    }, [video]);
    /* auto-play on src change */
    useEffect(() => {
        const el = videoRef.current;
        if (!el || !src)
            return;
        el.play().catch(() => { });
    }, [src]);
    /* ── keyboard (player-scoped, 'i' handled in App) ── */
    useEffect(() => {
        function onKey(e) {
            if (e.target.tagName === 'INPUT')
                return;
            const el = videoRef.current;
            if (!el)
                return;
            if (e.key === 'Escape') {
                if (countdown != null) {
                    clearCountdown();
                    return;
                }
                closePlayer();
                return;
            }
            /* only handle player shortcuts in full mode */
            if (playerMode !== 'full')
                return;
            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    el.paused ? el.play() : el.pause();
                    break;
                case 'f':
                    containerRef.current?.requestFullscreen?.();
                    break;
                case 't':
                    setTheaterMode(!theaterMode);
                    break;
                case 'ArrowLeft':
                    el.currentTime = Math.max(0, el.currentTime - 5);
                    break;
                case 'ArrowRight':
                    el.currentTime = Math.min(el.duration, el.currentTime + 5);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    el.volume = Math.min(1, el.volume + 0.05);
                    setVolume(el.volume);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    el.volume = Math.max(0, el.volume - 0.05);
                    setVolume(el.volume);
                    break;
                case 'm':
                    el.muted = !el.muted;
                    setMuted(el.muted);
                    break;
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closePlayer, playerMode, theaterMode, setTheaterMode, countdown, clearCountdown]);
    /* controls auto‑hide (full mode only) */
    const resetHideTimer = useCallback(() => {
        setShowControls(true);
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused)
                setShowControls(false);
        }, 3000);
    }, []);
    const seek = useCallback((e) => {
        const el = videoRef.current;
        const bar = progressRef.current;
        if (!el || !bar)
            return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        el.currentTime = ratio * el.duration;
    }, []);
    const togglePip = async () => {
        try {
            const el = videoRef.current;
            if (!el)
                return;
            if (document.pictureInPictureElement)
                await document.exitPictureInPicture();
            else
                await el.requestPictureInPicture();
        }
        catch { /* unsupported */ }
    };
    const toggleFullscreen = () => {
        if (document.fullscreenElement)
            document.exitFullscreen();
        else
            containerRef.current?.requestFullscreen?.();
    };
    if (!video || playerMode === 'none')
        return null;
    const isFull = playerMode === 'full';
    const progress = duration > 0 ? (current / duration) * 100 : 0;
    return (_jsxs(_Fragment, { children: [_jsx(AnimatePresence, { children: isFull && (_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.25 }, className: "fixed inset-0 z-[99] bg-[#0f0f0f]" }, "player-bg")) }), _jsxs(motion.div, { layout: true, transition: { type: 'spring', damping: 28, stiffness: 320, mass: 0.8 }, className: isFull
                    ? 'fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[#0f0f0f] lg:flex-row'
                    : 'fixed bottom-5 right-5 z-[200] flex w-[340px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#181818] shadow-2xl shadow-black/60', children: [_jsxs("div", { className: isFull ? `flex flex-col ${theaterMode ? 'w-full' : 'w-full lg:flex-1'}` : '', children: [_jsxs("div", { ref: containerRef, className: `group relative bg-black ${isFull
                                    ? 'flex w-full items-center justify-center'
                                    : 'aspect-video w-full'}`, style: isFull ? { height: '80vh' } : undefined, onMouseMove: isFull ? resetHideTimer : undefined, onMouseLeave: isFull ? () => { if (!videoRef.current?.paused)
                                    setShowControls(false); } : undefined, children: [_jsx("video", { ref: videoRef, src: src || undefined, className: "h-full w-full object-contain", onTimeUpdate: () => setCurrent(videoRef.current?.currentTime ?? 0), onLoadedMetadata: () => setDuration(videoRef.current?.duration ?? 0), onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => {
                                            if (nextVideo)
                                                startCountdown();
                                        }, onClick: () => { const el = videoRef.current; el.paused ? el.play() : el.pause(); } }), isFull && countdown != null && nextVideo && (_jsx(CountdownOverlay, { seconds: countdown, total: COUNTDOWN_SECS, next: nextVideo, thumbnail: videoMeta[nextVideo.id]?.thumbnailUrl, onPlayNow: () => {
                                            clearCountdown();
                                            playVideo(nextVideo.id);
                                        }, onCancel: clearCountdown })), isFull && countdown == null && (_jsxs("div", { className: `absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'pointer-events-none opacity-0'}`, children: [_jsxs("div", { ref: progressRef, className: "group/bar relative flex h-5 cursor-pointer items-center", onClick: seek, children: [_jsx("div", { className: "h-[3px] w-full rounded-full bg-white/20 transition-all group-hover/bar:h-[5px]", children: _jsx("div", { className: "h-full rounded-full bg-red-600 transition-all", style: { width: `${progress}%` } }) }), _jsx("div", { className: "absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-red-600 opacity-0 shadow transition-opacity group-hover/bar:opacity-100", style: { left: `calc(${progress}% - 7px)` } })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => { const el = videoRef.current; el.paused ? el.play() : el.pause(); }, className: "flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10", "aria-label": playing ? 'Pause' : 'Play', children: playing ? _jsx(PauseIcon, {}) : _jsx(PlayIcon, {}) }), _jsxs("div", { className: "group/vol flex items-center gap-1", children: [_jsx("button", { onClick: () => { const el = videoRef.current; el.muted = !el.muted; setMuted(el.muted); }, className: "flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10", "aria-label": "Mute", children: _jsx(VolumeIcon, { level: muted ? 0 : volume }) }), _jsx("input", { type: "range", min: "0", max: "1", step: "0.01", value: muted ? 0 : volume, onChange: (e) => { const v = parseFloat(e.target.value); setVolume(v); setMuted(v === 0); if (videoRef.current) {
                                                                    videoRef.current.volume = v;
                                                                    videoRef.current.muted = v === 0;
                                                                } }, className: "w-0 origin-left scale-x-0 opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:scale-x-100 group-hover/vol:opacity-100" })] }), _jsxs("span", { className: "ml-1 text-xs tabular-nums text-white/70", children: [formatDuration(current), " / ", formatDuration(duration)] }), _jsx("div", { className: "flex-1" }), _jsx("button", { onClick: toggleMiniPlayer, className: "flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white", "aria-label": "Mini player (i)", title: "Mini player (i)", children: _jsx(MiniIcon, {}) }), _jsx("button", { onClick: togglePip, className: "flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white", "aria-label": "Picture in Picture", children: _jsx(PipIcon, {}) }), _jsx("button", { onClick: () => setTheaterMode(!theaterMode), className: `flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10 ${theaterMode ? 'text-white' : 'text-white/70 hover:text-white'}`, "aria-label": "Theater mode", children: _jsx(TheaterIcon, {}) }), _jsx("button", { onClick: toggleFullscreen, className: "flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white", "aria-label": "Fullscreen", children: _jsx(FullscreenIcon, {}) })] })] }))] }), isFull && (_jsxs("div", { className: "flex items-start gap-3 px-4 py-4 lg:px-6", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h1", { className: "text-lg font-semibold leading-snug text-white lg:text-xl", children: video.title }), _jsxs("div", { className: "mt-1 flex flex-wrap items-center gap-x-3 text-sm text-white/50", children: [_jsx("span", { children: video.playlist }), _jsx("span", { children: "\u2022" }), _jsx("span", { children: formatSize(video.size) }), _jsx("span", { children: "\u2022" }), _jsx("span", { children: formatRelative(video.lastModified) })] })] }), _jsx("button", { onClick: closePlayer, className: "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white", "aria-label": "Close player", children: _jsx(CloseIcon, {}) })] }))] }), isFull && (_jsxs("aside", { className: `shrink-0 overflow-y-auto border-t border-white/5 bg-[#0f0f0f] px-3 py-4 lg:border-l lg:border-t-0 ${theaterMode ? 'w-full lg:w-96' : 'w-full lg:w-96'}`, children: [_jsx("h2", { className: "mb-3 px-2 text-sm font-semibold text-white/60", children: "Up Next" }), _jsxs("div", { className: "flex flex-col gap-2", children: [upNext.slice(0, 50).map((v) => (_jsx(UpNextItem, { video: v, meta: videoMeta[v.id], onPlay: () => playVideo(v.id) }, v.id))), upNext.length === 0 && _jsx("p", { className: "px-2 py-8 text-center text-sm text-white/30", children: "No more videos" })] })] })), !isFull && (_jsxs("div", { className: "flex items-center gap-1 bg-[#181818] px-2 py-1.5", children: [_jsx("button", { onClick: () => { const el = videoRef.current; el.paused ? el.play() : el.pause(); }, className: "flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10", "aria-label": playing ? 'Pause' : 'Play', children: playing ? _jsx(PauseIcon, {}) : _jsx(PlayIcon, {}) }), _jsx("span", { className: "mx-1 flex-1 truncate text-xs font-medium text-white/70", children: video.title }), _jsx("div", { className: "absolute inset-x-0 top-0 h-[2px] bg-white/10", children: _jsx("div", { className: "h-full bg-red-600 transition-all", style: { width: `${progress}%` } }) }), _jsx("button", { onClick: toggleMiniPlayer, className: "flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white", "aria-label": "Expand", title: "Expand (i)", children: _jsx(ExpandIcon, {}) }), _jsx("button", { onClick: closePlayer, className: "flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white", "aria-label": "Close", children: _jsx(CloseIcon, {}) })] }))] })] }));
}
/* ─── Countdown Overlay ─── */
function CountdownOverlay({ seconds, total, next, thumbnail, onPlayNow, onCancel, }) {
    const pct = ((total - seconds) / total) * 100;
    return (_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 }, className: "absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm", children: _jsxs("div", { className: "flex w-full max-w-lg flex-col items-center gap-4 px-6 py-5 text-center", children: [_jsxs("p", { className: "text-sm font-medium uppercase tracking-widest text-white/60", children: ["Up next in ", _jsx("span", { className: "text-white", children: seconds }), "..."] }), _jsxs("div", { className: "relative w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl shadow-black/50", children: [_jsxs("div", { className: "relative aspect-video w-full", children: [thumbnail ? (_jsx("img", { src: thumbnail, alt: next.title, className: "h-full w-full object-cover" })) : (_jsx("div", { className: "flex h-full w-full items-center justify-center", children: _jsx(PlayCircle, { className: "h-12 w-12 text-white/20" }) })), _jsx("div", { className: "absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 to-transparent" }), _jsxs("div", { className: "absolute inset-x-0 bottom-0 px-4 pb-3 text-left", children: [_jsx("p", { className: "truncate text-base font-semibold text-white", children: next.title }), _jsx("p", { className: "truncate text-xs text-white/60", children: next.playlist })] })] }), _jsx("div", { className: "h-[3px] w-full bg-white/10", children: _jsx("div", { className: "h-full bg-red-500 transition-[width] duration-1000 ease-linear", style: { width: `${pct}%` } }) })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("button", { onClick: onCancel, className: "flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white", children: [_jsx(X, { className: "h-4 w-4" }), "Cancel"] }), _jsxs("button", { onClick: onPlayNow, className: "flex items-center gap-1.5 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500", children: [_jsx(PlayCircle, { className: "h-4 w-4" }), "Play Now"] })] })] }) }));
}
/* ─── Up Next item ─── */
function UpNextItem({ video, meta, onPlay }) {
    return (_jsxs("button", { onClick: onPlay, className: "flex gap-2 rounded-lg p-2 text-left transition hover:bg-white/5", children: [_jsxs("div", { className: "relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-white/5", children: [meta?.thumbnailUrl ? (_jsx("img", { src: meta.thumbnailUrl, alt: video.title, className: "h-full w-full object-cover", loading: "lazy" })) : (_jsx("div", { className: "flex h-full w-full items-center justify-center", children: _jsx(PlayCircle, { className: "h-6 w-6 text-white/10" }) })), meta?.duration != null && meta.duration > 0 && (_jsx("span", { className: "absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white", children: formatDuration(meta.duration) }))] }), _jsxs("div", { className: "min-w-0 flex-1 py-0.5", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium leading-snug text-white/80", children: video.title }), _jsx("p", { className: "mt-0.5 truncate text-xs text-white/40", children: video.playlist }), _jsx("p", { className: "text-xs text-white/40", children: formatSize(video.size) })] })] }));
}
