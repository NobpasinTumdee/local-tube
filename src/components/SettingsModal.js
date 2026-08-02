import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Upload, Database, AlertTriangle, Check, Heart, ListMusic, Tag } from 'lucide-react';
import { useStore } from '../store/useStore';
import { exportUserData, importUserData } from '../utils/backupUtils';
export default function SettingsModal({ open, onClose }) {
    const applyImportedData = useStore((s) => s.applyImportedData);
    const favCount = useStore((s) => s.favorites.length);
    const plCount = useStore((s) => s.virtualPlaylists.length);
    const tagCount = useStore((s) => Object.keys(s.mediaTags).length);
    const fileRef = useRef(null);
    const [status, setStatus] = useState({ kind: 'idle' });
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open)
            return;
        setStatus({ kind: 'idle' });
        const onKey = (e) => { if (e.key === 'Escape')
            onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open)
        return null;
    const handleExport = () => {
        exportUserData(useStore.getState());
        setStatus({ kind: 'success', msg: 'Backup downloaded to your device.' });
    };
    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file later
        if (!file)
            return;
        setBusy(true);
        const res = await importUserData(file, applyImportedData);
        setBusy(false);
        if (res.ok && res.summary) {
            const s = res.summary;
            setStatus({
                kind: 'success',
                msg: `Restored ${s.favorites} favorite${s.favorites === 1 ? '' : 's'}, ${s.playlists} playlist${s.playlists === 1 ? '' : 's'}, tags on ${s.taggedItems} item${s.taggedItems === 1 ? '' : 's'}.`,
            });
        }
        else {
            setStatus({ kind: 'error', msg: res.error ?? 'Import failed.' });
        }
    };
    return createPortal(_jsx("div", { className: "fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm", onClick: onClose, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": "Settings", onClick: (e) => e.stopPropagation(), className: "w-full max-w-md overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-content/10 px-5 py-4", children: [_jsx(Database, { className: "h-5 w-5 text-primary" }), _jsx("h2", { className: "text-base font-bold text-content", children: "Settings" }), _jsx("button", { onClick: onClose, className: "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": "Close", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsxs("div", { className: "p-5", children: [_jsx("h3", { className: "text-sm font-semibold text-content", children: "Data Management" }), _jsx("p", { className: "mt-1 text-xs text-content/50", children: "Your favorites, playlists, tags, theme and watch progress live only in this browser. Back them up to a file, or restore them on another device." }), _jsxs("div", { className: "mt-4 flex flex-wrap gap-2 text-xs", children: [_jsx(Stat, { icon: _jsx(Heart, { className: "h-3.5 w-3.5" }), label: "Favorites", value: favCount }), _jsx(Stat, { icon: _jsx(ListMusic, { className: "h-3.5 w-3.5" }), label: "Playlists", value: plCount }), _jsx(Stat, { icon: _jsx(Tag, { className: "h-3.5 w-3.5" }), label: "Tagged", value: tagCount })] }), _jsxs("div", { className: "mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2", children: [_jsxs("button", { onClick: handleExport, className: "flex items-center justify-center gap-2 rounded-xl bg-content/[0.06] px-4 py-2.5 text-sm font-semibold text-content transition hover:bg-content/10", children: [_jsx(Download, { className: "h-4 w-4" }), "Export Backup (.json)"] }), _jsxs("button", { onClick: () => fileRef.current?.click(), disabled: busy, className: "flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50", children: [_jsx(Upload, { className: "h-4 w-4" }), busy ? 'Restoring…' : 'Restore Backup'] }), _jsx("input", { ref: fileRef, type: "file", accept: "application/json,.json", onChange: handleFile, className: "hidden" })] }), _jsxs("div", { className: "mt-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0 text-amber-500" }), _jsxs("p", { className: "text-xs leading-relaxed text-content/70", children: ["Restoring a backup ", _jsx("span", { className: "font-semibold text-content", children: "overwrites" }), " your current favorites, virtual playlists, custom tags and watch progress with the file's contents. This can't be undone \u2014 export a backup first if you're unsure."] })] }), status.kind !== 'idle' && (_jsxs("div", { className: `mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${status.kind === 'success'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-red-500/10 text-red-500'}`, children: [status.kind === 'success' ? _jsx(Check, { className: "h-4 w-4 shrink-0" }) : _jsx(AlertTriangle, { className: "h-4 w-4 shrink-0" }), _jsx("span", { children: status.msg })] }))] })] }) }), document.body);
}
function Stat({ icon, label, value }) {
    return (_jsxs("span", { className: "flex items-center gap-1.5 rounded-lg bg-content/[0.04] px-2.5 py-1.5 text-content/70", children: [_jsx("span", { className: "text-content/50", children: icon }), _jsx("span", { className: "font-semibold text-content tabular-nums", children: value }), label] }));
}
