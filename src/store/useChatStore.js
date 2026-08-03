import { create } from 'zustand';
import { CHAT_MAX_MESSAGES, CHAT_ROOM_TARGET } from '../services/p2pProtocol';
export const LOCAL_SENDER_ID = '__me__';
/** Single choke point for releasing attachment bytes. */
function revoke(messages) {
    for (const m of messages) {
        if (m.file?.blobUrl) {
            try {
                URL.revokeObjectURL(m.file.blobUrl);
            }
            catch {
                /* already revoked — fine */
            }
        }
    }
}
export const useChatStore = create()((set, get) => ({
    messages: [],
    activeTab: CHAT_ROOM_TARGET,
    open: false,
    unread: {},
    addMessage: (msg) => set((s) => {
        const messages = [...s.messages, msg];
        /* Ring buffer. Trimming without revoking would leak the bytes of
         * every image ever posted for the life of the document. */
        if (messages.length > CHAT_MAX_MESSAGES) {
            const evicted = messages.splice(0, messages.length - CHAT_MAX_MESSAGES);
            revoke(evicted);
        }
        /* Our own messages, and the thread already on screen, are read. */
        const isRead = msg.mine || (s.open && s.activeTab === msg.threadId);
        const unread = isRead
            ? s.unread
            : { ...s.unread, [msg.threadId]: (s.unread[msg.threadId] ?? 0) + 1 };
        return { messages, unread };
    }),
    patchAttachment: (id, patch) => set((s) => ({
        messages: s.messages.map((m) => {
            if (m.id !== id || !m.file)
                return m;
            /* Replacing an existing URL would strand the old one. */
            if (patch.blobUrl !== undefined && m.file.blobUrl && m.file.blobUrl !== patch.blobUrl) {
                try {
                    URL.revokeObjectURL(m.file.blobUrl);
                }
                catch {
                    /* ignore */
                }
            }
            return { ...m, file: { ...m.file, ...patch } };
        }),
    })),
    pushSystem: (text, threadId = CHAT_ROOM_TARGET) => get().addMessage({
        id: `sys_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        senderId: LOCAL_SENDER_ID,
        senderName: 'System',
        targetPeerId: threadId,
        threadId,
        /* System notices never raise an unread badge. */
        mine: true,
        system: true,
        text,
        timestamp: Date.now(),
    }),
    setActiveTab: (activeTab) => set((s) => ({ activeTab, unread: { ...s.unread, [activeTab]: 0 } })),
    setOpen: (open) => set((s) => (open ? { open, unread: { ...s.unread, [s.activeTab]: 0 } } : { open })),
    toggleOpen: () => (get().open ? get().setOpen(false) : get().setOpen(true)),
    dropPeerThread: (peerId) => set((s) => {
        if (!(peerId in s.unread))
            return {};
        const unread = { ...s.unread };
        delete unread[peerId];
        return { unread };
    }),
    clearAllChat: () => {
        revoke(get().messages);
        set({ messages: [], unread: {}, activeTab: CHAT_ROOM_TARGET, open: false });
    },
}));
/* ── selectors ─────────────────────────────────────────────── */
export const selectTotalUnread = (s) => Object.values(s.unread).reduce((sum, n) => sum + n, 0);
/** Messages for one tab, in arrival order. */
export const selectThread = (thread) => (s) => s.messages.filter((m) => m.threadId === thread);
