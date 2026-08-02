import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Download, Film, ImageIcon, Inbox, Loader2, Play, Search, Send, ShieldCheck, Trash2, Upload, Users, X, } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useWebRTCStore, selectAuthenticatedPeers, } from '../store/useWebRTCStore';
import { acceptIncomingFile, cancelTransfer, declineIncomingFile, sendFileToPeers } from '../services/webrtcService';
import { formatBytes } from './WebRTCBar';
export default function ShareModal({ open, onClose }) {
    const videos = useStore((s) => s.videos);
    const peers = useWebRTCStore(selectAuthenticatedPeers);
    const transfers = useWebRTCStore((s) => s.transferProgress);
    const status = useWebRTCStore((s) => s.status);
    const [tab, setTab] = useState('send');
    const [query, setQuery] = useState('');
    const [selectedMedia, setSelectedMedia] = useState(new Set());
    const [selectedPeers, setSelectedPeers] = useState(new Set());
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);
    const outgoing = useMemo(() => Object.values(transfers).filter((t) => t.direction === 'outgoing').sort((a, b) => b.startedAt - a.startedAt), [transfers]);
    const incoming = useMemo(() => Object.values(transfers).filter((t) => t.direction === 'incoming').sort((a, b) => b.startedAt - a.startedAt), [transfers]);
    const pendingCount = incoming.filter((t) => t.status === 'awaiting-consent').length;
    /* Peers come and go — never keep a stale id in the selection. */
    useEffect(() => {
        setSelectedPeers((prev) => {
            const live = new Set(peers.map((p) => p.id));
            const next = new Set([...prev].filter((id) => live.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [peers]);
    useEffect(() => {
        if (!open)
            return;
        setError(null);
        const onKey = (e) => {
            if (e.key !== 'Escape')
                return;
            if (preview)
                setPreview(null);
            else
                onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose, preview]);
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q)
            return videos;
        return videos.filter((v) => v.title.toLowerCase().includes(q));
    }, [videos, query]);
    if (!open)
        return null;
    const toggle = (set, id) => {
        const next = new Set(set);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        return next;
    };
    async function handleSend() {
        setError(null);
        const targets = [...selectedPeers];
        const items = videos.filter((v) => selectedMedia.has(v.id));
        if (targets.length === 0 || items.length === 0)
            return;
        setSending(true);
        try {
            for (const entry of items) {
                /* The handle is resolved here, in response to a click — one file,
                 * explicitly chosen, at a time. */
                const file = await entry.handle.getFile();
                sendFileToPeers(file, targets);
            }
            setSelectedMedia(new Set());
            setTab('send');
        }
        catch (err) {
            setError(err instanceof Error
                ? `Could not read the file: ${err.message}`
                : 'Could not read one of the selected files.');
        }
        finally {
            setSending(false);
        }
    }
    return createPortal(_jsxs("div", { className: "fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm", onClick: onClose, children: [_jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": "Share files with peers", onClick: (e) => e.stopPropagation(), className: "flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-content/10 px-5 py-4", children: [_jsx(Send, { className: "h-5 w-5 text-primary" }), _jsx("h2", { className: "text-base font-bold text-content", children: "Share Files" }), _jsxs("div", { className: "ml-4 flex gap-1 rounded-lg bg-content/[0.06] p-1", children: [_jsx(TabButton, { active: tab === 'send', onClick: () => setTab('send'), label: "Send" }), _jsx(TabButton, { active: tab === 'received', onClick: () => setTab('received'), label: "Received", badge: pendingCount })] }), _jsx("button", { onClick: onClose, className: "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": "Close", children: _jsx(X, { className: "h-5 w-5" }) })] }), status === 'disconnected' ? (_jsx(EmptyState, { icon: _jsx(ShieldCheck, { className: "h-8 w-8" }), title: "P2P is switched off", body: "Open or join a room from the sharing panel first. Nothing is connected right now." })) : tab === 'send' ? (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [_jsxs("div", { className: "border-b border-content/10 px-5 py-3", children: [_jsxs("h3", { className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50", children: [_jsx(Users, { className: "h-3.5 w-3.5" }), "Send to"] }), _jsxs("div", { className: "mt-2 flex flex-wrap gap-2", children: [peers.length === 0 && (_jsx("p", { className: "text-xs text-content/40", children: "No verified peers yet. Files can only be sent to peers that passed the password handshake." })), peers.map((p) => {
                                                const on = selectedPeers.has(p.id);
                                                return (_jsxs("button", { onClick: () => setSelectedPeers((s) => toggle(s, p.id)), className: `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${on
                                                        ? 'border-primary/50 bg-primary/15 text-content'
                                                        : 'border-content/10 bg-content/[0.04] text-content/60 hover:bg-content/10'}`, children: [on ? _jsx(Check, { className: "h-3.5 w-3.5 text-primary" }) : _jsx(Users, { className: "h-3.5 w-3.5" }), p.name] }, p.id));
                                            })] })] }), _jsx("div", { className: "border-b border-content/10 px-5 py-3", children: _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content/30" }), _jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Search your library\u2026", className: "h-9 w-full rounded-lg border border-content/10 bg-base pl-9 pr-3 text-sm text-content outline-none transition focus:border-accent/60" })] }) }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-5 py-3", children: [visible.length === 0 && (_jsx("p", { className: "py-10 text-center text-sm text-content/30", children: "Nothing matches that search." })), _jsx("div", { className: "space-y-1", children: visible.slice(0, 400).map((entry) => (_jsx(MediaRow, { entry: entry, selected: selectedMedia.has(entry.id), onToggle: () => setSelectedMedia((s) => toggle(s, entry.id)) }, entry.id))) }), visible.length > 400 && (_jsx("p", { className: "py-3 text-center text-xs text-content/30", children: "Showing the first 400 items \u2014 search to narrow down." }))] }), outgoing.length > 0 && (_jsxs("div", { className: "max-h-44 overflow-y-auto border-t border-content/10 px-5 py-3", children: [_jsxs("h3", { className: "mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50", children: [_jsx(Upload, { className: "h-3.5 w-3.5" }), "Outgoing"] }), _jsx("div", { className: "space-y-2", children: outgoing.map((t) => (_jsx(TransferRow, { transfer: t }, t.id))) })] })), _jsxs("div", { className: "flex items-center gap-3 border-t border-content/10 px-5 py-3", children: [error && (_jsxs("p", { className: "flex items-center gap-1.5 text-xs text-red-400", children: [_jsx(AlertTriangle, { className: "h-3.5 w-3.5 shrink-0" }), error] })), _jsxs("p", { className: "ml-auto shrink-0 text-xs text-content/50", children: [selectedMedia.size, " file", selectedMedia.size === 1 ? '' : 's', " \u2192 ", selectedPeers.size, " peer", selectedPeers.size === 1 ? '' : 's'] }), _jsxs("button", { onClick: handleSend, disabled: sending || selectedMedia.size === 0 || selectedPeers.size === 0, className: "flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40", children: [sending ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : _jsx(Send, { className: "h-4 w-4" }), "Send"] })] })] })) : (
                    /* ── Received tab ── */
                    _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-5 py-4", children: [incoming.length === 0 ? (_jsx(EmptyState, { icon: _jsx(Inbox, { className: "h-8 w-8" }), title: "Nothing received", body: "Files a peer pushes to you appear here. Nothing is downloaded until you accept it." })) : (_jsx("div", { className: "space-y-2", children: incoming.map((t) => (_jsx(TransferRow, { transfer: t, onPreview: () => setPreview(t) }, t.id))) })), _jsxs("div", { className: "mt-4 flex items-start gap-2 rounded-xl border border-content/10 bg-content/[0.03] p-3", children: [_jsx(ShieldCheck, { className: "mt-0.5 h-4 w-4 shrink-0 text-content/40" }), _jsx("p", { className: "text-xs leading-relaxed text-content/50", children: "Received files live only in this tab's memory. The file type is re-derived locally from the extension against an allowlist \u2014 a peer cannot dictate how their file is interpreted here. Save anything you want to keep before disconnecting." })] })] }))] }), preview && _jsx(PreviewOverlay, { transfer: preview, onClose: () => setPreview(null) })] }), document.body);
}
/* ─────────────────────────────────────────────────────────────
 *  ROWS
 * ───────────────────────────────────────────────────────────── */
function MediaRow({ entry, selected, onToggle, }) {
    return (_jsxs("button", { onClick: onToggle, className: `flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${selected ? 'bg-primary/10' : 'hover:bg-content/[0.04]'}`, children: [_jsx("span", { className: `flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${selected ? 'border-primary bg-primary text-white' : 'border-content/25'}`, children: selected && _jsx(Check, { className: "h-3 w-3" }) }), entry.mediaType === 'video' ? (_jsx(Film, { className: "h-4 w-4 shrink-0 text-content/35" })) : (_jsx(ImageIcon, { className: "h-4 w-4 shrink-0 text-content/35" })), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate text-sm text-content", children: entry.title }), _jsx("span", { className: "block truncate text-xs text-content/35", children: entry.parentPath || 'Home' })] }), _jsx("span", { className: "shrink-0 text-xs tabular-nums text-content/40", children: formatBytes(entry.size) })] }));
}
function TransferRow({ transfer: t, onPreview, }) {
    const dismissTransfer = useWebRTCStore((s) => s.dismissTransfer);
    const pct = t.size === 0 ? 100 : Math.min(100, Math.round((t.transferred / t.size) * 100));
    const active = t.status === 'transferring';
    const done = t.status === 'completed';
    const bad = t.status === 'failed' || t.status === 'declined' || t.status === 'cancelled';
    return (_jsxs("div", { className: "rounded-xl border border-content/10 bg-content/[0.03] p-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [t.mediaType === 'video' ? (_jsx(Film, { className: "h-4 w-4 shrink-0 text-content/35" })) : t.mediaType === 'image' ? (_jsx(ImageIcon, { className: "h-4 w-4 shrink-0 text-content/35" })) : (_jsx(Download, { className: "h-4 w-4 shrink-0 text-content/35" })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-content", title: t.filename, children: t.filename }), _jsxs("p", { className: "truncate text-xs text-content/40", children: [t.direction === 'incoming' ? 'from' : 'to', " ", t.peerName, " \u00B7 ", formatBytes(t.size), t.error ? ` · ${t.error}` : ''] })] }), _jsx("span", { className: `shrink-0 text-xs font-semibold tabular-nums ${bad ? 'text-red-400' : done ? 'text-emerald-400' : 'text-content/50'}`, children: t.status === 'awaiting-consent' ? 'Waiting' : bad ? t.status : `${pct}%` })] }), (active || done) && (_jsx("div", { className: "mt-2 h-1.5 w-full overflow-hidden rounded-full bg-content/10", children: _jsx("div", { className: `h-full rounded-full transition-[width] duration-150 ${done ? 'bg-emerald-500' : 'bg-primary'}`, style: { width: `${pct}%` } }) })), _jsxs("div", { className: "mt-2 flex flex-wrap gap-2", children: [t.direction === 'incoming' && t.status === 'awaiting-consent' && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => acceptIncomingFile(t.id), className: "rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110", children: "Accept" }), _jsx("button", { onClick: () => declineIncomingFile(t.id), className: "rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/70 transition hover:bg-content/10", children: "Decline" })] })), active && (_jsx("button", { onClick: () => cancelTransfer(t.id), className: "rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/70 transition hover:bg-content/10", children: "Cancel" })), done && t.blobUrl && (_jsxs(_Fragment, { children: [t.playable && onPreview && (_jsxs("button", { onClick: onPreview, className: "flex items-center gap-1.5 rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/80 transition hover:bg-content/10", children: [_jsx(Play, { className: "h-3.5 w-3.5" }), "View"] })), _jsxs("a", { href: t.blobUrl, download: t.filename, className: "flex items-center gap-1.5 rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/80 transition hover:bg-content/10", children: [_jsx(Download, { className: "h-3.5 w-3.5" }), "Save"] })] })), (done || bad) && (_jsxs("button", { onClick: () => dismissTransfer(t.id), className: "ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-content/40 transition hover:bg-content/10 hover:text-content/70", title: "Remove from the list and release the memory", children: [_jsx(Trash2, { className: "h-3.5 w-3.5" }), "Dismiss"] }))] })] }));
}
/**
 * In-app preview of a received file. Only reached for allowlisted video and
 * image types (`playable`), so the blob URL can never be an HTML document
 * executing in this origin.
 */
function PreviewOverlay({ transfer, onClose }) {
    if (!transfer.blobUrl)
        return null;
    return (_jsxs("div", { className: "fixed inset-0 z-[500] flex flex-col items-center justify-center bg-black/90 p-6", onClick: onClose, children: [_jsxs("div", { className: "mb-3 flex w-full max-w-4xl items-center gap-3", children: [_jsx("p", { className: "min-w-0 flex-1 truncate text-sm font-medium text-white", children: transfer.filename }), _jsxs("a", { href: transfer.blobUrl, download: transfer.filename, onClick: (e) => e.stopPropagation(), className: "flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20", children: [_jsx(Download, { className: "h-3.5 w-3.5" }), "Save"] }), _jsx("button", { onClick: onClose, className: "flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white", "aria-label": "Close preview", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsx("div", { className: "flex max-h-[80vh] w-full max-w-4xl justify-center", onClick: (e) => e.stopPropagation(), children: transfer.mediaType === 'video' ? (_jsx("video", { src: transfer.blobUrl, controls: true, autoPlay: true, className: "max-h-[80vh] w-full rounded-xl bg-black" })) : (_jsx("img", { src: transfer.blobUrl, alt: transfer.filename, className: "max-h-[80vh] rounded-xl object-contain" })) })] }));
}
/* ─────────────────────────────────────────────────────────────
 *  BITS
 * ───────────────────────────────────────────────────────────── */
function TabButton({ active, onClick, label, badge, }) {
    return (_jsxs("button", { onClick: onClick, className: `relative rounded-md px-3 py-1 text-xs font-semibold transition ${active ? 'bg-content/10 text-content' : 'text-content/50 hover:text-content/80'}`, children: [label, !!badge && badge > 0 && (_jsx("span", { className: "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white", children: badge }))] }));
}
function EmptyState({ icon, title, body, }) {
    return (_jsxs("div", { className: "flex flex-1 flex-col items-center justify-center gap-2 px-10 py-16 text-center", children: [_jsx("span", { className: "text-content/20", children: icon }), _jsx("p", { className: "text-sm font-semibold text-content/70", children: title }), _jsx("p", { className: "max-w-sm text-xs leading-relaxed text-content/40", children: body })] }));
}
