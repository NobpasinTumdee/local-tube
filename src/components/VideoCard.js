import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, PlaySquare, Volume2, VolumeX, Plus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { generateThumbnail, thumbnailQueue } from '../utils/generateThumbnail';
import { formatDuration, formatSize, formatRelative } from '../utils/format';
import { DND_VIDEO_ID } from '../utils/layoutGrid';
const HOVER_DELAY_MS = 500;
export default function MediaCard({ video }) {
    const meta = useStore((s) => s.videoMeta[video.id]);
    const setVideoMeta = useStore((s) => s.setVideoMeta);
    const playVideo = useStore((s) => s.playVideo);
    const viewImage = useStore((s) => s.viewImage);
    const layoutMode = useStore((s) => s.layoutMode);
    const addToLayout = useStore((s) => s.addToLayout);
    const cardRef = useRef(null);
    const [requested, setRequested] = useState(false);
    const [failed, setFailed] = useState(false);
    const isImage = video.mediaType === 'image';
    /* ── hover preview state ── */
    const previewVideoRef = useRef(null);
    const hoverTimerRef = useRef();
    const previewUrlRef = useRef(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewMuted, setPreviewMuted] = useState(true);
    /* lazy thumbnail via IntersectionObserver */
    const load = useCallback(async () => {
        if (requested || meta?.thumbnailUrl)
            return;
        setRequested(true);
        try {
            const file = await video.handle.getFile();
            if (isImage) {
                /* images: use the object URL directly as thumbnail */
                const url = URL.createObjectURL(file);
                setVideoMeta(video.id, { thumbnailUrl: url, duration: undefined });
            }
            else {
                /* videos: extract frame via canvas */
                const result = await thumbnailQueue.run(() => generateThumbnail(file));
                setVideoMeta(video.id, { thumbnailUrl: result.dataUrl, duration: result.duration });
            }
        }
        catch {
            setFailed(true);
        }
    }, [requested, meta?.thumbnailUrl, video, setVideoMeta, isImage]);
    useEffect(() => {
        const el = cardRef.current;
        if (!el)
            return;
        const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                load();
                obs.disconnect();
            }
        }, { rootMargin: '200px' });
        obs.observe(el);
        return () => obs.disconnect();
    }, [load]);
    /* ── Release any preview blob URL on unmount (memory-leak guard) ── */
    useEffect(() => {
        return () => {
            clearTimeout(hoverTimerRef.current);
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = null;
            }
        };
    }, []);
    const startPreview = useCallback(async () => {
        if (previewUrlRef.current)
            return;
        try {
            const file = await video.handle.getFile();
            const url = URL.createObjectURL(file);
            previewUrlRef.current = url;
            setPreviewUrl(url);
        }
        catch {
            /* silent — fallback to thumbnail */
        }
    }, [video]);
    const stopPreview = useCallback(() => {
        clearTimeout(hoverTimerRef.current);
        const el = previewVideoRef.current;
        if (el) {
            try {
                el.pause();
            }
            catch { /* noop */ }
        }
        setPreviewUrl(null);
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
    }, []);
    const onMouseEnter = () => {
        if (isImage)
            return; // images: no hover preview
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(startPreview, HOVER_DELAY_MS);
    };
    const onMouseLeave = () => {
        stopPreview();
    };
    const thumb = meta?.thumbnailUrl;
    const dur = meta?.duration;
    /* In layout mode a click drops the video into the next free slot instead
       of opening the full player. Images always open the viewer. */
    const layoutTarget = layoutMode && !isImage;
    function handleClick() {
        stopPreview();
        if (isImage)
            viewImage(video.id);
        else if (layoutTarget)
            addToLayout(video.id);
        else
            playVideo(video.id);
    }
    return (_jsxs("div", { ref: cardRef, className: "group cursor-pointer", onClick: handleClick, onMouseEnter: onMouseEnter, onMouseLeave: onMouseLeave, 
        /* Videos are draggable onto a specific grid slot while in layout mode */
        draggable: layoutTarget, onDragStart: layoutTarget
            ? (e) => {
                e.dataTransfer.setData(DND_VIDEO_ID, video.id);
                e.dataTransfer.effectAllowed = 'copy';
            }
            : undefined, children: [_jsxs("div", { className: "relative aspect-video overflow-hidden rounded-xl bg-content/5", children: [layoutTarget && (_jsx("div", { className: "pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/0 opacity-0 transition group-hover:bg-primary/20 group-hover:opacity-100", children: _jsxs("span", { className: "flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg", children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), " Add to layout"] }) })), thumb ? (_jsx("img", { src: thumb, alt: video.title, className: `h-full w-full transition-transform duration-300 group-hover:scale-105 ${isImage ? 'object-contain' : 'object-cover'} ${previewUrl ? 'opacity-0' : 'opacity-100'}`, loading: "lazy" })) : (_jsx("div", { className: "flex h-full w-full items-center justify-center", children: failed ? (
                        /* failed placeholder */
                        _jsx(PlaySquare, { className: "h-10 w-10 text-content/10", strokeWidth: 1.5 })) : (_jsx("div", { className: "h-5 w-5 animate-spin rounded-full border-2 border-content/10 border-t-content/40" })) })), previewUrl && (_jsx("video", { ref: previewVideoRef, src: previewUrl, autoPlay: true, muted: previewMuted, loop: true, playsInline: true, className: "absolute inset-0 h-full w-full bg-black object-cover", onCanPlay: () => {
                            const el = previewVideoRef.current;
                            if (el)
                                el.play().catch(() => { });
                        } })), previewUrl && (_jsx("button", { onClick: (e) => {
                            e.stopPropagation();
                            setPreviewMuted((m) => !m);
                        }, className: "absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-content/90 backdrop-blur-sm transition hover:bg-black/90", "aria-label": previewMuted ? 'Unmute preview' : 'Mute preview', children: previewMuted ? _jsx(VolumeX, { className: "h-3.5 w-3.5" }) : _jsx(Volume2, { className: "h-3.5 w-3.5" }) })), !isImage && dur != null && dur > 0 && !previewUrl && (_jsx("span", { className: "absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-content", children: formatDuration(dur) })), isImage && (_jsxs("span", { className: "absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-content/80 backdrop-blur-sm", children: [_jsx(ImageIcon, { className: "h-3 w-3" }), "IMG"] })), _jsx("div", { className: "absolute inset-0 rounded-xl ring-1 ring-content/0 transition group-hover:ring-content/10" })] }), _jsxs("div", { className: "mt-2.5 flex gap-2.5", children: [_jsx("div", { className: `mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase text-content ${isImage
                            ? 'bg-gradient-to-br from-emerald-600 to-teal-500'
                            : 'bg-gradient-to-br from-purple-600 to-accent'}`, children: video.playlist.charAt(0) }), _jsxs("div", { className: "min-w-0", children: [_jsx("h3", { className: "line-clamp-2 text-sm font-medium leading-snug text-content/90 group-hover:text-content", children: video.title }), _jsx("p", { className: "mt-0.5 truncate text-xs text-content/40", children: video.playlist }), _jsxs("p", { className: "text-xs text-content/40", children: [formatSize(video.size), " \u2022 ", formatRelative(video.lastModified)] })] })] })] }));
}
