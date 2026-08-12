import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bookmark, Check, FolderPlus, Layers, Loader2, Lock, Trash2, X, } from 'lucide-react';
import { useLibraryStore } from '../store/useLibraryStore';
import { useStore } from '../store/useStore';
export default function LibraryManager({ open, onClose }) {
    const activeHandles = useLibraryStore((s) => s.activeHandles);
    const presets = useLibraryStore((s) => s.presets);
    const pendingRestore = useLibraryStore((s) => s.pendingRestore);
    const busy = useLibraryStore((s) => s.busy);
    const error = useLibraryStore((s) => s.error);
    const addHandleToActive = useLibraryStore((s) => s.addHandleToActive);
    const removeHandleFromActive = useLibraryStore((s) => s.removeHandleFromActive);
    const clearActiveHandles = useLibraryStore((s) => s.clearActiveHandles);
    const restorePending = useLibraryStore((s) => s.restorePending);
    const dismissPending = useLibraryStore((s) => s.dismissPending);
    const saveActiveAsPreset = useLibraryStore((s) => s.saveActiveAsPreset);
    const loadPreset = useLibraryStore((s) => s.loadPreset);
    const deletePreset = useLibraryStore((s) => s.deletePreset);
    const setError = useLibraryStore((s) => s.setError);
    /* Per-mount media counts come from the last scan, not from the handles. */
    const roots = useStore((s) => s.roots);
    const scanning = useStore((s) => s.scanning);
    const [presetName, setPresetName] = useState('');
    const [justSaved, setJustSaved] = useState(false);
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    /* Stale errors from a previous visit shouldn't greet the next one. */
    useEffect(() => {
        if (open)
            setError(null);
    }, [open, setError]);
    if (!open)
        return null;
    async function addFolder() {
        if (!('showDirectoryPicker' in window)) {
            setError('This browser has no File System Access API. Use Chrome or Edge.');
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'read' });
            await addHandleToActive(handle);
        }
        catch (err) {
            if (err?.name !== 'AbortError') {
                setError('Could not open that folder.');
            }
        }
    }
    function submitPreset() {
        const name = presetName.trim();
        if (!name)
            return;
        void saveActiveAsPreset(name).then(() => {
            if (!useLibraryStore.getState().error) {
                setPresetName('');
                setJustSaved(true);
                setTimeout(() => setJustSaved(false), 1600);
            }
        });
    }
    const countFor = (name) => roots.find((r) => r.folderName === name)?.mediaCount;
    return createPortal(_jsx("div", { className: "fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center", onClick: onClose, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": "Workspace folders", onClick: (e) => e.stopPropagation(), className: "my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-content/10 px-5 py-4", children: [_jsx(Layers, { className: "h-5 w-5 text-primary" }), _jsx("h2", { className: "text-base font-bold text-content", children: "Workspace" }), scanning && (_jsxs("span", { className: "flex items-center gap-1 rounded-full bg-content/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-content/60", children: [_jsx(Loader2, { className: "h-3 w-3 animate-spin" }), "Scanning"] })), _jsx("button", { onClick: onClose, className: "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": "Close", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsxs("div", { className: "max-h-[70vh] overflow-y-auto p-5 scrollbar-thin", children: [_jsx("p", { className: "text-xs leading-relaxed text-content/60", children: "Combine several folders into one library. Files are never moved or copied \u2014 LocalTube just reads them where they are, and forgets them the moment you remove the folder." }), pendingRestore.length > 0 && (_jsxs("div", { className: "mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3", children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx(Lock, { className: "mt-0.5 h-4 w-4 shrink-0 text-amber-500" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-xs font-semibold text-amber-500", children: pendingRestore.length === 1
                                                        ? '1 folder needs permission again'
                                                        : `${pendingRestore.length} folders need permission again` }), _jsx("p", { className: "mt-0.5 text-xs leading-relaxed text-content/60", children: "Browsers drop folder access when they restart. Your folders are remembered \u2014 they just need one click to re-open." }), _jsx("p", { className: "mt-1 truncate text-[11px] text-content/40", children: pendingRestore.map((h) => h.name).join(', ') })] })] }), _jsxs("div", { className: "mt-2.5 flex gap-2", children: [_jsx("button", { onClick: () => void restorePending(), className: "flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-black transition hover:brightness-110", children: "Grant access" }), _jsx("button", { onClick: () => void dismissPending(), className: "rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/70 transition hover:bg-content/10", children: "Forget" })] })] })), _jsxs("div", { className: "mt-4 flex items-center justify-between", children: [_jsxs("h3", { className: "text-xs font-semibold uppercase tracking-wide text-content/50", children: ["Mounted folders (", activeHandles.length, ")"] }), activeHandles.length > 0 && (_jsx("button", { onClick: () => void clearActiveHandles(), className: "text-[11px] font-medium text-content/40 transition hover:text-primary", children: "Remove all" }))] }), _jsxs("div", { className: "mt-2 space-y-1.5", children: [activeHandles.length === 0 && (_jsx("p", { className: "rounded-xl border border-dashed border-content/10 px-3 py-5 text-center text-xs text-content/40", children: "No folders yet. Add one to start building your library." })), activeHandles.map((handle, i) => {
                                    const count = countFor(handle.name);
                                    return (_jsxs("div", { className: "group flex items-center gap-2.5 rounded-xl border border-content/10 bg-content/[0.03] px-3 py-2.5", children: [_jsx(FolderPlus, { className: "h-4 w-4 shrink-0 text-amber-400/80" }), _jsx("span", { className: "min-w-0 flex-1 truncate text-sm font-medium text-content", children: handle.name }), count != null && (_jsxs("span", { className: "shrink-0 text-[11px] tabular-nums text-content/35", children: [count, " item", count === 1 ? '' : 's'] })), _jsx("button", { onClick: () => void removeHandleFromActive(handle), className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content/30 transition hover:bg-content/10 hover:text-primary", "aria-label": `Remove ${handle.name} from the workspace`, title: "Remove from workspace", children: _jsx(X, { className: "h-3.5 w-3.5" }) })] }, `${handle.name}:${i}`));
                                })] }), _jsxs("button", { onClick: () => void addFolder(), className: "mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:brightness-110", children: [_jsx(FolderPlus, { className: "h-4 w-4" }), "Add folder to workspace"] }), error && (_jsxs("div", { className: "mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-400", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0" }), _jsx("span", { className: "leading-relaxed", children: error })] })), _jsxs("div", { className: "mt-6 border-t border-content/10 pt-5", children: [_jsxs("h3", { className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50", children: [_jsx(Bookmark, { className: "h-3.5 w-3.5" }), "Presets"] }), _jsx("p", { className: "mt-1 text-xs leading-relaxed text-content/50", children: "Save this combination of folders so you can reopen it in one click." }), _jsxs("div", { className: "mt-2.5 flex gap-2", children: [_jsx("input", { value: presetName, onChange: (e) => setPresetName(e.target.value), onKeyDown: (e) => {
                                                if (e.key === 'Enter')
                                                    submitPreset();
                                            }, maxLength: 48, placeholder: "e.g. Anime + Movies", className: "h-10 min-w-0 flex-1 rounded-xl border border-content/10 bg-base px-3 text-sm text-content placeholder-content/35 outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30" }), _jsxs("button", { onClick: submitPreset, disabled: !presetName.trim() || activeHandles.length === 0, className: "flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-content/[0.08] px-4 text-sm font-semibold text-content transition hover:bg-content/[0.14] disabled:cursor-not-allowed disabled:opacity-40", children: [justSaved ? _jsx(Check, { className: "h-4 w-4 text-emerald-400" }) : null, justSaved ? 'Saved' : 'Save'] })] }), _jsxs("div", { className: "mt-3 space-y-1.5", children: [presets.length === 0 && (_jsx("p", { className: "rounded-xl border border-dashed border-content/10 px-3 py-4 text-center text-xs text-content/40", children: "No presets saved yet." })), presets.map((p) => (_jsx(PresetRow, { preset: p, busy: busy, onLoad: () => void loadPreset(p.id), onDelete: () => void deletePreset(p.id) }, p.id)))] })] })] })] }) }), document.body);
}
function PresetRow({ preset, busy, onLoad, onDelete, }) {
    const [confirming, setConfirming] = useState(false);
    return (_jsxs("div", { className: "group flex items-center rounded-xl border border-content/10 bg-content/[0.03] transition hover:bg-content/[0.06]", children: [_jsxs("button", { onClick: onLoad, disabled: busy, className: "flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left disabled:opacity-50", title: preset.handles.map((h) => h.name).join(' · '), children: [_jsx(Bookmark, { className: "h-4 w-4 shrink-0 text-accent" }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate text-sm font-medium text-content", children: preset.name }), _jsx("span", { className: "block truncate text-[11px] text-content/40", children: preset.handles.map((h) => h.name).join(' · ') })] }), _jsx("span", { className: "shrink-0 rounded-full bg-content/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-content/50", children: preset.handles.length })] }), confirming ? (_jsxs("span", { className: "flex shrink-0 items-center gap-1 pr-2", children: [_jsx("button", { onClick: onDelete, className: "rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-red-500", children: "Delete" }), _jsx("button", { onClick: () => setConfirming(false), className: "rounded-md px-1.5 py-1 text-[11px] font-medium text-content/50 transition hover:text-content", children: "Cancel" })] })) : (_jsx("button", { onClick: () => setConfirming(true), className: "mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-content/30 opacity-0 transition hover:bg-content/10 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100", "aria-label": `Delete preset ${preset.name}`, title: "Delete preset", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) }))] }));
}
