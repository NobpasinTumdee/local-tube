import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Loader2, Maximize2, Minus, Power, RadioTower, ShieldCheck, UserCheck, Users, Volume2, VolumeX, Wifi, X, } from 'lucide-react';
import { useWebRTCStore } from '../store/useWebRTCStore';
import { shortId } from '../services/webrtcService';
/* ─────────────────────────────────────────────────────────────
 *  WATCH PARTY LOBBY
 * ─────────────────────────────────────────────────────────────
 *  The room a guest actually sits in. It has three states and moves
 *  between them without ever unmounting the <video> element:
 *
 *    waiting    — connected & verified, host isn't broadcasting
 *    connecting — host announced a broadcast, media still negotiating
 *    watching   — activeStream is live
 *
 *  Keeping one persistent <video> across the last two matters: remounting
 *  it would drop srcObject and restart the media pipeline mid-negotiation,
 *  which is its own source of "the stream never appears".
 * ───────────────────────────────────────────────────────────── */
export default function WatchPartyLobby() {
    const status = useWebRTCStore((s) => s.status);
    const lobbyOpen = useWebRTCStore((s) => s.lobbyOpen);
    const setLobbyOpen = useWebRTCStore((s) => s.setLobbyOpen);
    const roomId = useWebRTCStore((s) => s.roomId);
    const role = useWebRTCStore((s) => s.role);
    const peers = useWebRTCStore((s) => s.peers);
    const activeStream = useWebRTCStore((s) => s.activeStream);
    const isReceiving = useWebRTCStore((s) => s.isReceivingBroadcast);
    const meta = useWebRTCStore((s) => s.broadcastMeta);
    const disconnectAll = useWebRTCStore((s) => s.disconnectAll);
    const videoRef = useRef(null);
    const [muted, setMuted] = useState(true);
    const [minimized, setMinimized] = useState(false);
    const [needsGesture, setNeedsGesture] = useState(false);
    /* ── THE FIX: MediaStream must go on srcObject, never src ──
     *
     *  A MediaStream has no URL. Assigning it to `src` stringifies it to
     *  "[object MediaStream]" and the element silently shows nothing. It has
     *  to be attached imperatively to the live DOM node, which means a ref
     *  plus an effect that re-runs whenever the stream identity changes. */
    useEffect(() => {
        const el = videoRef.current;
        if (!el)
            return;
        if (!activeStream) {
            el.srcObject = null;
            return;
        }
        if (el.srcObject === activeStream)
            return;
        el.srcObject = activeStream;
        el.muted = muted;
        el.play().then(() => setNeedsGesture(false), 
        /* Autoplay policy refused us even muted — surface a tap target. */
        () => setNeedsGesture(true));
    }, [activeStream, muted]);
    /* Keep the element's muted property in sync with our state. */
    useEffect(() => {
        const el = videoRef.current;
        if (el)
            el.muted = muted;
    }, [muted, isReceiving]);
    /* Unmuting can itself be blocked; do it through a user gesture path. */
    const unmuteAndSync = () => {
        const el = videoRef.current;
        setMuted(false);
        if (!el)
            return;
        el.muted = false;
        /* A live MediaStream has no seekable buffer — "sync" means jumping to
         * the newest frame the pipeline holds, which play() after a stall does. */
        el.play().then(() => setNeedsGesture(false), () => setNeedsGesture(true));
    };
    const [copied, setCopied] = useState(false);
    const copyRoom = () => {
        if (!roomId)
            return;
        navigator.clipboard?.writeText(roomId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }, () => undefined);
    };
    useEffect(() => {
        if (!lobbyOpen)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                setLobbyOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lobbyOpen, setLobbyOpen]);
    if (status === 'disconnected' || !lobbyOpen)
        return null;
    const authed = peers.filter((p) => p.authenticated);
    const connecting = !!meta && !isReceiving;
    return createPortal(_jsx("div", { className: minimized
            ? 'fixed bottom-5 right-5 z-[320] flex w-[400px] flex-col overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/60'
            : 'fixed inset-0 z-[320] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm', children: _jsxs("div", { className: minimized
                ? 'flex flex-col'
                : 'flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50', children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-content/10 px-4 py-3", children: [_jsx("span", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15", children: isReceiving ? (_jsx(RadioTower, { className: "h-4 w-4 text-red-400" })) : (_jsx(Users, { className: "h-4 w-4 text-primary" })) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-bold text-content", children: isReceiving ? meta?.title : 'Watch Party Room' }), _jsx("p", { className: "truncate text-xs text-content/50", children: isReceiving ? `Live from ${meta?.peerName}` : `Room ${roomId} · ${role === 'host' ? 'Hosting' : 'Guest'}` })] }), isReceiving && (_jsxs("span", { className: "flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white", children: [_jsx("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-white" }), "Live"] })), _jsx("button", { onClick: () => setMinimized((v) => !v), className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": minimized ? 'Expand' : 'Minimize', children: minimized ? _jsx(Maximize2, { className: "h-4 w-4" }) : _jsx(Minus, { className: "h-4 w-4" }) }), _jsx("button", { onClick: () => setLobbyOpen(false), className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": "Close", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsxs("div", { className: `relative bg-black ${minimized ? 'aspect-video w-full' : 'aspect-video w-full'}`, children: [_jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, muted: muted, controls: false, className: `h-full w-full object-contain ${isReceiving ? '' : 'invisible'}`, onClick: () => (muted ? unmuteAndSync() : setMuted(true)) }), !isReceiving && (_jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center", children: [_jsxs("span", { className: "relative flex h-16 w-16 items-center justify-center", children: [_jsx("span", { className: "absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20" }), _jsx("span", { className: "relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15", children: connecting ? (_jsx(Loader2, { className: "h-6 w-6 animate-spin text-primary" })) : (_jsx(RadioTower, { className: "h-6 w-6 text-primary" })) })] }), _jsx("p", { className: "text-base font-semibold text-content", children: connecting ? 'Connecting to the stream…' : 'Waiting for the host to start broadcasting…' }), _jsx("p", { className: "max-w-sm text-xs leading-relaxed text-content/50", children: connecting
                                        ? `${meta?.peerName} went live with "${meta?.title}". Negotiating the media connection — this usually takes a second.`
                                        : "You're connected and verified. The video will appear here automatically the moment the host goes live." })] })), isReceiving && (muted || needsGesture) && (_jsxs("button", { onClick: unmuteAndSync, className: "absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-2xl shadow-primary/40 transition hover:brightness-110 active:scale-[0.98]", children: [_jsx(VolumeX, { className: "h-4 w-4" }), "Tap to Unmute & Sync"] }))] }), !minimized && (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("span", { className: "flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-400", children: [_jsx(ShieldCheck, { className: "h-3.5 w-3.5" }), "Connected \u00B7 Verified"] }), _jsxs("span", { className: "flex items-center gap-1.5 rounded-lg bg-content/[0.05] px-2.5 py-1.5 text-xs text-content/60", children: [_jsx(Wifi, { className: "h-3.5 w-3.5" }), "Room ", _jsx("span", { className: "font-mono font-bold tracking-widest text-content", children: roomId })] }), _jsxs("button", { onClick: copyRoom, className: "flex items-center gap-1.5 rounded-lg bg-content/[0.05] px-2.5 py-1.5 text-xs font-medium text-content/60 transition hover:bg-content/10 hover:text-content", children: [copied ? _jsx(Check, { className: "h-3.5 w-3.5 text-emerald-400" }) : _jsx(Copy, { className: "h-3.5 w-3.5" }), copied ? 'Copied' : 'Copy ID'] }), isReceiving && (_jsxs("button", { onClick: () => setMuted((m) => !m), className: "ml-auto flex items-center gap-1.5 rounded-lg bg-content/[0.05] px-2.5 py-1.5 text-xs font-medium text-content/70 transition hover:bg-content/10", children: [muted ? _jsx(VolumeX, { className: "h-3.5 w-3.5" }) : _jsx(Volume2, { className: "h-3.5 w-3.5" }), muted ? 'Muted' : 'Sound on'] }))] }), _jsxs("div", { children: [_jsxs("h3", { className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50", children: [_jsx(Users, { className: "h-3.5 w-3.5" }), "In this room (", authed.length + 1, ")"] }), _jsxs("div", { className: "mt-2 grid gap-1.5 sm:grid-cols-2", children: [_jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-content/10 bg-content/[0.03] px-3 py-2", children: [_jsx(UserCheck, { className: "h-4 w-4 shrink-0 text-accent" }), _jsx("p", { className: "min-w-0 flex-1 truncate text-sm font-medium text-content", children: "You" }), _jsx("span", { className: "shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent", children: role === 'host' ? 'Host' : 'Guest' })] }), peers.map((p) => (_jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-content/10 bg-content/[0.03] px-3 py-2", children: [_jsx(UserCheck, { className: `h-4 w-4 shrink-0 ${p.authenticated ? 'text-emerald-400' : 'text-amber-500'}` }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-content", children: p.name }), _jsx("p", { className: "truncate font-mono text-[10px] text-content/35", children: shortId(p.id) })] }), meta?.peerId === p.id && isReceiving && (_jsx("span", { className: "shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400", children: "Live" }))] }, p.id)))] })] }), _jsxs("button", { onClick: () => disconnectAll('Left the watch party (kill switch)'), className: "mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-red-500", children: [_jsx(Power, { className: "h-4 w-4" }), "Leave & disconnect"] })] }))] }) }), document.body);
}
