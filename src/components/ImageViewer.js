import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { formatSize, formatRelative } from '../utils/format';
export default function ImageViewer() {
    const currentImageId = useStore((s) => s.currentImageId);
    const videos = useStore((s) => s.videos);
    const closeImage = useStore((s) => s.closeImage);
    const viewImage = useStore((s) => s.viewImage);
    const image = useMemo(() => videos.find((v) => v.id === currentImageId), [videos, currentImageId]);
    /* sibling images in same playlist for prev/next */
    const siblings = useMemo(() => videos.filter((v) => v.mediaType === 'image' && v.playlist === image?.playlist), [videos, image]);
    const currentIdx = useMemo(() => siblings.findIndex((v) => v.id === currentImageId), [siblings, currentImageId]);
    const [objectUrl, setObjectUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    /* load blob URL whenever image changes */
    useEffect(() => {
        if (!image)
            return;
        setLoading(true);
        let url;
        let cancelled = false;
        (async () => {
            const f = await image.handle.getFile();
            url = URL.createObjectURL(f);
            if (!cancelled)
                setObjectUrl(url);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
            setObjectUrl(null);
            if (url)
                URL.revokeObjectURL(url);
        };
    }, [image]);
    /* keyboard navigation */
    useEffect(() => {
        function onKey(e) {
            if (e.target.tagName === 'INPUT')
                return;
            if (e.key === 'Escape') {
                closeImage();
                return;
            }
            if (e.key === 'ArrowRight' && siblings[currentIdx + 1])
                viewImage(siblings[currentIdx + 1].id);
            if (e.key === 'ArrowLeft' && siblings[currentIdx - 1])
                viewImage(siblings[currentIdx - 1].id);
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closeImage, viewImage, siblings, currentIdx]);
    if (!image)
        return null;
    const hasPrev = currentIdx > 0;
    const hasNext = currentIdx < siblings.length - 1;
    return (_jsxs("div", { className: "fixed inset-0 z-[100] flex flex-col bg-[#0f0f0f]", children: [_jsxs("div", { className: "flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-[#0f0f0f]/90 px-4 backdrop-blur", children: [_jsx("button", { onClick: closeImage, className: "flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white", "aria-label": "Back", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "15 18 9 12 15 6" }) }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "truncate text-sm font-medium text-white/90", children: image.title }), _jsxs("p", { className: "text-xs text-white/40", children: [image.playlist, " \u2022 ", formatSize(image.size), " \u2022 ", formatRelative(image.lastModified)] })] }), siblings.length > 1 && (_jsxs("span", { className: "shrink-0 text-xs tabular-nums text-white/40", children: [currentIdx + 1, " / ", siblings.length] }))] }), _jsxs("div", { className: "relative flex flex-1 items-center justify-center overflow-hidden", children: [loading ? (_jsx("div", { className: "h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-white/40" })) : objectUrl ? (_jsx("img", { src: objectUrl, alt: image.title, className: "max-h-full max-w-full object-contain select-none", style: { height: 'calc(100vh - 3.5rem)' }, draggable: false }, objectUrl)) : (_jsx("p", { className: "text-white/30", children: "Could not load image." })), hasPrev && (_jsx("button", { onClick: () => viewImage(siblings[currentIdx - 1].id), className: "absolute left-3 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/70 hover:text-white", "aria-label": "Previous image", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-6 w-6", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "15 18 9 12 15 6" }) }) })), hasNext && (_jsx("button", { onClick: () => viewImage(siblings[currentIdx + 1].id), className: "absolute right-3 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/70 hover:text-white", "aria-label": "Next image", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-6 w-6", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "9 18 15 12 9 6" }) }) }))] })] }));
}
