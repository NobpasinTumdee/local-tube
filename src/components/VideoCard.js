import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, PlaySquare, Volume2, VolumeX, Plus, Play, Clock } from 'lucide-react';
import { useStore } from '../store/useStore';
import { generateThumbnail, thumbnailQueue } from '../utils/generateThumbnail';
import { formatDuration, formatRelative, formatResolution } from '../utils/format';
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
    /* local dimension capture for images (videos get theirs from extraction) */
    const [imgDims, setImgDims] = useState(null);
    const isImage = video.mediaType === 'image';
    /* ── hover preview state ── */
    const previewVideoRef = useRef(null);
    const hoverTimerRef = useRef();
    const previewUrlRef = useRef(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewMuted, setPreviewMuted] = useState(true);
    /* lazy thumbnail via IntersectionObserver (unchanged pipeline + dimensions) */
    const load = useCallback(async () => {
        if (requested || meta?.thumbnailUrl)
            return;
        setRequested(true);
        try {
            const file = await video.handle.getFile();
            if (isImage) {
                /* images: object URL is the thumbnail; dimensions read on <img> load */
                const url = URL.createObjectURL(file);
                setVideoMeta(video.id, { thumbnailUrl: url, duration: undefined });
            }
            else {
                /* videos: extract frame + duration + source dimensions via canvas */
                const result = await thumbnailQueue.run(() => generateThumbnail(file));
                setVideoMeta(video.id, {
                    thumbnailUrl: result.dataUrl,
                    duration: result.duration,
                    width: result.width,
                    height: result.height,
                });
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
        }, { rootMargin: '300px' });
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
    /* ── Aspect ratio: detect vertical ("Shorts") vs standard ── */
    const w = meta?.width ?? imgDims?.w;
    const h = meta?.height ?? imgDims?.h;
    const isVertical = !!w && !!h && h > w;
    const resolution = formatResolution(w, h);
    /* In layout mode a click drops the video into the next free slot. */
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
    return (_jsxs("div", { ref: cardRef, className: "group cursor-pointer outline-none", onClick: handleClick, onMouseEnter: onMouseEnter, onMouseLeave: onMouseLeave, draggable: layoutTarget, onDragStart: layoutTarget
            ? (e) => {
                e.dataTransfer.setData(DND_VIDEO_ID, video.id);
                e.dataTransfer.effectAllowed = 'copy';
            }
            : undefined, children: [_jsxs("div", { className: "relative overflow-hidden rounded-2xl bg-content/[0.04] shadow-lg shadow-black/20 ring-1 ring-content/[0.06] transition-all duration-300 ease-out will-change-transform group-hover:-translate-y-1 group-hover:scale-[1.03] group-hover:shadow-2xl group-hover:shadow-black/40 group-hover:ring-primary/30", style: { aspectRatio: isVertical ? '9 / 16' : '16 / 9' }, children: [thumb ? (_jsx("img", { src: thumb, alt: video.title, onLoad: (e) => {
                            if (isImage && !imgDims) {
                                const t = e.currentTarget;
                                if (t.naturalWidth)
                                    setImgDims({ w: t.naturalWidth, h: t.naturalHeight });
                            }
                        }, className: `h-full w-full transition-transform duration-500 ${isVertical || isImage ? 'object-contain' : 'object-cover'} ${previewUrl ? 'opacity-0' : 'opacity-100'}`, loading: "lazy" })) : (_jsx("div", { className: "flex h-full w-full items-center justify-center", children: failed ? (_jsx(PlaySquare, { className: "h-10 w-10 text-content/10", strokeWidth: 1.5 })) : (_jsx("div", { className: "h-6 w-6 animate-spin rounded-full border-2 border-content/10 border-t-content/40" })) })), previewUrl && (_jsx("video", { ref: previewVideoRef, src: previewUrl, autoPlay: true, muted: previewMuted, loop: true, playsInline: true, className: `absolute inset-0 h-full w-full bg-black ${isVertical ? 'object-contain' : 'object-cover'}`, onCanPlay: () => {
                            const el = previewVideoRef.current;
                            if (el)
                                el.play().catch(() => { });
                        } })), !isImage && !previewUrl && (_jsx("div", { className: "pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100", children: _jsx("span", { className: "flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm ring-1 ring-white/20", children: _jsx(Play, { className: "ml-0.5 h-6 w-6 fill-current" }) }) })), previewUrl && (_jsx("button", { onClick: (e) => {
                            e.stopPropagation();
                            setPreviewMuted((m) => !m);
                        }, className: "absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/90", "aria-label": previewMuted ? 'Unmute preview' : 'Mute preview', children: previewMuted ? _jsx(VolumeX, { className: "h-4 w-4" }) : _jsx(Volume2, { className: "h-4 w-4" }) })), isImage && (_jsxs("span", { className: "absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm", children: [_jsx(ImageIcon, { className: "h-3 w-3" }), "Photo"] })), _jsx("div", { className: "pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-10 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100", children: _jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [!isImage && dur != null && dur > 0 && (_jsxs(MetaChip, { children: [_jsx(Clock, { className: "h-3 w-3" }), formatDuration(dur)] })), resolution && _jsx(MetaChip, { children: resolution }), _jsx(MetaChip, { children: formatRelative(video.lastModified) })] }) }), layoutTarget && (_jsx("div", { className: "pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition group-hover:opacity-100", children: _jsxs("span", { className: "flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg", children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), " Add to layout"] }) }))] }), _jsxs("div", { className: "mt-3 flex gap-3", children: [_jsx("div", { className: `mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold uppercase text-white shadow-sm ${isImage
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                            : 'bg-gradient-to-br from-primary to-accent'}`, children: video.playlist.charAt(0) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-content/95 transition-colors group-hover:text-content", children: video.title }), _jsx("p", { className: "mt-1 truncate text-[13px] font-medium text-content/45", children: video.playlist })] })] })] }));
}
/* ─── Small pill used in the hover metadata rail ─── */
function MetaChip({ children }) {
    return (_jsx("span", { className: "flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm", children: children }));
}
