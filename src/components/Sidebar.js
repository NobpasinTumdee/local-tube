import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { Home, Film, Image as ImageIcon, Library, Folder, FolderOpen, ChevronRight, Clock, PlayCircle, } from 'lucide-react';
import { useStore } from '../store/useStore';
export default function Sidebar() {
    const currentFolderPath = useStore((s) => s.currentFolderPath);
    const setCurrentFolder = useStore((s) => s.setCurrentFolder);
    const homeFilter = useStore((s) => s.homeFilter);
    const setHomeFilter = useStore((s) => s.setHomeFilter);
    const directoryTree = useStore((s) => s.directoryTree);
    const videos = useStore((s) => s.videos);
    const recentVideoIds = useStore((s) => s.recentVideoIds);
    const playVideo = useStore((s) => s.playVideo);
    const videoMeta = useStore((s) => s.videoMeta);
    const currentVideoId = useStore((s) => s.currentVideoId);
    const view = useStore((s) => s.view);
    const isHomeView = view !== 'playing';
    const atRoot = currentFolderPath === '' && isHomeView;
    const recentItems = useMemo(() => recentVideoIds
        .map((id) => videos.find((v) => v.id === id))
        .filter((v) => !!v)
        .slice(0, 5), [recentVideoIds, videos]);
    return (_jsxs("aside", { className: "sticky top-14 flex h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col overflow-y-auto border-r border-white/[0.04] bg-[#080808]/80 backdrop-blur-2xl scrollbar-hidden", children: [_jsx("div", { className: "pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" }), _jsxs("div", { className: "relative flex flex-1 flex-col px-3 py-4", children: [_jsx(SectionLabel, { icon: _jsx(Library, { className: "h-3 w-3" }), children: "Library" }), _jsx(NavItem, { icon: _jsx(Home, { className: "h-[18px] w-[18px]" }), label: "All Media", count: directoryTree?.mediaCount ?? 0, active: atRoot && homeFilter === 'all', onClick: () => { setCurrentFolder(''); setHomeFilter('all'); } }), _jsx(FilterItem, { icon: _jsx(Film, { className: "h-[18px] w-[18px]" }), label: "Videos", value: "videos", current: homeFilter, onClick: setHomeFilter, count: videos.filter((v) => v.mediaType === 'video').length }), _jsx(FilterItem, { icon: _jsx(ImageIcon, { className: "h-[18px] w-[18px]" }), label: "Images", value: "images", current: homeFilter, onClick: setHomeFilter, count: videos.filter((v) => v.mediaType === 'image').length }), directoryTree && directoryTree.children.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Divider, {}), _jsx(SectionLabel, { icon: _jsx(Folder, { className: "h-3 w-3" }), children: "Folders" }), _jsx("div", { className: "flex flex-col", children: directoryTree.children.map((node) => (_jsx(TreeNode, { node: node, currentFolderPath: currentFolderPath, onNavigate: setCurrentFolder, depth: 0 }, node.path))) })] })), recentItems.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Divider, {}), _jsx(SectionLabel, { icon: _jsx(Clock, { className: "h-3 w-3" }), children: "Recent" }), _jsx("div", { className: "flex flex-col gap-0.5", children: recentItems.map((v) => {
                                    const active = currentVideoId === v.id;
                                    const thumb = videoMeta[v.id]?.thumbnailUrl;
                                    return (_jsxs("button", { onClick: () => playVideo(v.id), className: `relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${active
                                            ? 'bg-white/[0.07] text-white'
                                            : 'text-white/60 hover:bg-white/[0.04] hover:text-white/95'}`, children: [active && _jsx(ActiveBar, {}), _jsx("div", { className: "relative h-8 w-12 shrink-0 overflow-hidden rounded bg-white/5", children: thumb ? (_jsx("img", { src: thumb, alt: "", className: "h-full w-full object-cover" })) : (_jsx("div", { className: "flex h-full w-full items-center justify-center", children: _jsx(PlayCircle, { className: "h-4 w-4 text-white/20" }) })) }), _jsx("span", { className: "min-w-0 flex-1 truncate text-[12px]", children: v.title })] }, v.id));
                                }) })] })), _jsx("div", { className: "flex-1" }), _jsx("div", { className: "mt-4 px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-white/20", children: "Local Media Hub" })] })] }));
}
/* ─── Section label ─── */
function SectionLabel({ children, icon }) {
    return (_jsxs("div", { className: "mb-1.5 mt-1 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30", children: [icon, children] }));
}
function Divider() {
    return _jsx("div", { className: "my-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" });
}
/* ─── Active red vertical bar (Netflix-style indicator) ─── */
function ActiveBar() {
    return (_jsx("span", { className: "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]" }));
}
/* ─── Generic nav item (Home / All Media) ─── */
function NavItem({ icon, label, count, active, onClick, }) {
    return (_jsxs("button", { onClick: onClick, className: `group relative mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${active
            ? 'bg-white/[0.08] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
            : 'text-white/65 hover:bg-white/[0.04] hover:text-white'}`, children: [active && _jsx(ActiveBar, {}), _jsx("span", { className: `shrink-0 transition-transform duration-200 ${active ? 'text-red-400' : 'group-hover:scale-110'}`, children: icon }), _jsx("span", { className: "flex-1 truncate text-left", children: label }), count != null && (_jsx("span", { className: "text-[11px] tabular-nums text-white/30", children: count }))] }));
}
/* ─── Library filter item (Videos / Images) ─── */
function FilterItem({ icon, label, value, current, onClick, count, }) {
    const setCurrentFolder = useStore((s) => s.setCurrentFolder);
    const currentFolderPath = useStore((s) => s.currentFolderPath);
    const view = useStore((s) => s.view);
    const active = current === value && currentFolderPath === '' && view !== 'playing';
    return (_jsx(NavItem, { icon: icon, label: label, count: count, active: active, onClick: () => { setCurrentFolder(''); onClick(value); } }));
}
function TreeNode({ node, currentFolderPath, onNavigate, depth }) {
    const hasChildren = node.children.length > 0;
    const isOrContainsCurrent = currentFolderPath === node.path ||
        currentFolderPath.startsWith(node.path + '/');
    const [open, setOpen] = useState(isOrContainsCurrent);
    const isActive = currentFolderPath === node.path;
    return (_jsxs("div", { children: [_jsxs("div", { className: `group relative mb-0.5 flex w-full items-center rounded-lg text-sm transition-all duration-200 ${isActive
                    ? 'bg-white/[0.08] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                    : 'text-white/60 hover:bg-white/[0.04] hover:text-white/95'}`, style: { paddingLeft: `${8 + depth * 14}px` }, children: [isActive && _jsx(ActiveBar, {}), _jsx("button", { onClick: () => setOpen((o) => !o), className: "flex h-8 w-6 shrink-0 items-center justify-center text-white/40 transition hover:text-white/80", "aria-label": open ? 'Collapse' : 'Expand', children: hasChildren ? (_jsx(ChevronRight, { className: `h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}` })) : (_jsx("span", { className: "h-3.5 w-3.5" })) }), _jsxs("button", { onClick: () => onNavigate(node.path), className: "flex flex-1 items-center gap-2 overflow-hidden py-1.5 pr-2", children: [open && hasChildren ? (_jsx(FolderOpen, { className: "h-4 w-4 shrink-0 text-amber-400/80" })) : (_jsx(Folder, { className: "h-4 w-4 shrink-0 text-amber-400/70" })), _jsx("span", { className: "flex-1 truncate text-left text-[13px]", children: node.name }), _jsx("span", { className: "shrink-0 text-[10px] tabular-nums text-white/25", children: node.mediaCount })] })] }), open && hasChildren && (_jsx("div", { children: node.children.map((child) => (_jsx(TreeNode, { node: child, currentFolderPath: currentFolderPath, onNavigate: onNavigate, depth: depth + 1 }, child.path))) }))] }));
}
