import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Maximize2, Minimize2, RadioTower, Square, Volume2, VolumeX, X, } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useWebRTCStore, selectAuthenticatedPeers } from '../store/useWebRTCStore';
import { captureVideoStream, getActiveVideoElement, isCapturable, subscribeActiveVideo, } from '../services/mediaElementRegistry';
import { startBroadcast, stopBroadcast } from '../services/webrtcService';
export function BroadcastControls({ compact = false, onNavigate }) {
    const peers = useWebRTCStore(selectAuthenticatedPeers);
    const broadcastTitle = useWebRTCStore((s) => s.broadcastTitle);
    const viewers = useWebRTCStore((s) => s.broadcastViewers);
    const logEvent = useWebRTCStore((s) => s.logEvent);
    const videos = useStore((s) => s.videos);
    const currentVideoId = useStore((s) => s.currentVideoId);
    /* Track the live player element so the button enables/disables itself. */
    const [videoEl, setVideoEl] = useState(() => getActiveVideoElement());
    const [error, setError] = useState(null);
    useEffect(() => subscribeActiveVideo(setVideoEl), []);
    /*
     * readyState changes without re-rendering React, so poll lightly while
     * the panel is open rather than wiring listeners onto a foreign element.
     */
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (broadcastTitle)
            return;
        const id = setInterval(() => forceTick((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, [broadcastTitle]);
    const title = useMemo(() => videos.find((v) => v.id === currentVideoId)?.title ?? 'Live broadcast', [videos, currentVideoId]);
    const live = !!broadcastTitle;
    const ready = isCapturable(videoEl);
    const canStart = ready && peers.length > 0;
    function go() {
        setError(null);
        try {
            const el = getActiveVideoElement();
            if (!isCapturable(el))
                throw new Error('Play a video first — there is nothing to capture yet.');
            /* Live frames + audio straight off the element the user is watching. */
            startBroadcast(captureVideoStream(el), title);
            onNavigate?.();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Could not start the broadcast.';
            setError(message);
            logEvent('warn', message);
        }
    }
    const reason = !ready
        ? 'Start playing a video to broadcast it'
        : peers.length === 0
            ? 'No verified peers to broadcast to'
            : `Broadcast "${title}" to ${peers.length} peer${peers.length === 1 ? '' : 's'}`;
    if (compact) {
        return (_jsxs("div", { className: "contents", children: [live ? (_jsxs("button", { onClick: stopBroadcast, className: "flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white transition hover:bg-red-500", title: `Live to ${viewers.length} viewer(s)`, children: [_jsx(Square, { className: "h-3.5 w-3.5 fill-current" }), "Stop live (", viewers.length, ")"] })) : (_jsxs("button", { onClick: go, disabled: !canStart, title: reason, className: "flex h-10 items-center justify-center gap-2 rounded-xl bg-content/[0.06] text-sm font-semibold text-content transition hover:bg-content/10 disabled:cursor-not-allowed disabled:opacity-40", children: [_jsx(RadioTower, { className: "h-4 w-4" }), "Go live"] })), error && (_jsxs("p", { className: "col-span-2 flex items-center gap-1.5 text-xs text-amber-500", children: [_jsx(AlertTriangle, { className: "h-3.5 w-3.5 shrink-0" }), error] }))] }));
    }
    return (_jsxs("div", { className: "rounded-xl border border-content/10 bg-content/[0.03] p-3", children: [_jsxs("h3", { className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50", children: [_jsx(RadioTower, { className: "h-3.5 w-3.5" }), "Live broadcast"] }), _jsx("p", { className: "mt-1 text-xs leading-relaxed text-content/50", children: "Streams the video you're watching in real time. Viewers see frames, not the file \u2014 nothing is copied to their disk." }), live ? (_jsxs("button", { onClick: stopBroadcast, className: "mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white transition hover:bg-red-500", children: [_jsx(Square, { className: "h-3.5 w-3.5 fill-current" }), "Stop broadcasting (", viewers.length, " watching)"] })) : (_jsxs("button", { onClick: go, disabled: !canStart, title: reason, className: "mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40", children: [_jsx(RadioTower, { className: "h-4 w-4" }), "Go live"] })), !canStart && !live && _jsx("p", { className: "mt-2 text-center text-xs text-content/40", children: reason }), error && (_jsxs("p", { className: "mt-2 flex items-center gap-1.5 text-xs text-amber-500", children: [_jsx(AlertTriangle, { className: "h-3.5 w-3.5 shrink-0" }), error] }))] }));
}
/* ═══════════════════════════════════════════════════════════════
 *  VIEWER
 * ═══════════════════════════════════════════════════════════════ */
/**
 * Floating player for an incoming broadcast. Mounted app-wide; renders
 * nothing at all unless an authenticated peer is actually streaming.
 */
export default function BroadcastView() {
    const incoming = useWebRTCStore((s) => s.incomingBroadcast);
    const disconnectAll = useWebRTCStore((s) => s.disconnectAll);
    const videoRef = useRef(null);
    const [expanded, setExpanded] = useState(true);
    /* Browsers block autoplay with sound; start muted and let the user opt in. */
    const [muted, setMuted] = useState(true);
    const [waiting, setWaiting] = useState(true);
    /*
     * MediaStream is attached via srcObject, never via a URL. It is live —
     * there is no buffer to seek, which is exactly what keeps latency at
     * WebRTC's floor rather than a player's.
     */
    useEffect(() => {
        const el = videoRef.current;
        if (!el || !incoming)
            return;
        el.srcObject = incoming.stream;
        el.play().catch(() => {
            /* Autoplay refused — the poster/unmute affordance covers it. */
        });
        return () => {
            el.srcObject = null;
        };
    }, [incoming]);
    useEffect(() => {
        if (!incoming)
            return;
        setWaiting(incoming.stream.getVideoTracks().length === 0);
    }, [incoming]);
    useEffect(() => {
        const el = videoRef.current;
        if (el)
            el.muted = muted;
    }, [muted, incoming]);
    if (!incoming)
        return null;
    return createPortal(_jsxs("div", { className: expanded
            ? 'fixed inset-0 z-[300] flex flex-col bg-black/95 backdrop-blur-sm'
            : 'fixed bottom-5 right-5 z-[300] flex w-[380px] flex-col overflow-hidden rounded-xl border border-content/10 bg-surface shadow-2xl shadow-black/60', children: [_jsxs("div", { className: `flex items-center gap-2 px-3 py-2 ${expanded ? 'bg-black/60' : 'border-b border-content/10 bg-surface'}`, children: [_jsxs("span", { className: "flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white", children: [_jsx("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-white" }), "Live"] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-semibold text-content", children: incoming.title }), _jsxs("p", { className: "truncate text-xs text-content/50", children: ["from ", incoming.peerName] })] }), _jsx("button", { onClick: () => setMuted((m) => !m), className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-content/70 transition hover:bg-content/10 hover:text-content", "aria-label": muted ? 'Unmute' : 'Mute', title: muted ? 'Unmute' : 'Mute', children: muted ? _jsx(VolumeX, { className: "h-4 w-4" }) : _jsx(Volume2, { className: "h-4 w-4" }) }), _jsx("button", { onClick: () => setExpanded((v) => !v), className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-content/70 transition hover:bg-content/10 hover:text-content", "aria-label": expanded ? 'Minimize' : 'Expand', children: expanded ? _jsx(Minimize2, { className: "h-4 w-4" }) : _jsx(Maximize2, { className: "h-4 w-4" }) }), _jsxs("button", { onClick: () => disconnectAll('Left the broadcast (kill switch)'), className: "flex h-8 shrink-0 items-center gap-1 rounded-full bg-red-600/90 px-2.5 text-xs font-bold text-white transition hover:bg-red-500", title: "Leave and destroy every P2P connection", children: [_jsx(X, { className: "h-3.5 w-3.5" }), "Leave"] })] }), _jsxs("div", { className: `relative bg-black ${expanded ? 'flex-1' : 'aspect-video w-full'}`, children: [_jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, controls: false, className: "h-full w-full object-contain", onLoadedMetadata: () => setWaiting(false), onClick: () => setMuted((m) => !m) }), waiting && (_jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-2 text-content/50", children: [_jsx(RadioTower, { className: "h-8 w-8 animate-pulse" }), _jsx("p", { className: "text-sm", children: "Waiting for the stream\u2026" })] })), muted && !waiting && (_jsxs("button", { onClick: () => setMuted(false), className: "absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-black", children: [_jsx(VolumeX, { className: "h-4 w-4" }), "Tap to unmute"] }))] })] }), document.body);
}
