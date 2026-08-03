import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, FileIcon, Loader2, Lock, MessageSquare, Paperclip, Send, Smile, Users, X, ZoomIn, } from 'lucide-react';
import { useChatStore, } from '../store/useChatStore';
import { useWebRTCStore, selectAuthenticatedPeers } from '../store/useWebRTCStore';
import { CHAT_MAX_FILE_BYTES, CHAT_MAX_TEXT_CHARS, CHAT_ROOM_TARGET } from '../services/p2pProtocol';
import { sendChatAttachment, sendChatMessage } from '../services/webrtcService';
import { formatBytes } from './WebRTCBar';
/* ─────────────────────────────────────────────────────────────
 *  CHAT PANEL
 * ─────────────────────────────────────────────────────────────
 *  A drawer over the app rather than a layout column, so it can be opened
 *  from anywhere — mid-video, mid-browse — without reflowing what's behind
 *  it or interrupting playback.
 *
 *  This component renders text as plain React children and images from
 *  Blob URLs the *store* owns. It never mints a Blob URL of its own and
 *  never revokes one, so there is exactly one lifecycle owner for those
 *  bytes (useChatStore) and no way for the two to disagree.
 * ───────────────────────────────────────────────────────────── */
const EMOJI = [
    '😀', '😂', '🥹', '😍', '🤩', '😎', '🤔', '😴',
    '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👀',
    '❤️', '🔥', '✨', '🎉', '🍿', '🎬', '📺', '🎵',
    '😱', '😭', '🤯', '💀', '🤡', '🥳', '😅', '🫠',
];
export default function ChatPanel() {
    const open = useChatStore((s) => s.open);
    const setOpen = useChatStore((s) => s.setOpen);
    const activeTab = useChatStore((s) => s.activeTab);
    const setActiveTab = useChatStore((s) => s.setActiveTab);
    const unread = useChatStore((s) => s.unread);
    const messages = useChatStore((s) => s.messages);
    const peers = useWebRTCStore(selectAuthenticatedPeers);
    const status = useWebRTCStore((s) => s.status);
    const live = status !== 'disconnected';
    /* A whisper tab whose peer left falls back to the room. */
    useEffect(() => {
        if (activeTab === CHAT_ROOM_TARGET)
            return;
        if (!peers.some((p) => p.id === activeTab))
            setActiveTab(CHAT_ROOM_TARGET);
    }, [peers, activeTab, setActiveTab]);
    /* Escape closes the drawer, matching every other overlay in the app. */
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, setOpen]);
    const thread = useMemo(() => messages.filter((m) => m.threadId === activeTab), [messages, activeTab]);
    const activePeer = peers.find((p) => p.id === activeTab);
    if (!open || !live)
        return null;
    return createPortal(_jsxs("div", { className: "fixed inset-y-0 right-0 z-[320] flex w-full max-w-md flex-col border-l border-content/10 bg-surface shadow-2xl shadow-black/60", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-content/10 px-4 py-3", children: [_jsx(MessageSquare, { className: "h-4 w-4 text-primary" }), _jsx("h2", { className: "text-sm font-bold text-content", children: "Room chat" }), _jsx("span", { className: "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400", children: "Not saved" }), _jsx("button", { onClick: () => setOpen(false), className: "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": "Close chat", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsxs("div", { className: "flex gap-1 overflow-x-auto border-b border-content/10 px-2 py-2", children: [_jsx(TabButton, { active: activeTab === CHAT_ROOM_TARGET, unread: unread[CHAT_ROOM_TARGET] ?? 0, onClick: () => setActiveTab(CHAT_ROOM_TARGET), icon: _jsx(Users, { className: "h-3.5 w-3.5" }), label: "Room (All)" }), peers.map((p) => (_jsx(TabButton, { active: activeTab === p.id, unread: unread[p.id] ?? 0, onClick: () => setActiveTab(p.id), icon: _jsx(Lock, { className: "h-3 w-3" }), label: p.name }, p.id)))] }), _jsx(MessageList, { thread: thread, activeTab: activeTab }), _jsx(Composer, { target: activeTab, targetName: activePeer?.name, disabled: peers.length === 0 })] }), document.body);
}
function TabButton({ active, unread, onClick, icon, label, }) {
    return (_jsxs("button", { onClick: onClick, className: `relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-content/10 text-content' : 'text-content/50 hover:bg-content/5 hover:text-content/80'}`, children: [icon, _jsx("span", { className: "max-w-[8rem] truncate", children: label }), unread > 0 && !active && (_jsx("span", { className: "flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white", children: unread > 9 ? '9+' : unread }))] }));
}
/* ─────────────────────────────────────────────────────────────
 *  MESSAGES
 * ───────────────────────────────────────────────────────────── */
function MessageList({ thread, activeTab }) {
    const scrollRef = useRef(null);
    const [zoom, setZoom] = useState(null);
    /* Stick to the bottom, but only when the user is already there — yanking
     * someone away from scrollback to show a new message is hostile. */
    const pinnedRef = useRef(true);
    const onScroll = () => {
        const el = scrollRef.current;
        if (!el)
            return;
        pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el && pinnedRef.current)
            el.scrollTop = el.scrollHeight;
    }, [thread.length]);
    /* Switching tabs always lands at the newest message. */
    useLayoutEffect(() => {
        pinnedRef.current = true;
        const el = scrollRef.current;
        if (el)
            el.scrollTop = el.scrollHeight;
    }, [activeTab]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { ref: scrollRef, onScroll: onScroll, className: "flex-1 space-y-2 overflow-y-auto px-4 py-3", children: [thread.length === 0 && (_jsx("p", { className: "py-10 text-center text-xs leading-relaxed text-content/35", children: activeTab === CHAT_ROOM_TARGET
                            ? 'No messages yet. Everything sent here is peer-to-peer and lives only in memory.'
                            : 'Private thread. Only you and this peer can read it.' })), thread.map((m) => (_jsx(MessageRow, { m: m, onZoom: setZoom }, m.id)))] }), zoom && _jsx(ImageZoom, { url: zoom.url, name: zoom.name, onClose: () => setZoom(null) })] }));
}
function MessageRow({ m, onZoom, }) {
    if (m.system) {
        return (_jsx("p", { className: "py-1 text-center text-[11px] text-content/35", children: _jsx("span", { className: "rounded-full bg-content/5 px-2.5 py-1", children: m.text }) }));
    }
    const whisper = m.targetPeerId !== CHAT_ROOM_TARGET;
    return (_jsxs("div", { className: `flex flex-col ${m.mine ? 'items-end' : 'items-start'}`, children: [_jsxs("div", { className: "mb-0.5 flex items-center gap-1.5 px-1", children: [!m.mine && _jsx("span", { className: "text-[11px] font-semibold text-content/60", children: m.senderName }), whisper && (_jsxs("span", { className: "flex items-center gap-0.5 rounded-full bg-fuchsia-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-fuchsia-400", children: [_jsx(Lock, { className: "h-2.5 w-2.5" }), "Private"] })), _jsx("span", { className: "text-[10px] tabular-nums text-content/25", children: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] }), _jsxs("div", { className: `max-w-[85%] overflow-hidden rounded-2xl px-3 py-2 ${m.mine
                    ? 'rounded-br-sm bg-primary text-white'
                    : 'rounded-bl-sm bg-content/[0.07] text-content'}`, children: [m.text && _jsx("p", { className: "whitespace-pre-wrap break-words text-sm leading-relaxed", children: m.text }), m.file && _jsx(Attachment, { file: m.file, mine: m.mine, onZoom: onZoom })] })] }));
}
function Attachment({ file, mine, onZoom, }) {
    const isImage = file.type.startsWith('image/');
    const pct = Math.round(file.progress * 100);
    if (file.error) {
        return (_jsxs("div", { className: "flex items-start gap-2 py-1 text-xs", children: [_jsx(AlertTriangle, { className: `mt-0.5 h-4 w-4 shrink-0 ${mine ? 'text-white/70' : 'text-amber-500'}` }), _jsxs("span", { className: mine ? 'text-white/80' : 'text-content/60', children: [file.name, " \u2014 ", file.error] })] }));
    }
    /* Incoming and still arriving: no URL exists yet. */
    if (!file.blobUrl) {
        return (_jsxs("div", { className: "min-w-[12rem] py-1", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs", children: [_jsx(Loader2, { className: `h-3.5 w-3.5 animate-spin ${mine ? 'text-white/70' : 'text-content/50'}` }), _jsx("span", { className: `truncate ${mine ? 'text-white/90' : 'text-content/70'}`, children: file.name })] }), _jsx("div", { className: `mt-1.5 h-1 w-full overflow-hidden rounded-full ${mine ? 'bg-white/25' : 'bg-content/10'}`, children: _jsx("div", { className: `h-full rounded-full transition-all ${mine ? 'bg-white' : 'bg-primary'}`, style: { width: `${pct}%` } }) }), _jsxs("p", { className: `mt-1 text-[10px] tabular-nums ${mine ? 'text-white/60' : 'text-content/40'}`, children: [pct, "% of ", formatBytes(file.size)] })] }));
    }
    if (isImage) {
        return (_jsxs("div", { className: "py-1", children: [_jsxs("button", { onClick: () => onZoom({ url: file.blobUrl, name: file.name }), className: "group relative block overflow-hidden rounded-xl", title: "Click to zoom", children: [_jsx("img", { src: file.blobUrl, alt: file.name, className: "max-h-64 w-full max-w-full object-contain" }), _jsx("span", { className: "absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100", children: _jsx(ZoomIn, { className: "h-6 w-6 text-white drop-shadow" }) })] }), _jsxs("div", { className: "mt-1 flex items-center gap-2", children: [_jsxs("span", { className: `flex-1 truncate text-[10px] ${mine ? 'text-white/70' : 'text-content/40'}`, children: [file.name, " \u00B7 ", formatBytes(file.size)] }), _jsx("a", { href: file.blobUrl, download: file.name, className: `shrink-0 rounded p-1 transition ${mine ? 'text-white/70 hover:bg-white/15 hover:text-white' : 'text-content/40 hover:bg-content/10 hover:text-content'}`, title: "Save image", children: _jsx(Download, { className: "h-3.5 w-3.5" }) })] })] }));
    }
    return (_jsxs("div", { className: `flex min-w-[13rem] items-center gap-2.5 rounded-xl p-2 ${mine ? 'bg-white/15' : 'bg-content/[0.05]'}`, children: [_jsx("span", { className: `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mine ? 'bg-white/20 text-white' : 'bg-content/10 text-content/60'}`, children: _jsx(FileIcon, { className: "h-4 w-4" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: `truncate text-xs font-medium ${mine ? 'text-white' : 'text-content'}`, children: file.name }), _jsx("p", { className: `text-[10px] ${mine ? 'text-white/60' : 'text-content/40'}`, children: formatBytes(file.size) })] }), _jsxs("a", { href: file.blobUrl, download: file.name, className: `flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition ${mine ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-content/10 text-content/80 hover:bg-content/15'}`, children: [_jsx(Download, { className: "h-3.5 w-3.5" }), "Save"] })] }));
}
function ImageZoom({ url, name, onClose }) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return createPortal(_jsxs("div", { className: "fixed inset-0 z-[420] flex flex-col items-center justify-center bg-black/90 p-6", onClick: onClose, children: [_jsx("img", { src: url, alt: name, onClick: (e) => e.stopPropagation(), className: "max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl" }), _jsxs("div", { className: "mt-3 flex items-center gap-3", onClick: (e) => e.stopPropagation(), children: [_jsx("span", { className: "text-xs text-white/70", children: name }), _jsxs("a", { href: url, download: name, className: "flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25", children: [_jsx(Download, { className: "h-3.5 w-3.5" }), "Save"] }), _jsxs("button", { onClick: onClose, className: "flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/20", children: [_jsx(X, { className: "h-3.5 w-3.5" }), "Close"] })] })] }), document.body);
}
/* ─────────────────────────────────────────────────────────────
 *  COMPOSER
 * ───────────────────────────────────────────────────────────── */
function Composer({ target, targetName, disabled, }) {
    const [text, setText] = useState('');
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [error, setError] = useState(null);
    const taRef = useRef(null);
    const fileRef = useRef(null);
    const room = target === CHAT_ROOM_TARGET;
    /* Auto-expand: reset to auto first so the box can also shrink again. */
    useLayoutEffect(() => {
        const el = taRef.current;
        if (!el)
            return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [text]);
    function submit() {
        const value = text.trim();
        if (!value || disabled)
            return;
        try {
            sendChatMessage(value, target);
            setText('');
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send.');
        }
    }
    function attach(e) {
        const file = e.target.files?.[0];
        /* Reset immediately so picking the same file twice still fires. */
        e.target.value = '';
        if (!file)
            return;
        try {
            sendChatAttachment(file, target);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Could not attach that file.');
        }
    }
    return (_jsxs("div", { className: "border-t border-content/10 px-3 py-2.5", children: [_jsx("div", { className: "mb-1.5 flex items-center gap-1.5 px-1", children: room ? (_jsxs(_Fragment, { children: [_jsx(Users, { className: "h-3 w-3 text-content/40" }), _jsxs("span", { className: "text-[11px] text-content/50", children: ["Sending to ", _jsx("span", { className: "font-semibold text-content/70", children: "Everyone in Room" })] })] })) : (_jsxs(_Fragment, { children: [_jsx(Lock, { className: "h-3 w-3 text-fuchsia-400" }), _jsxs("span", { className: "text-[11px] text-content/50", children: ["Sending ", _jsxs("span", { className: "font-semibold text-fuchsia-400", children: ["privately to ", targetName] })] })] })) }), error && (_jsxs("p", { className: "mb-1.5 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-amber-500", children: [_jsx(AlertTriangle, { className: "mt-px h-3 w-3 shrink-0" }), error] })), emojiOpen && (_jsx("div", { className: "mb-2 grid grid-cols-8 gap-1 rounded-xl border border-content/10 bg-content/[0.03] p-2", children: EMOJI.map((e) => (_jsx("button", { onClick: () => {
                        setText((t) => (t + e).slice(0, CHAT_MAX_TEXT_CHARS));
                        taRef.current?.focus();
                    }, className: "rounded-lg py-1 text-lg transition hover:bg-content/10", children: e }, e))) })), _jsxs("div", { className: "flex items-end gap-1.5", children: [_jsx("button", { onClick: () => fileRef.current?.click(), disabled: disabled, className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-content/50 transition hover:bg-content/10 hover:text-content disabled:opacity-30", title: `Attach an image or file (max ${Math.floor(CHAT_MAX_FILE_BYTES / (1024 * 1024))} MB)`, "aria-label": "Attach file or image", children: _jsx(Paperclip, { className: "h-4 w-4" }) }), _jsx("input", { ref: fileRef, type: "file", onChange: attach, className: "hidden" }), _jsx("button", { onClick: () => setEmojiOpen((v) => !v), className: `flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-content/10 ${emojiOpen ? 'text-primary' : 'text-content/50 hover:text-content'}`, title: "Emoji", "aria-label": "Emoji", "aria-pressed": emojiOpen, children: _jsx(Smile, { className: "h-4 w-4" }) }), _jsx("textarea", { ref: taRef, rows: 1, value: text, disabled: disabled, onChange: (e) => setText(e.target.value.slice(0, CHAT_MAX_TEXT_CHARS)), onKeyDown: (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                submit();
                            }
                        }, placeholder: disabled ? 'Nobody in the room yet…' : 'Message… (Enter to send)', className: "max-h-[140px] min-h-[36px] flex-1 resize-none rounded-2xl border border-content/10 bg-base px-3 py-2 text-sm text-content outline-none transition placeholder:text-content/30 focus:border-accent/60 focus:ring-1 focus:ring-accent/30 disabled:opacity-50" }), _jsx("button", { onClick: submit, disabled: disabled || !text.trim(), className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30", "aria-label": "Send", children: _jsx(Send, { className: "h-4 w-4" }) })] })] }));
}
