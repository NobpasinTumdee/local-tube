import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import MediaCard from './VideoCard';
import Breadcrumb from './Breadcrumb';
import { useStore } from '../store/useStore';
import { getChildFolders } from '../utils/directoryScanner';
export default function VideoGrid({ videos }) {
    const currentFolderPath = useStore((s) => s.currentFolderPath);
    const directoryTree = useStore((s) => s.directoryTree);
    const setCurrentFolder = useStore((s) => s.setCurrentFolder);
    const viewMode = useStore((s) => s.viewMode);
    const setViewMode = useStore((s) => s.setViewMode);
    /* subfolders at the current level (only meaningful in nested mode) */
    const subfolders = viewMode === 'nested' && directoryTree
        ? getChildFolders(directoryTree, currentFolderPath)
        : [];
    const hasContent = subfolders.length > 0 || videos.length > 0;
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-5 flex flex-wrap items-center gap-3", children: [_jsx("div", { className: "flex-1", children: _jsx(Breadcrumb, {}) }), _jsxs("div", { className: "flex shrink-0 items-center gap-1 rounded-lg border border-white/5 bg-white/[0.03] p-1", children: [_jsx(ViewToggleBtn, { label: "Folders", icon: _jsx(FolderIcon, {}), value: "nested", current: viewMode, onClick: setViewMode }), _jsx(ViewToggleBtn, { label: "All Files", icon: _jsx(ListIcon, {}), value: "flat", current: viewMode, onClick: setViewMode })] })] }), !hasContent && (_jsxs("div", { className: "flex flex-col items-center justify-center gap-3 py-32 text-white/30", children: [_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-16 w-16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("p", { className: "text-lg font-medium", children: "No media found" }), _jsx("p", { className: "text-sm", children: "Try a different filter, search term, or select another folder." })] })), viewMode === 'nested' && subfolders.length > 0 && (_jsxs("div", { className: "mb-8", children: [currentFolderPath === '' && (_jsx("h2", { className: "mb-3 text-sm font-semibold uppercase tracking-wider text-white/40", children: "Folders" })), _jsx("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5", children: subfolders.map((folder) => (_jsx(FolderCard, { folder: folder, onClick: () => setCurrentFolder(folder.path) }, folder.path))) })] })), videos.length > 0 && (_jsxs(_Fragment, { children: [viewMode === 'nested' && subfolders.length > 0 && (_jsx("h2", { className: "mb-3 text-sm font-semibold uppercase tracking-wider text-white/40", children: "Files" })), viewMode === 'flat' && (_jsxs("p", { className: "mb-4 text-xs text-white/30", children: [videos.length, " file", videos.length !== 1 ? 's' : '', " (including subfolders)"] })), _jsx("div", { className: "grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5", children: videos.map((v) => (_jsx(MediaCard, { video: v }, v.id))) })] }))] }));
}
/* ── View mode toggle button ── */
function ViewToggleBtn({ label, icon, value, current, onClick, }) {
    const active = value === current;
    return (_jsxs("button", { onClick: () => onClick(value), className: `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${active
            ? 'bg-white/15 text-white'
            : 'text-white/40 hover:bg-white/5 hover:text-white/70'}`, title: label, children: [icon, label] }));
}
const FolderIcon = () => (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" }) }));
const ListIcon = () => (_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("line", { x1: "8", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "8", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "8", y1: "18", x2: "21", y2: "18" }), _jsx("line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }), _jsx("line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }), _jsx("line", { x1: "3", y1: "18", x2: "3.01", y2: "18" })] }));
/* ── Folder Card ── */
function FolderCard({ folder, onClick }) {
    return (_jsxs("button", { onClick: onClick, className: "group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3.5 text-left transition hover:border-white/10 hover:bg-white/[0.07]", children: [_jsx("div", { className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5 text-yellow-400/80", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" }) }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-white/85 group-hover:text-white", children: folder.name }), _jsxs("p", { className: "text-xs text-white/35", children: [folder.mediaCount, " item", folder.mediaCount !== 1 ? 's' : '', folder.children.length > 0 && ` · ${folder.children.length} folder${folder.children.length !== 1 ? 's' : ''}`] })] }), _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4 shrink-0 text-white/20 transition group-hover:text-white/50", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", children: _jsx("polyline", { points: "9 18 15 12 9 6" }) })] }));
}
