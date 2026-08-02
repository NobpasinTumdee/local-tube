import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Minimize2, RadioTower, Square, Users, Volume2, VolumeX, X, } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useWebRTCStore, selectAuthenticatedPeers } from '../store/useWebRTCStore';
import { captureLiveStream, getActiveVideoElement, isCapturable, subscribeActiveVideo, } from '../services/mediaElementRegistry';
import { startBroadcast, stopBroadcast } from '../services/webrtcService';
export function BroadcastControls({ compact = false, onNavigate }) {
    const peers = useWebRTCStore(selectAuthenticatedPeers);
    const broadcastTitle = useWebRTCStore((s) => s.broadcastTitle);
    const viewers = useWebRTCStore((s) => s.broadcastViewers);
    const logEvent = useWebRTCStore((s) => s.logEvent);
    const videos = useStore((s) => s.videos);
    const currentVideoId = useStore((s) => s.currentVideoId);
    const [videoEl, setVideoEl] = useState(() => getActiveVideoElement());
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => subscribeActiveVideo(setVideoEl), []);
    /* readyState changes without notifying React, so poll lightly while idle
     * rather than wiring listeners onto an element we don't own. */
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
    const canStart = ready && peers.length > 0 && !busy;
    async function go() {
        setError(null);
        setBusy(true);
        try {
            const el = getActiveVideoElement();
            if (!isCapturable(el))
                throw new Error('Play a video first — there is nothing to capture yet.');
            /*
             * captureLiveStream resumes playback if paused and verifies the
             * stream actually carries tracks. Broadcasting a track-less stream
             * negotiates "successfully" but delivers nothing, which is exactly
             * the silent failure this replaces.
             */
            const stream = await captureLiveStream(el);
            startBroadcast(stream, title);
            onNavigate?.();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Could not start the broadcast.';
            setError(message);
            logEvent('warn', message);
        }
        finally {
            setBusy(false);
        }
    }
    const reason = !ready
        ? 'Start playing a video to broadcast it'
        : peers.length === 0
            ? 'No verified peers to broadcast to'
            : `Broadcast "${title}" to ${peers.length} peer${peers.length === 1 ? '' : 's'}`;
    if (compact) {
        return (_jsxs("div", { className: "contents", children: [live ? (_jsxs("button", { onClick: stopBroadcast, className: "flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white transition hover:bg-red-500", title: `Live to ${viewers.length} viewer(s)`, children: [_jsx(Square, { className: "h-3.5 w-3.5 fill-current" }), "Stop live (", viewers.length, ")"] })) : (_jsxs("button", { onClick: go, disabled: !canStart, title: reason, className: "flex h-10 items-center justify-center gap-2 rounded-xl bg-content/[0.06] text-sm font-semibold text-content transition hover:bg-content/10 disabled:cursor-not-allowed disabled:opacity-40", children: [busy ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : _jsx(RadioTower, { className: "h-4 w-4" }), "Go live"] })), error && (_jsxs("p", { className: "col-span-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-500", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }), error] }))] }));
    }
    return (_jsxs("div", { className: "rounded-xl border border-content/10 bg-content/[0.03] p-3", children: [_jsxs("h3", { className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50", children: [_jsx(RadioTower, { className: "h-3.5 w-3.5" }), "Live broadcast"] }), _jsx("p", { className: "mt-1 text-xs leading-relaxed text-content/50", children: "Streams the video you're watching in real time. Viewers see frames, not the file \u2014 nothing is copied to their disk." }), live ? (_jsxs("button", { onClick: stopBroadcast, className: "mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white transition hover:bg-red-500", children: [_jsx(Square, { className: "h-3.5 w-3.5 fill-current" }), "Stop broadcasting (", viewers.length, " watching)"] })) : (_jsxs("button", { onClick: go, disabled: !canStart, title: reason, className: "mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40", children: [busy ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : _jsx(RadioTower, { className: "h-4 w-4" }), "Go live"] })), !canStart && !live && !busy && _jsx("p", { className: "mt-2 text-center text-xs text-content/40", children: reason }), error && (_jsxs("p", { className: "mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-500", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }), error] }))] }));
}
/* ═══════════════════════════════════════════════════════════════
 *  VIEWER (fullscreen fallback)
 * ═══════════════════════════════════════════════════════════════ */
export default function BroadcastView() {
    const activeStream = useWebRTCStore((s) => s.activeStream);
    const isReceiving = useWebRTCStore((s) => s.isReceivingBroadcast);
    const meta = useWebRTCStore((s) => s.broadcastMeta);
    const lobbyOpen = useWebRTCStore((s) => s.lobbyOpen);
    const setLobbyOpen = useWebRTCStore((s) => s.setLobbyOpen);
    const disconnectAll = useWebRTCStore((s) => s.disconnectAll);
    const videoRef = useRef(null);
    const [muted, setMuted] = useState(true);
    const [needsGesture, setNeedsGesture] = useState(false);
    /* The lobby owns the viewer whenever it's open. */
    const visible = isReceiving && !lobbyOpen;
    /*
     * A MediaStream cannot be assigned to `src` — it has no URL, and
     * stringifying it yields "[object MediaStream]", so the element shows
     * nothing at all. It must be attached imperatively to the DOM node via
     * srcObject, which means a ref + an effect keyed on the stream.
     */
    useEffect(() => {
        const el = videoRef.current;
        if (!el)
            return;
        if (!activeStream || !visible) {
            el.srcObject = null;
            return;
        }
        if (el.srcObject === activeStream)
            return;
        el.srcObject = activeStream;
        el.muted = muted;
        el.play().then(() => setNeedsGesture(false), () => setNeedsGesture(true));
    }, [activeStream, visible, muted]);
    useEffect(() => {
        const el = videoRef.current;
        if (el)
            el.muted = muted;
    }, [muted, visible]);
    const unmuteAndSync = () => {
        const el = videoRef.current;
        setMuted(false);
        if (!el)
            return;
        el.muted = false;
        el.play().then(() => setNeedsGesture(false), () => setNeedsGesture(true));
    };
    if (!visible)
        return null;
    return createPortal(_jsxs("div", { className: "fixed inset-0 z-[300] flex flex-col bg-black", children: [_jsxs("div", { className: "flex items-center gap-2 bg-black/70 px-4 py-2", children: [_jsxs("span", { className: "flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white", children: [_jsx("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-white" }), "Live"] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-semibold text-white", children: meta?.title }), _jsxs("p", { className: "truncate text-xs text-white/50", children: ["from ", meta?.peerName] })] }), _jsx("button", { onClick: () => setMuted((m) => !m), className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white", "aria-label": muted ? 'Unmute' : 'Mute', children: muted ? _jsx(VolumeX, { className: "h-4 w-4" }) : _jsx(Volume2, { className: "h-4 w-4" }) }), _jsxs("button", { onClick: () => setLobbyOpen(true), className: "flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20", title: "Back to the watch party room", children: [_jsx(Users, { className: "h-3.5 w-3.5" }), "Room"] }), _jsx("button", { onClick: () => setLobbyOpen(true), className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white", "aria-label": "Exit fullscreen", children: _jsx(Minimize2, { className: "h-4 w-4" }) }), _jsxs("button", { onClick: () => disconnectAll('Left the broadcast (kill switch)'), className: "flex h-8 shrink-0 items-center gap-1 rounded-full bg-red-600/90 px-2.5 text-xs font-bold text-white transition hover:bg-red-500", title: "Leave and destroy every P2P connection", children: [_jsx(X, { className: "h-3.5 w-3.5" }), "Leave"] })] }), _jsxs("div", { className: "relative flex-1 bg-black", children: [_jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, muted: muted, controls: false, className: "h-full w-full object-contain", onClick: () => (muted ? unmuteAndSync() : setMuted(true)) }), (muted || needsGesture) && (_jsxs("button", { onClick: unmuteAndSync, className: "absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-2xl shadow-primary/40 transition hover:brightness-110 active:scale-[0.98]", children: [_jsx(VolumeX, { className: "h-4 w-4" }), "Tap to Unmute & Sync"] }))] })] }), document.body);
}
