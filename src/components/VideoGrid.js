import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Folder, List, Search, Heart, ListMusic } from 'lucide-react';
import MediaCard from './MediaCard';
import Breadcrumb from './Breadcrumb';
import { useStore } from '../store/useStore';
import { getChildFolders, getAllFilesRecursively } from '../utils/directoryScanner';
/* Cap the cascade so large libraries don't animate for seconds. */
const entryDelay = (i) => Math.min(i * 0.03, 0.4);
const matchesFilter = (v, f) => f === 'all' || (f === 'videos' && v.mediaType === 'video') || (f === 'images' && v.mediaType === 'image');
export default function VideoGrid({ videos }) {
    const currentFolderPath = useStore((s) => s.currentFolderPath);
    const directoryTree = useStore((s) => s.directoryTree);
    const setCurrentFolder = useStore((s) => s.setCurrentFolder);
    const viewMode = useStore((s) => s.viewMode);
    const setViewMode = useStore((s) => s.setViewMode);
    const allVideos = useStore((s) => s.videos);
    const homeFilter = useStore((s) => s.homeFilter);
    const searchQuery = useStore((s) => s.searchQuery);
    const collection = useStore((s) => s.collection);
    const virtualPlaylists = useStore((s) => s.virtualPlaylists);
    /* ── Virtual collection view (Favorites / a Playlist) ── */
    if (collection.type !== 'all') {
        const isFav = collection.type === 'favorites';
        const playlist = collection.type === 'playlist' ? virtualPlaylists.find((p) => p.id === collection.playlistId) : null;
        const title = isFav ? 'Favorites' : playlist?.title ?? 'Playlist';
        return (_jsxs("div", { children: [_jsxs("div", { className: "mb-7 flex items-center gap-3", children: [_jsx("span", { className: "flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary", children: isFav ? _jsx(Heart, { className: "h-5 w-5 fill-current" }) : _jsx(ListMusic, { className: "h-5 w-5" }) }), _jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold tracking-tight text-content", children: title }), _jsxs("p", { className: "text-xs font-medium text-content/40", children: [videos.length, " item", videos.length !== 1 ? 's' : ''] })] })] }), videos.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center gap-3 py-28 text-content/30", children: [isFav ? _jsx(Heart, { className: "h-14 w-14", strokeWidth: 1 }) : _jsx(ListMusic, { className: "h-14 w-14", strokeWidth: 1 }), _jsx("p", { className: "text-lg font-semibold text-content/50", children: isFav ? 'No favorites yet' : 'This playlist is empty' }), _jsx("p", { className: "text-sm", children: isFav
                                ? 'Hover any video or image and tap the heart to save it here.'
                                : 'Hover a card and use “+ Playlist” to add items.' })] })) : (_jsx("div", { className: "grid grid-cols-1 items-start gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: videos.map((v, i) => (_jsx(motion.div, { layout: true, initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: entryDelay(i), ease: 'easeOut' }, children: _jsx(MediaCard, { video: v }) }, v.id))) }))] }));
    }
    /* subfolders at the current level (only meaningful in nested mode) */
    const subfolders = viewMode === 'nested' && directoryTree
        ? getChildFolders(directoryTree, currentFolderPath)
        : [];
    /* Netflix-style "shelves" home: root + nested + not searching */
    const useShelves = currentFolderPath === '' &&
        viewMode === 'nested' &&
        !searchQuery.trim() &&
        !!directoryTree &&
        directoryTree.children.length > 0;
    const hasContent = subfolders.length > 0 || videos.length > 0;
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-6 flex flex-wrap items-center gap-3", children: [_jsx("div", { className: "flex-1", children: _jsx(Breadcrumb, {}) }), _jsxs("div", { className: "flex shrink-0 items-center gap-1 rounded-xl border border-content/[0.06] bg-content/[0.03] p-1", children: [_jsx(ViewToggleBtn, { label: "Folders", icon: _jsx(Folder, { className: "h-3.5 w-3.5" }), value: "nested", current: viewMode, onClick: setViewMode }), _jsx(ViewToggleBtn, { label: "All Files", icon: _jsx(List, { className: "h-3.5 w-3.5" }), value: "flat", current: viewMode, onClick: setViewMode })] })] }), !hasContent && _jsx(EmptyState, {}), useShelves ? (_jsxs("div", { className: "flex flex-col gap-9", children: [directoryTree.children.map((node, i) => {
                        const ids = new Set(getAllFilesRecursively(allVideos, node.path));
                        const items = allVideos.filter((v) => ids.has(v.id) && matchesFilter(v, homeFilter));
                        if (items.length === 0)
                            return null;
                        return (_jsx(Shelf, { title: node.name, count: items.length, items: items.slice(0, 18), index: i, onSeeAll: () => setCurrentFolder(node.path) }, node.path));
                    }), (() => {
                        const rootFiles = allVideos.filter((v) => v.parentPath === '' && matchesFilter(v, homeFilter));
                        if (rootFiles.length === 0)
                            return null;
                        return (_jsx(Shelf, { title: "In this folder", count: rootFiles.length, items: rootFiles.slice(0, 18), index: directoryTree.children.length }));
                    })()] })) : (_jsxs(_Fragment, { children: [viewMode === 'nested' && subfolders.length > 0 && (_jsxs("div", { className: "mb-9", children: [currentFolderPath === '' && _jsx(SectionTitle, { children: "Folders" }), _jsx("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: subfolders.map((folder, i) => (_jsx(motion.div, { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: entryDelay(i), ease: 'easeOut' }, children: _jsx(FolderCard, { folder: folder, onClick: () => setCurrentFolder(folder.path) }) }, folder.path))) })] })), videos.length > 0 && (_jsxs(_Fragment, { children: [viewMode === 'nested' && subfolders.length > 0 && _jsx(SectionTitle, { children: "Files" }), viewMode === 'flat' && (_jsxs("p", { className: "mb-5 text-xs font-medium text-content/35", children: [videos.length, " file", videos.length !== 1 ? 's' : '', " \u00B7 including subfolders"] })), _jsx("div", { className: "grid grid-cols-1 items-start gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: videos.map((v, i) => (_jsx(motion.div, { layout: true, initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: entryDelay(i), ease: 'easeOut' }, children: _jsx(MediaCard, { video: v }) }, v.id))) })] }))] }))] }));
}
/* ─── Horizontal shelf (carousel) ─── */
function Shelf({ title, count, items, index, onSeeAll, }) {
    const scrollRef = useRef(null);
    const scroll = (dir) => {
        const el = scrollRef.current;
        if (!el)
            return;
        el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
    };
    return (_jsxs(motion.section, { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: Math.min(index * 0.08, 0.5), ease: 'easeOut' }, className: "group/shelf", children: [_jsxs("div", { className: "mb-3 flex items-end justify-between gap-3", children: [_jsxs("button", { onClick: onSeeAll, disabled: !onSeeAll, className: "flex items-center gap-2 text-left disabled:cursor-default", children: [_jsx("span", { className: "h-5 w-1 rounded-full bg-primary" }), _jsx("h2", { className: "text-lg font-bold tracking-tight text-content", children: title }), _jsx("span", { className: "rounded-full bg-content/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-content/50", children: count }), onSeeAll && (_jsxs("span", { className: "ml-1 flex items-center text-xs font-medium text-content/40 opacity-0 transition-all group-hover/shelf:translate-x-0.5 group-hover/shelf:opacity-100", children: ["See all ", _jsx(ChevronRight, { className: "h-3.5 w-3.5" })] }))] }), _jsxs("div", { className: "hidden shrink-0 gap-1 opacity-0 transition-opacity group-hover/shelf:opacity-100 sm:flex", children: [_jsx(ArrowBtn, { onClick: () => scroll(-1), label: "Scroll left", children: _jsx(ChevronLeft, { className: "h-4 w-4" }) }), _jsx(ArrowBtn, { onClick: () => scroll(1), label: "Scroll right", children: _jsx(ChevronRight, { className: "h-4 w-4" }) })] })] }), _jsx("div", { ref: scrollRef, className: "scrollbar-hidden -mx-1 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto scroll-smooth px-1 pb-2", children: items.map((v) => (_jsx("div", { className: "w-[260px] shrink-0 snap-start sm:w-[280px]", children: _jsx(MediaCard, { video: v }) }, v.id))) })] }));
}
function ArrowBtn({ onClick, label, children }) {
    return (_jsx("button", { onClick: onClick, "aria-label": label, className: "flex h-8 w-8 items-center justify-center rounded-full border border-content/10 bg-content/5 text-content/70 transition hover:bg-content/15 hover:text-content", children: children }));
}
function SectionTitle({ children }) {
    return (_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx("span", { className: "h-5 w-1 rounded-full bg-primary" }), _jsx("h2", { className: "text-lg font-bold tracking-tight text-content", children: children })] }));
}
function EmptyState() {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center gap-3 py-32 text-content/30", children: [_jsx(Search, { className: "h-14 w-14", strokeWidth: 1 }), _jsx("p", { className: "text-lg font-semibold text-content/50", children: "No media found" }), _jsx("p", { className: "text-sm", children: "Try a different filter, search term, or select another folder." })] }));
}
/* ── View mode toggle button ── */
function ViewToggleBtn({ label, icon, value, current, onClick, }) {
    const active = value === current;
    return (_jsxs("button", { onClick: () => onClick(value), className: `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${active ? 'bg-content/15 text-content shadow-sm' : 'text-content/40 hover:bg-content/5 hover:text-content/70'}`, title: label, children: [icon, label] }));
}
/* ── Folder Card (premium tile) ── */
function FolderCard({ folder, onClick }) {
    return (_jsxs("button", { onClick: onClick, className: "group/f flex items-center gap-3 rounded-2xl border border-content/[0.06] bg-content/[0.03] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-content/[0.06] hover:shadow-lg hover:shadow-black/20", children: [_jsx("div", { className: "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-500/5 ring-1 ring-amber-400/20", children: _jsx(Folder, { className: "h-5 w-5 fill-amber-400/70 text-amber-400/80" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-semibold text-content/90 group-hover/f:text-content", children: folder.name }), _jsxs("p", { className: "text-xs font-medium text-content/40", children: [folder.mediaCount, " item", folder.mediaCount !== 1 ? 's' : '', folder.children.length > 0 && ` · ${folder.children.length} folder${folder.children.length !== 1 ? 's' : ''}`] })] }), _jsx(ChevronRight, { className: "h-4 w-4 shrink-0 text-content/20 transition-all group-hover/f:translate-x-0.5 group-hover/f:text-primary" })] }));
}
