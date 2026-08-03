import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Ban, Check, ChevronDown, Copy, Dices, Eye, EyeOff, Info, KeyRound, Loader2, Power, RadioTower, Send, Server, Share2, ShieldAlert, ShieldCheck, Unplug, UserCheck, Users, X, Zap, } from 'lucide-react';
import { useWebRTCStore, selectPendingIncoming, } from '../store/useWebRTCStore';
import { PASSWORD_MIN_LENGTH, ROOM_ID_MAX_DIGITS, ROOM_ID_MIN_DIGITS, isValidRoomId, randomRoomId, } from '../services/p2pProtocol';
import { acceptIncomingFile, declineIncomingFile, shortId } from '../services/webrtcService';
import ShareModal from './ShareModal';
import { BroadcastControls } from './BroadcastView';
/* ─────────────────────────────────────────────────────────────
 *  WEBRTC CONTROL BAR
 * ─────────────────────────────────────────────────────────────
 *  The single entry point to the P2P feature, and the only place it can
 *  be switched on. While `status === 'disconnected'` this component holds
 *  nothing but form state — webrtcService is imported for its (inert)
 *  helpers, and PeerJS itself is not loaded until "Start" is pressed.
 *
 *  The kill switch is deliberately duplicated: once a session is live it
 *  appears both in the header (always reachable, one click, no scrolling)
 *  and at the foot of the panel.
 * ───────────────────────────────────────────────────────────── */
export default function WebRTCBar() {
    const status = useWebRTCStore((s) => s.status);
    const roomId = useWebRTCStore((s) => s.roomId);
    const peers = useWebRTCStore((s) => s.peers);
    const disconnectAll = useWebRTCStore((s) => s.disconnectAll);
    const pending = useWebRTCStore(selectPendingIncoming);
    const [panelOpen, setPanelOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const live = status !== 'disconnected';
    const authedCount = peers.filter((p) => p.authenticated).length;
    return (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => setPanelOpen(true), className: `relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-content/80 transition hover:bg-content/10 ${live ? 'bg-emerald-500/10 text-emerald-400' : ''}`, "aria-label": "Peer-to-peer sharing", title: live ? `P2P live — room ${roomId}` : 'Peer-to-peer sharing (off)', children: [_jsx(Share2, { className: "h-5 w-5" }), _jsx(StatusDot, { status: status }), authedCount > 0 && (_jsx("span", { className: "text-xs font-semibold tabular-nums", children: authedCount })), pending.length > 0 && (_jsx("span", { className: "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white", children: pending.length }))] }), live && (_jsxs("button", { onClick: () => disconnectAll('Kill switch activated from the header'), className: "flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500", "aria-label": "Kill switch \u2014 disconnect all peers", title: "Kill switch \u2014 instantly destroy every P2P connection", children: [_jsx(Power, { className: "h-4 w-4" }), _jsx("span", { className: "hidden sm:inline", children: "Kill" })] })), panelOpen && (_jsx(ConnectionPanel, { onClose: () => setPanelOpen(false), onOpenShare: () => {
                    setShareOpen(true);
                    setPanelOpen(false);
                } })), _jsx(ShareModal, { open: shareOpen, onClose: () => setShareOpen(false) }), _jsx(IncomingOfferToasts, { onOpenShare: () => setShareOpen(true) })] }));
}
/* ─────────────────────────────────────────────────────────────
 *  PANEL
 * ───────────────────────────────────────────────────────────── */
function ConnectionPanel({ onClose, onOpenShare }) {
    const status = useWebRTCStore((s) => s.status);
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return createPortal(_jsx("div", { className: "fixed inset-0 z-[400] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center", onClick: onClose, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": "Peer-to-peer sharing", onClick: (e) => e.stopPropagation(), className: "my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-content/10 px-5 py-4", children: [_jsx(Share2, { className: "h-5 w-5 text-primary" }), _jsx("h2", { className: "text-base font-bold text-content", children: "Peer-to-Peer Sharing" }), _jsx(StatusPill, { status: status }), _jsx("button", { onClick: onClose, className: "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": "Close", children: _jsx(X, { className: "h-5 w-5" }) })] }), status === 'disconnected' ? (_jsx(SetupForm, {})) : (_jsx(LiveSession, { onOpenShare: onOpenShare, onClose: onClose }))] }) }), document.body);
}
function SetupForm() {
    const killedAt = useWebRTCStore((s) => s.killedAt);
    const clearKilled = useWebRTCStore((s) => s.clearKilled);
    const lastError = useWebRTCStore((s) => s.lastError);
    const setError = useWebRTCStore((s) => s.setError);
    /* Remounted after every teardown, so seed from the store to keep a
     * rejected guest on the "Join" tab instead of bouncing them to "Host". */
    const [role, setRole] = useState(() => useWebRTCStore.getState().preferredRole);
    const [name, setName] = useState('LocalTube user');
    const [room, setRoom] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);
    const [advanced, setAdvanced] = useState(false);
    const [signaling, setSignaling] = useState({ host: '', port: '9000', path: '/', secure: true });
    const signalingMode = useWebRTCStore((s) => s.signalingMode);
    const setSignalingMode = useWebRTCStore((s) => s.setSignalingMode);
    const selfHosted = signalingMode === 'self-hosted-server';
    const roomValid = isValidRoomId(room);
    const passwordValid = password.length >= PASSWORD_MIN_LENGTH;
    const canStart = roomValid && passwordValid && !busy;
    async function start() {
        setBusy(true);
        setError(null);
        try {
            /* First and only moment PeerJS is fetched. */
            const { startSession } = await import('../services/webrtcService');
            await startSession({
                role,
                roomId: room,
                password,
                displayName: name,
                signalingMode,
                /* A custom broker is only meaningful in native-routing mode — the
                 * relay works on whichever server introduced the two browsers. */
                signaling: selfHosted && signaling.host.trim()
                    ? {
                        host: signaling.host.trim(),
                        port: Number(signaling.port) || 443,
                        path: signaling.path || '/',
                        secure: signaling.secure,
                    }
                    : undefined,
            });
            /* Password stays in the store (needed for late joiners) but is
             * cleared from this form immediately. */
            setPassword('');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start the session.');
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "p-5", children: [killedAt && (_jsxs("div", { className: "mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3", children: [_jsx(ShieldCheck, { className: "mt-0.5 h-4 w-4 shrink-0 text-emerald-400" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-xs font-semibold text-emerald-400", children: "Disconnected \u2014 this browser is fully isolated." }), _jsx("p", { className: "mt-0.5 text-xs leading-relaxed text-content/60", children: "Every data channel, media stream and signaling socket was destroyed, and received files were released from memory." })] }), _jsx("button", { onClick: clearKilled, className: "shrink-0 rounded-full p-1 text-emerald-400/60 transition hover:text-emerald-400", "aria-label": "Dismiss", children: _jsx(X, { className: "h-3.5 w-3.5" }) })] })), _jsxs("div", { className: "flex items-start gap-2 rounded-xl border border-content/10 bg-content/[0.03] p-3", children: [_jsx(Info, { className: "mt-0.5 h-4 w-4 shrink-0 text-content/40" }), _jsxs("p", { className: "text-xs leading-relaxed text-content/60", children: ["WebRTC is ", _jsx("span", { className: "font-semibold text-content", children: "completely off" }), " right now \u2014 no connection library is even loaded. Starting a room opens a direct, encrypted browser-to-browser channel. Peers can never browse or request your files; you push individual files by hand."] })] }), _jsxs("div", { className: "mt-4 grid grid-cols-2 gap-2 rounded-xl bg-content/[0.04] p-1", children: [_jsx(RoleTab, { active: role === 'host', onClick: () => setRole('host'), label: "Host a room" }), _jsx(RoleTab, { active: role === 'guest', onClick: () => setRole('guest'), label: "Join a room" })] }), _jsx(Field, { label: "Display name", className: "mt-4", children: _jsx("input", { value: name, onChange: (e) => setName(e.target.value), maxLength: 32, className: "h-10 w-full rounded-xl border border-content/10 bg-base px-3 text-sm text-content outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30", placeholder: "Shown to peers in the room" }) }), _jsx(Field, { label: `Room ID (${ROOM_ID_MIN_DIGITS}–${ROOM_ID_MAX_DIGITS} digits)`, className: "mt-3", children: _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: room, onChange: (e) => setRoom(e.target.value.replace(/\D/g, '').slice(0, ROOM_ID_MAX_DIGITS)), inputMode: "numeric", autoComplete: "off", placeholder: "482913", className: "h-10 w-full rounded-xl border border-content/10 bg-base px-3 font-mono text-lg tracking-[0.35em] text-content outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30" }), role === 'host' && (_jsx("button", { onClick: () => setRoom(randomRoomId()), className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-content/10 bg-content/5 text-content/70 transition hover:bg-content/10 hover:text-content", title: "Generate a random room ID", "aria-label": "Generate a random room ID", children: _jsx(Dices, { className: "h-4 w-4" }) }))] }) }), _jsxs(Field, { label: "Room password", className: "mt-3", children: [_jsxs("div", { className: "relative", children: [_jsx(KeyRound, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content/30" }), _jsx("input", { type: showPassword ? 'text' : 'password', value: password, onChange: (e) => setPassword(e.target.value), autoComplete: "off", placeholder: `At least ${PASSWORD_MIN_LENGTH} characters`, className: "h-10 w-full rounded-xl border border-content/10 bg-base pl-9 pr-10 text-sm text-content outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30" }), _jsx("button", { onClick: () => setShowPassword((v) => !v), className: "absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-content/40 transition hover:text-content", "aria-label": showPassword ? 'Hide password' : 'Show password', children: showPassword ? _jsx(EyeOff, { className: "h-4 w-4" }) : _jsx(Eye, { className: "h-4 w-4" }) })] }), _jsx(PasswordStrength, { password: password })] }), _jsxs("button", { onClick: () => setAdvanced((v) => !v), className: "mt-4 flex w-full items-center gap-1.5 text-xs font-medium text-content/50 transition hover:text-content/80", children: [_jsx(ChevronDown, { className: `h-3.5 w-3.5 transition-transform ${advanced ? 'rotate-180' : ''}` }), "Advanced \u2014 live video & signaling", _jsx("span", { className: `ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${selfHosted ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-400'}`, children: selfHosted ? 'Self-hosted' : 'In-band relay' })] }), advanced && (_jsxs("div", { className: "mt-2 space-y-2 rounded-xl border border-content/10 bg-content/[0.03] p-3", children: [_jsxs("p", { className: "text-xs leading-relaxed text-content/60", children: ["LocalTube uses PeerJS's public broker to ", _jsx("em", { children: "introduce" }), " the two browsers. It never sees your files, your stream or your password \u2014 but it does see your room ID and IP. What follows only changes how a ", _jsx("span", { className: "font-semibold text-content", children: "live broadcast" }), ' ', "negotiates; file transfer is identical either way."] }), _jsx(ModeCard, { active: !selfHosted, onClick: () => setSignalingMode('default-relay'), icon: _jsx(Zap, { className: "h-4 w-4" }), title: "In-band relay", badge: "Default \u00B7 no setup", tone: "emerald", children: "Tunnels the video invitation through the encrypted data channel the two browsers already share, so the broker never has to carry it \u2014 which is exactly what it fails to do. Works out of the box on the public broker, with no terminal and no server." }), _jsxs(ModeCard, { active: selfHosted, onClick: () => setSignalingMode('self-hosted-server'), icon: _jsx(Server, { className: "h-4 w-4" }), title: "Self-hosted PeerServer", badge: "Advanced / LAN", tone: "amber", children: ["Native PeerJS media routing (", _jsx("code", { className: "font-mono", children: "peer.call" }), "), where the invitation travels through the signaling server. Removes the third-party broker entirely, but needs one of your own \u2014 run ", _jsx("code", { className: "font-mono", children: "npx peer --port 9000" }), " and point both browsers at it below."] }), selfHosted && (_jsxs("div", { className: "space-y-2 rounded-lg border border-content/10 bg-base/40 p-2.5", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: signaling.host, onChange: (e) => setSignaling({ ...signaling, host: e.target.value }), placeholder: "peer.example.com or 192.168.1.20", className: "h-9 w-full rounded-lg border border-content/10 bg-base px-2.5 text-xs text-content outline-none focus:border-accent/60" }), _jsx("input", { value: signaling.port, onChange: (e) => setSignaling({ ...signaling, port: e.target.value.replace(/\D/g, '') }), placeholder: "9000", className: "h-9 w-20 shrink-0 rounded-lg border border-content/10 bg-base px-2.5 text-xs text-content outline-none focus:border-accent/60" })] }), _jsxs("label", { className: "flex items-center gap-2 text-xs text-content/60", children: [_jsx("input", { type: "checkbox", checked: signaling.secure, onChange: (e) => setSignaling({ ...signaling, secure: e.target.checked }), className: "accent-current" }), "Use TLS (wss://)"] }), !signaling.host.trim() && (_jsxs("p", { className: "flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-500", children: [_jsx(AlertTriangle, { className: "mt-px h-3.5 w-3.5 shrink-0" }), "No server set \u2014 this mode will fall back to the public broker, which does not relay media invitations, so broadcasts will not reach viewers."] }))] })), _jsx("p", { className: "text-[11px] leading-relaxed text-content/40", children: "Both modes end at the same place: one direct, DTLS/SRTP-encrypted connection between the two browsers. Only the route the invitation takes differs. Both peers should pick the same mode." })] })), lastError && (_jsxs("div", { className: "mt-4 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-400", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0" }), _jsx("span", { className: "leading-relaxed", children: lastError })] })), _jsxs("button", { onClick: start, disabled: !canStart, className: "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40", children: [busy ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : _jsx(Share2, { className: "h-4 w-4" }), busy ? 'Starting…' : role === 'host' ? 'Open room' : 'Join room'] }), !roomValid && room.length > 0 && (_jsxs("p", { className: "mt-2 text-center text-xs text-amber-500", children: ["Room IDs are ", ROOM_ID_MIN_DIGITS, "\u2013", ROOM_ID_MAX_DIGITS, " digits."] }))] }));
}
/**
 * One selectable broadcast-transport mode. Radio semantics rather than a
 * checkbox: the two modes are mutually exclusive routes for the same
 * negotiation, and picking one has to be a deliberate, explained choice.
 */
function ModeCard({ active, onClick, icon, title, badge, tone, children, }) {
    const accent = tone === 'emerald' ? 'text-emerald-400' : 'text-amber-500';
    return (_jsxs("button", { type: "button", role: "radio", "aria-checked": active, onClick: onClick, className: `w-full rounded-lg border p-2.5 text-left transition ${active
            ? 'border-accent/50 bg-accent/[0.07]'
            : 'border-content/10 bg-content/[0.02] hover:bg-content/[0.05]'}`, children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: `flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-accent bg-accent' : 'border-content/25'}`, children: active && _jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-white" }) }), _jsx("span", { className: active ? accent : 'text-content/50', children: icon }), _jsx("span", { className: "text-sm font-semibold text-content", children: title }), _jsx("span", { className: `ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wide ${active ? accent : 'text-content/35'}`, children: badge })] }), _jsx("span", { className: "mt-1.5 block pl-6 text-xs leading-relaxed text-content/60", children: children })] }));
}
function RoleTab({ active, onClick, label }) {
    return (_jsx("button", { onClick: onClick, className: `rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? 'bg-content/10 text-content' : 'text-content/50 hover:text-content/80'}`, children: label }));
}
function Field({ label, className = '', children, }) {
    return (_jsxs("label", { className: `block ${className}`, children: [_jsx("span", { className: "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-content/50", children: label }), children] }));
}
/**
 * The password is the *only* thing standing between a room-ID guesser and
 * the room, and a captured handshake can be attacked offline — so the
 * strength hint explains the stakes rather than just scoring characters.
 */
function PasswordStrength({ password }) {
    const { label, tone, width } = useMemo(() => {
        if (!password)
            return { label: '', tone: '', width: 0 };
        let score = 0;
        if (password.length >= PASSWORD_MIN_LENGTH)
            score++;
        if (password.length >= 14)
            score++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password))
            score++;
        if (/\d/.test(password))
            score++;
        if (/[^A-Za-z0-9]/.test(password))
            score++;
        if (password.length < PASSWORD_MIN_LENGTH)
            return { label: 'Too short', tone: 'text-red-400', width: 15 };
        if (score <= 2)
            return { label: 'Weak', tone: 'text-red-400', width: 33 };
        if (score === 3)
            return { label: 'Fair', tone: 'text-amber-500', width: 60 };
        if (score === 4)
            return { label: 'Good', tone: 'text-emerald-400', width: 80 };
        return { label: 'Strong', tone: 'text-emerald-400', width: 100 };
    }, [password]);
    if (!password)
        return null;
    return (_jsxs("div", { className: "mt-1.5", children: [_jsx("div", { className: "h-1 w-full overflow-hidden rounded-full bg-content/10", children: _jsx("div", { className: `h-full rounded-full transition-all ${width >= 80 ? 'bg-emerald-500' : width >= 60 ? 'bg-amber-500' : 'bg-red-500'}`, style: { width: `${width}%` } }) }), _jsxs("p", { className: `mt-1 text-[11px] ${tone}`, children: [label, width < 80 && (_jsxs("span", { className: "text-content/40", children: [' ', "\u2014 a long passphrase matters here: anyone who guesses your room ID can attempt the handshake."] }))] })] }));
}
/* ─────────────────────────────────────────────────────────────
 *  LIVE SESSION
 * ───────────────────────────────────────────────────────────── */
function LiveSession({ onOpenShare, onClose }) {
    const roomId = useWebRTCStore((s) => s.roomId);
    const role = useWebRTCStore((s) => s.role);
    const status = useWebRTCStore((s) => s.status);
    const peers = useWebRTCStore((s) => s.peers);
    const events = useWebRTCStore((s) => s.events);
    const lastError = useWebRTCStore((s) => s.lastError);
    const disconnectAll = useWebRTCStore((s) => s.disconnectAll);
    const transfers = useWebRTCStore((s) => s.transferProgress);
    const setLobbyOpen = useWebRTCStore((s) => s.setLobbyOpen);
    /* Only settable from SetupForm, which is unreachable while live — so
     * this always matches the mode the running session was started with. */
    const signalingMode = useWebRTCStore((s) => s.signalingMode);
    const [copied, setCopied] = useState(false);
    const authed = peers.filter((p) => p.authenticated);
    const heldFiles = Object.values(transfers).filter((t) => t.blobUrl).length;
    function copyRoom() {
        if (!roomId)
            return;
        navigator.clipboard?.writeText(roomId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }, () => undefined);
    }
    return (_jsxs("div", { className: "p-5", children: [_jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-content/10 bg-content/[0.03] p-3", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-content/40", children: role === 'host' ? 'Hosting room' : 'Joined room' }), _jsx("p", { className: "font-mono text-2xl tracking-[0.25em] text-content", children: roomId })] }), _jsxs("button", { onClick: copyRoom, className: "flex h-9 items-center gap-1.5 rounded-lg border border-content/10 bg-content/5 px-3 text-xs font-medium text-content/70 transition hover:bg-content/10 hover:text-content", children: [copied ? _jsx(Check, { className: "h-3.5 w-3.5 text-emerald-400" }) : _jsx(Copy, { className: "h-3.5 w-3.5" }), copied ? 'Copied' : 'Copy'] })] }), _jsxs("p", { className: "mt-2 flex items-center gap-1.5 text-[11px] text-content/40", children: [signalingMode === 'default-relay' ? (_jsx(Zap, { className: "h-3 w-3 text-emerald-400" })) : (_jsx(Server, { className: "h-3 w-3 text-amber-500" })), "Live video:", ' ', _jsx("span", { className: "font-medium text-content/60", children: signalingMode === 'default-relay' ? 'in-band relay' : 'native PeerJS routing' })] }), status === 'connecting' && (_jsxs("p", { className: "mt-3 flex items-center gap-2 text-xs text-content/50", children: [_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" }), "Waiting for the handshake to complete\u2026"] })), lastError && (_jsxs("div", { className: "mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-400", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0" }), _jsx("span", { className: "leading-relaxed", children: lastError })] })), _jsxs("div", { className: "mt-4", children: [_jsxs("h3", { className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50", children: [_jsx(Users, { className: "h-3.5 w-3.5" }), "Peers (", authed.length, "/", peers.length, ")"] }), _jsxs("div", { className: "mt-2 space-y-1.5", children: [peers.length === 0 && (_jsx("p", { className: "rounded-xl border border-dashed border-content/10 px-3 py-4 text-center text-xs text-content/40", children: role === 'host'
                                    ? 'Nobody has joined yet. Share the room ID and password over a channel you trust.'
                                    : 'Connecting to the host…' })), peers.map((p) => (_jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-content/10 bg-content/[0.03] px-3 py-2", children: [p.authenticated ? (_jsx(UserCheck, { className: "h-4 w-4 shrink-0 text-emerald-400" })) : (_jsx(ShieldAlert, { className: "h-4 w-4 shrink-0 text-amber-500" })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-content", children: p.name }), _jsx("p", { className: "truncate font-mono text-[10px] text-content/35", children: shortId(p.id) })] }), _jsx("span", { className: `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.authenticated
                                            ? 'bg-emerald-500/15 text-emerald-400'
                                            : 'bg-amber-500/15 text-amber-500'}`, children: p.authenticated ? 'Verified' : 'Verifying' })] }, p.id)))] })] }), _jsxs("div", { className: "mt-4 grid grid-cols-2 gap-2", children: [_jsxs("button", { onClick: onOpenShare, disabled: authed.length === 0, className: "flex h-10 items-center justify-center gap-2 rounded-xl bg-content/[0.06] text-sm font-semibold text-content transition hover:bg-content/10 disabled:cursor-not-allowed disabled:opacity-40", children: [_jsx(Send, { className: "h-4 w-4" }), "Send files"] }), _jsx(BroadcastControls, { compact: true, onNavigate: onClose }), _jsxs("button", { onClick: () => {
                            setLobbyOpen(true);
                            onClose();
                        }, className: "col-span-2 flex h-10 items-center justify-center gap-2 rounded-xl border border-content/10 bg-content/[0.03] text-sm font-semibold text-content/80 transition hover:bg-content/10", children: [_jsx(Users, { className: "h-4 w-4" }), "Open watch party room"] })] }), _jsxs("details", { className: "mt-4 rounded-xl border border-content/10 bg-content/[0.03]", children: [_jsxs("summary", { className: "cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content/50", children: ["Security log (", events.length, ")"] }), _jsxs("div", { className: "max-h-40 overflow-y-auto border-t border-content/10 px-3 py-2", children: [events.length === 0 && _jsx("p", { className: "py-2 text-xs text-content/30", children: "Nothing logged yet." }), events.map((e) => (_jsxs("p", { className: "flex gap-2 py-0.5 text-[11px] leading-relaxed", children: [_jsx("span", { className: "shrink-0 font-mono text-content/30", children: new Date(e.at).toLocaleTimeString() }), _jsx("span", { className: e.level === 'danger'
                                            ? 'text-red-400'
                                            : e.level === 'warn'
                                                ? 'text-amber-500'
                                                : 'text-content/60', children: e.message })] }, e.id)))] })] }), _jsxs("div", { className: "mt-5 rounded-xl border border-red-500/30 bg-red-500/[0.07] p-3", children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx(Ban, { className: "mt-0.5 h-4 w-4 shrink-0 text-red-400" }), _jsxs("p", { className: "text-xs leading-relaxed text-content/70", children: ["Instantly destroys the signaling socket, every data channel and every media stream, and releases received files from memory.", heldFiles > 0 && (_jsxs("span", { className: "font-semibold text-red-400", children: [' ', heldFiles, " received file", heldFiles === 1 ? '' : 's', " will be discarded \u2014 save", ' ', heldFiles === 1 ? 'it' : 'them', " first if you want to keep ", heldFiles === 1 ? 'it' : 'them', "."] }))] })] }), _jsxs("button", { onClick: () => disconnectAll('Kill switch activated'), className: "mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500 active:scale-[0.99]", children: [_jsx(Unplug, { className: "h-5 w-5" }), "Disconnect all"] })] })] }));
}
/* ─────────────────────────────────────────────────────────────
 *  INCOMING FILE CONSENT
 * ─────────────────────────────────────────────────────────────
 *  Receiving is opt-in as well: nothing is buffered until Accept is
 *  clicked, so an unwanted push costs the recipient nothing.
 * ───────────────────────────────────────────────────────────── */
function IncomingOfferToasts({ onOpenShare }) {
    const pending = useWebRTCStore(selectPendingIncoming);
    /* Offers the user waved away without deciding — they stay in the
     * Received tab, they just stop nagging from the corner. */
    const [hidden, setHidden] = useState(new Set());
    const visible = pending.filter((t) => !hidden.has(t.id));
    if (visible.length === 0)
        return null;
    const hide = (id) => setHidden((s) => new Set(s).add(id));
    return createPortal(_jsx("div", { className: "fixed bottom-5 left-5 z-[350] flex w-80 flex-col gap-2", children: visible.slice(0, 3).map((t) => (_jsxs("div", { className: "rounded-xl border border-content/10 bg-surface p-3 shadow-2xl shadow-black/50", children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsxs("p", { className: "min-w-0 flex-1 text-xs font-semibold text-content/50", children: [t.peerName, " wants to send you a file"] }), _jsx("button", { onClick: () => hide(t.id), className: "shrink-0 rounded-full p-0.5 text-content/30 transition hover:text-content/70", "aria-label": "Hide \u2014 decide later in the Received tab", children: _jsx(X, { className: "h-3.5 w-3.5" }) })] }), _jsx("p", { className: "mt-1 truncate text-sm font-medium text-content", title: t.filename, children: t.filename }), _jsx("p", { className: "text-xs text-content/40", children: formatBytes(t.size) }), _jsxs("div", { className: "mt-2.5 flex gap-2", children: [_jsx("button", { onClick: () => declineIncomingFile(t.id), className: "flex-1 rounded-lg bg-content/[0.06] py-1.5 text-xs font-semibold text-content/70 transition hover:bg-content/10", children: "Decline" }), _jsx("button", { onClick: () => {
                                acceptIncomingFile(t.id);
                                onOpenShare();
                            }, className: "flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-white transition hover:brightness-110", children: "Accept" })] })] }, t.id))) }), document.body);
}
/* ─────────────────────────────────────────────────────────────
 *  BITS
 * ───────────────────────────────────────────────────────────── */
function StatusDot({ status }) {
    const color = status === 'disconnected'
        ? 'bg-content/25'
        : status === 'connecting'
            ? 'bg-amber-500 animate-pulse'
            : status === 'broadcasting'
                ? 'bg-red-500 animate-pulse'
                : 'bg-emerald-500';
    return _jsx("span", { className: `h-2 w-2 shrink-0 rounded-full ${color}` });
}
function StatusPill({ status }) {
    const map = {
        disconnected: {
            label: 'Off',
            className: 'bg-content/10 text-content/50',
            icon: _jsx(ShieldCheck, { className: "h-3 w-3" }),
        },
        connecting: {
            label: 'Connecting',
            className: 'bg-amber-500/15 text-amber-500',
            icon: _jsx(Loader2, { className: "h-3 w-3 animate-spin" }),
        },
        connected: {
            label: 'Connected',
            className: 'bg-emerald-500/15 text-emerald-400',
            icon: _jsx(Check, { className: "h-3 w-3" }),
        },
        broadcasting: {
            label: 'Live',
            className: 'bg-red-500/15 text-red-400',
            icon: _jsx(RadioTower, { className: "h-3 w-3" }),
        },
    };
    const s = map[status] ?? map.disconnected;
    return (_jsxs("span", { className: `flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.className}`, children: [s.icon, s.label] }));
}
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
