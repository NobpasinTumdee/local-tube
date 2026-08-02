import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Film, PlaySquare, Volume2, VolumeX, Plus, Play, Clock, Heart, ListPlus, Check, Tag, Hash, X } from 'lucide-react';
import { useStore, normalizeTag } from '../store/useStore';
import { generateThumbnail, thumbnailQueue } from '../utils/generateThumbnail';
import { formatDuration, formatRelative, formatResolution } from '../utils/format';
import { DND_MEDIA_ID } from '../utils/layoutGrid';
const HOVER_DELAY_MS = 500;
export default function MediaCard({ video }) {
    const meta = useStore((s) => s.videoMeta[video.id]);
    const setVideoMeta = useStore((s) => s.setVideoMeta);
    const playVideo = useStore((s) => s.playVideo);
    const viewImage = useStore((s) => s.viewImage);
    const layoutMode = useStore((s) => s.layoutMode);
    const addToLayout = useStore((s) => s.addToLayout);
    const cardAspectRatio = useStore((s) => s.cardAspectRatio);
    /* favorites & virtual playlists */
    const isFav = useStore((s) => s.favorites.includes(video.id));
    const playlists = useStore((s) => s.virtualPlaylists);
    const toggleFavorite = useStore((s) => s.toggleFavorite);
    const togglePlaylistItem = useStore((s) => s.togglePlaylistItem);
    const createPlaylist = useStore((s) => s.createPlaylist);
    const addToPlaylist = useStore((s) => s.addToPlaylist);
    /* custom tags for this item */
    const tags = useStore((s) => s.mediaTags[video.id]);
    const addTag = useStore((s) => s.addTag);
    const removeTag = useStore((s) => s.removeTag);
    const cardRef = useRef(null);
    const [requested, setRequested] = useState(false);
    const [failed, setFailed] = useState(false);
    /* local dimension capture for images (videos get theirs from extraction) */
    const [imgDims, setImgDims] = useState(null);
    /* playlist dropdown (rendered via portal so card/shelf overflow can't clip it) */
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState(null);
    const [newName, setNewName] = useState('');
    const plBtnRef = useRef(null);
    const menuRef = useRef(null);
    /* tag editor menu (also a portal) */
    const [tagMenuOpen, setTagMenuOpen] = useState(false);
    const [tagMenuPos, setTagMenuPos] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const [tagSuggestions, setTagSuggestions] = useState([]);
    const tagBtnRef = useRef(null);
    const tagMenuRef = useRef(null);
    useEffect(() => {
        if (!menuOpen)
            return;
        const onDown = (e) => {
            if (menuRef.current?.contains(e.target) || plBtnRef.current?.contains(e.target))
                return;
            setMenuOpen(false);
        };
        const close = () => setMenuOpen(false);
        const onKey = (e) => { if (e.key === 'Escape')
            setMenuOpen(false); };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);
    const openPlaylistMenu = (e) => {
        e.stopPropagation();
        setTagMenuOpen(false);
        const r = plBtnRef.current?.getBoundingClientRect();
        if (r)
            setMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
        setMenuOpen((o) => !o);
    };
    const createAndAdd = () => {
        const name = newName.trim();
        if (!name)
            return;
        addToPlaylist(createPlaylist(name), video.id);
        setNewName('');
    };
    /* ── tag editor ── */
    useEffect(() => {
        if (!tagMenuOpen)
            return;
        const onDown = (e) => {
            if (tagMenuRef.current?.contains(e.target) || tagBtnRef.current?.contains(e.target))
                return;
            setTagMenuOpen(false);
        };
        const close = () => setTagMenuOpen(false);
        const onKey = (e) => { if (e.key === 'Escape')
            setTagMenuOpen(false); };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('keydown', onKey);
        };
    }, [tagMenuOpen]);
    const openTagMenu = (e) => {
        e.stopPropagation();
        setMenuOpen(false);
        const r = tagBtnRef.current?.getBoundingClientRect();
        if (r)
            setTagMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
        /* snapshot all previously-used tags across the library (non-reactive) */
        const all = useStore.getState().mediaTags;
        const set = new Set();
        for (const arr of Object.values(all))
            for (const t of arr)
                set.add(t);
        (tags ?? []).forEach((t) => set.delete(t));
        setTagSuggestions([...set].sort((a, b) => a.localeCompare(b)));
        setTagMenuOpen((o) => !o);
    };
    const commitTag = (raw) => {
        addTag(video.id, raw);
        setTagInput('');
        const norm = normalizeTag(raw);
        if (norm)
            setTagSuggestions((s) => s.filter((t) => t !== norm));
    };
    const isImage = video.mediaType === 'image';
    /* ── hover preview state (videos only) ── */
    const previewVideoRef = useRef(null);
    const hoverTimerRef = useRef();
    const previewUrlRef = useRef(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewMuted, setPreviewMuted] = useState(true);
    /* lazy thumbnail via IntersectionObserver.
       Videos → canvas frame extraction; images → object URL directly (no canvas). */
    const load = useCallback(async () => {
        if (requested || meta?.thumbnailUrl)
            return;
        setRequested(true);
        try {
            const file = await video.handle.getFile();
            if (isImage) {
                const url = URL.createObjectURL(file);
                setVideoMeta(video.id, { thumbnailUrl: url, duration: undefined });
            }
            else {
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
    /* ── Release preview blob URL on unmount (memory-leak guard) ── */
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
    const onMouseLeave = () => stopPreview();
    const thumb = meta?.thumbnailUrl;
    const dur = meta?.duration;
    /* ── Uniform aspect ratio from display preference (media fills via object-cover) ── */
    const w = meta?.width ?? imgDims?.w;
    const h = meta?.height ?? imgDims?.h;
    const resolution = formatResolution(w, h);
    const aspectClass = cardAspectRatio === '9/16' ? 'aspect-[9/16]' : cardAspectRatio === '1/1' ? 'aspect-square' : 'aspect-video';
    /* In layout mode a click drops the item (video OR image) into a slot. */
    const layoutTarget = layoutMode;
    function handleClick() {
        stopPreview();
        if (layoutMode) {
            addToLayout(video.id);
            return;
        }
        if (isImage)
            viewImage(video.id);
        else
            playVideo(video.id);
    }
    return (_jsxs("div", { ref: cardRef, className: "group cursor-pointer outline-none", onClick: handleClick, onMouseEnter: onMouseEnter, onMouseLeave: onMouseLeave, 
        /* Videos and images are both draggable onto a specific grid slot */
        draggable: layoutTarget, onDragStart: layoutTarget
            ? (e) => {
                e.dataTransfer.setData(DND_MEDIA_ID, video.id);
                e.dataTransfer.effectAllowed = 'copy';
            }
            : undefined, children: [_jsxs("div", { className: `relative overflow-hidden rounded-2xl bg-content/[0.04] shadow-lg shadow-black/20 ring-1 ring-content/[0.06] transition-all duration-300 ease-out will-change-transform group-hover:-translate-y-1 group-hover:scale-[1.03] group-hover:shadow-2xl group-hover:shadow-black/40 group-hover:ring-primary/30 ${aspectClass}`, children: [thumb ? (_jsx("img", { src: thumb, alt: video.title, onLoad: (e) => {
                            if (isImage && !imgDims) {
                                const t = e.currentTarget;
                                if (t.naturalWidth)
                                    setImgDims({ w: t.naturalWidth, h: t.naturalHeight });
                            }
                        }, className: `h-full w-full object-cover transition-transform duration-500 ${previewUrl ? 'opacity-0' : 'opacity-100'}`, loading: "lazy" })) : (_jsx("div", { className: "flex h-full w-full items-center justify-center", children: failed ? (_jsx(PlaySquare, { className: "h-10 w-10 text-content/10", strokeWidth: 1.5 })) : (_jsx("div", { className: "h-6 w-6 animate-spin rounded-full border-2 border-content/10 border-t-content/40" })) })), previewUrl && (_jsx("video", { ref: previewVideoRef, src: previewUrl, autoPlay: true, muted: previewMuted, loop: true, playsInline: true, className: "absolute inset-0 h-full w-full bg-black object-cover", onCanPlay: () => {
                            const el = previewVideoRef.current;
                            if (el)
                                el.play().catch(() => { });
                        } })), _jsxs("span", { className: "absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm", children: [isImage ? _jsx(ImageIcon, { className: "h-3 w-3" }) : _jsx(Film, { className: "h-3 w-3" }), isImage ? 'Photo' : 'Video'] }), !isImage && !previewUrl && (_jsx("div", { className: "pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100", children: _jsx("span", { className: "flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm ring-1 ring-white/20", children: _jsx(Play, { className: "ml-0.5 h-6 w-6 fill-current" }) }) })), _jsxs("div", { className: `absolute right-2 top-2 z-30 flex items-center gap-1.5 transition-opacity ${isFav || menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`, children: [previewUrl && (_jsx("button", { onClick: (e) => { e.stopPropagation(); setPreviewMuted((m) => !m); }, className: "flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/90", "aria-label": previewMuted ? 'Unmute preview' : 'Mute preview', children: previewMuted ? _jsx(VolumeX, { className: "h-4 w-4" }) : _jsx(Volume2, { className: "h-4 w-4" }) })), _jsx("button", { onClick: (e) => { e.stopPropagation(); toggleFavorite(video.id); }, className: `flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition ${isFav ? 'bg-black/60 text-primary' : 'bg-black/50 text-white/90 hover:bg-black/80'}`, "aria-label": isFav ? 'Remove from favorites' : 'Add to favorites', title: isFav ? 'Unfavorite' : 'Favorite', children: _jsx(Heart, { className: `h-4 w-4 ${isFav ? 'fill-current' : ''}` }) }), _jsx("button", { ref: plBtnRef, onClick: openPlaylistMenu, className: `flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition ${menuOpen ? 'bg-black/80 text-white' : 'bg-black/50 text-white/90 hover:bg-black/80'}`, "aria-label": "Add to playlist", title: "Add to playlist", children: _jsx(ListPlus, { className: "h-4 w-4" }) }), _jsx("button", { ref: tagBtnRef, onClick: openTagMenu, className: `flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition ${tagMenuOpen ? 'bg-black/80 text-white' : 'bg-black/50 text-white/90 hover:bg-black/80'}`, "aria-label": "Edit tags", title: "Tags", children: _jsx(Tag, { className: "h-4 w-4" }) })] }), menuOpen && menuPos && createPortal(_jsxs("div", { ref: menuRef, className: "fixed z-[300] w-60 overflow-hidden rounded-xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur-xl", style: { top: menuPos.top, right: menuPos.right }, onClick: (e) => e.stopPropagation(), children: [_jsx("div", { className: "border-b border-content/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content/50", children: "Add to playlist" }), _jsxs("div", { className: "max-h-56 overflow-y-auto py-1 scrollbar-thin", children: [playlists.length === 0 && (_jsx("p", { className: "px-3 py-2 text-xs text-content/40", children: "No playlists yet \u2014 create one below." })), playlists.map((p) => {
                                        const has = p.mediaIds.includes(video.id);
                                        return (_jsxs("button", { onClick: () => togglePlaylistItem(p.id, video.id), className: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-content/80 transition hover:bg-content/10", children: [_jsx("span", { className: `flex h-4 w-4 shrink-0 items-center justify-center rounded border ${has ? 'border-primary bg-primary text-white' : 'border-content/30'}`, children: has && _jsx(Check, { className: "h-3 w-3", strokeWidth: 3 }) }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: p.title }), _jsx("span", { className: "text-[10px] tabular-nums text-content/30", children: p.mediaIds.length })] }, p.id));
                                    })] }), _jsxs("div", { className: "flex items-center gap-1 border-t border-content/10 p-2", children: [_jsx("input", { value: newName, onChange: (e) => setNewName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') {
                                            e.preventDefault();
                                            createAndAdd();
                                        } }, placeholder: "New playlist\u2026", className: "h-8 min-w-0 flex-1 rounded-lg border border-content/10 bg-content/5 px-2 text-sm text-content placeholder-content/40 outline-none focus:border-primary/50" }), _jsxs("button", { onClick: createAndAdd, disabled: !newName.trim(), className: "flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40", children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), " Add"] })] })] }), document.body), tagMenuOpen && tagMenuPos && createPortal(_jsxs("div", { ref: tagMenuRef, className: "fixed z-[300] w-64 overflow-hidden rounded-xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur-xl", style: { top: tagMenuPos.top, right: tagMenuPos.right }, onClick: (e) => e.stopPropagation(), children: [_jsx("div", { className: "border-b border-content/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content/50", children: "Tags" }), tags && tags.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1.5 px-3 pt-2.5", children: tags.map((t) => (_jsxs("span", { className: "flex items-center gap-1 rounded-full bg-primary/15 py-0.5 pl-2 pr-1 text-xs font-medium text-primary", children: [t, _jsx("button", { onClick: () => removeTag(video.id, t), className: "flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/25", "aria-label": `Remove tag ${t}`, children: _jsx(X, { className: "h-3 w-3" }) })] }, t))) })), _jsxs("div", { className: "flex items-center gap-1 p-2", children: [_jsx("input", { value: tagInput, onChange: (e) => setTagInput(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') {
                                            e.preventDefault();
                                            commitTag(tagInput);
                                        } }, placeholder: "Add a tag\u2026", className: "h-8 min-w-0 flex-1 rounded-lg border border-content/10 bg-content/5 px-2 text-sm text-content placeholder-content/40 outline-none focus:border-primary/50" }), _jsxs("button", { onClick: () => commitTag(tagInput), disabled: !tagInput.trim(), className: "flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40", children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), " Add"] })] }), tagSuggestions.length > 0 && (_jsxs("div", { className: "border-t border-content/10 px-3 py-2", children: [_jsx("p", { className: "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-content/40", children: "Previously used" }), _jsx("div", { className: "flex max-h-28 flex-wrap gap-1.5 overflow-y-auto scrollbar-thin", children: tagSuggestions.map((t) => (_jsxs("button", { onClick: () => commitTag(t), className: "flex items-center gap-1 rounded-full border border-content/10 bg-content/[0.03] px-2 py-0.5 text-xs font-medium text-content/60 transition hover:border-primary/40 hover:text-primary", children: [_jsx(Hash, { className: "h-2.5 w-2.5 opacity-70" }), t] }, t))) })] }))] }), document.body), tags && tags.length > 0 && (_jsxs("div", { className: "pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-wrap gap-1 transition-opacity duration-200 group-hover:opacity-0", children: [tags.slice(0, 3).map((t) => (_jsxs("span", { className: "flex items-center gap-0.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm", children: [_jsx(Hash, { className: "h-2.5 w-2.5 opacity-70" }), t] }, t))), tags.length > 3 && (_jsxs("span", { className: "rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white/80 backdrop-blur-sm", children: ["+", tags.length - 3] }))] })), _jsx("div", { className: "pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-10 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100", children: _jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [!isImage && dur != null && dur > 0 && (_jsxs(MetaChip, { children: [_jsx(Clock, { className: "h-3 w-3" }), formatDuration(dur)] })), resolution && _jsx(MetaChip, { children: resolution }), _jsx(MetaChip, { children: formatRelative(video.lastModified) })] }) }), layoutTarget && (_jsx("div", { className: "pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition group-hover:opacity-100", children: _jsxs("span", { className: "flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg", children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), " Add to layout"] }) }))] }), _jsxs("div", { className: "mt-3 flex gap-3", children: [_jsx("div", { className: `mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold uppercase text-white shadow-sm ${isImage
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                            : 'bg-gradient-to-br from-primary to-accent'}`, children: video.playlist.charAt(0) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-content/95 transition-colors group-hover:text-content", children: video.title }), _jsx("p", { className: "mt-1 truncate text-[13px] font-medium text-content/45", children: video.playlist })] })] })] }));
}
/* ─── Small pill used in the hover metadata rail ─── */
function MetaChip({ children }) {
    return (_jsx("span", { className: "flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm", children: children }));
}
