import { create } from 'zustand';
import { CHAT_MAX_MESSAGES, CHAT_ROOM_TARGET } from '../services/p2pProtocol';

/* ─────────────────────────────────────────────────────────────
 *  CHAT STATE — 100% VOLATILE
 * ─────────────────────────────────────────────────────────────
 *  ZERO PERSISTENCE IS THE WHOLE POINT OF THIS FILE.
 *
 *  This store is never wrapped in zustand's persist() middleware and never
 *  touches localStorage, sessionStorage, IndexedDB, the Cache API, or the
 *  File System Access API. Transcripts and attachments live in this tab's
 *  heap and nowhere else: a refresh, a tab close or the kill switch and
 *  they are gone. There is no export, no "save chat", and no recovery.
 *
 *  Two consequences that are easy to break later, so guard them:
 *
 *   1. DO NOT add persist() here, and do not mirror messages into useStore
 *      (which IS persisted). If chat has to survive a refresh, that is a
 *      product decision that changes this file's contract — not a bug fix.
 *
 *   2. Attachments are Blob URLs, and a Blob URL pins its bytes for the
 *      lifetime of the document even after every reference is dropped.
 *      Every path that removes a message must revoke its URL, or "volatile"
 *      quietly becomes "resident until reload". The three paths are
 *      eviction (the ring buffer), {@link ChatState.dropPeerThread} and
 *      {@link ChatState.clearAllChat} — all of them go through revoke().
 * ───────────────────────────────────────────────────────────── */

/** 'ALL' = the room thread; anything else is a peer id (a whisper thread). */
export type ChatThread = string;

export interface ChatAttachment {
  name: string;
  size: number;
  /** Re-derived locally from the extension — never taken from the wire. */
  type: string;
  /** Null until the last chunk lands (or forever, if it failed). */
  blobUrl: string | null;
  /** 0…1. Drives the inline progress bar on both sides. */
  progress: number;
  /** Set instead of blobUrl when the transfer died. */
  error?: string;
}

export interface ChatMessage {
  id: string;
  /** Peer id of the author, or {@link LOCAL_SENDER_ID} when it's us. */
  senderId: string;
  senderName: string;
  /**
   * Who the message was addressed to: 'ALL' or a specific peer id.
   * This is the *address*, not the tab — see {@link ChatMessage.threadId}.
   */
  targetPeerId: ChatThread;
  /**
   * Which tab this belongs in. For room messages that is 'ALL'; for a
   * whisper it is always the *other* participant, so an outgoing whisper
   * and the reply it earns land in the same conversation.
   */
  threadId: ChatThread;
  mine: boolean;
  /** Join/leave notices and local errors — rendered as centred pills. */
  system?: boolean;
  text?: string;
  file?: ChatAttachment;
  timestamp: number;
}

export const LOCAL_SENDER_ID = '__me__';

interface ChatState {
  messages: ChatMessage[];
  /** Which conversation the panel is showing. */
  activeTab: ChatThread;
  open: boolean;
  /** Per-thread unread counts, keyed the same way as threadId. */
  unread: Record<ChatThread, number>;

  addMessage: (msg: ChatMessage) => void;
  /** Progress ticks and the final blobUrl for an attachment. */
  patchAttachment: (id: string, patch: Partial<ChatAttachment>) => void;
  pushSystem: (text: string, threadId?: ChatThread) => void;

  setActiveTab: (tab: ChatThread) => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;

  /** A peer left: keep the transcript, drop nothing, just stop the badge. */
  dropPeerThread: (peerId: string) => void;

  /** Wipes everything and revokes every attachment URL. Kill-switch hook. */
  clearAllChat: () => void;
}

/** Single choke point for releasing attachment bytes. */
function revoke(messages: ChatMessage[]): void {
  for (const m of messages) {
    if (m.file?.blobUrl) {
      try {
        URL.revokeObjectURL(m.file.blobUrl);
      } catch {
        /* already revoked — fine */
      }
    }
  }
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  activeTab: CHAT_ROOM_TARGET,
  open: false,
  unread: {},

  addMessage: (msg) =>
    set((s) => {
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

  patchAttachment: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== id || !m.file) return m;
        /* Replacing an existing URL would strand the old one. */
        if (patch.blobUrl !== undefined && m.file.blobUrl && m.file.blobUrl !== patch.blobUrl) {
          try {
            URL.revokeObjectURL(m.file.blobUrl);
          } catch {
            /* ignore */
          }
        }
        return { ...m, file: { ...m.file, ...patch } };
      }),
    })),

  pushSystem: (text, threadId = CHAT_ROOM_TARGET) =>
    get().addMessage({
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

  setActiveTab: (activeTab) =>
    set((s) => ({ activeTab, unread: { ...s.unread, [activeTab]: 0 } })),

  setOpen: (open) =>
    set((s) => (open ? { open, unread: { ...s.unread, [s.activeTab]: 0 } } : { open })),

  toggleOpen: () => (get().open ? get().setOpen(false) : get().setOpen(true)),

  dropPeerThread: (peerId) =>
    set((s) => {
      if (!(peerId in s.unread)) return {};
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

export const selectTotalUnread = (s: ChatState) =>
  Object.values(s.unread).reduce((sum, n) => sum + n, 0);

/** Messages for one tab, in arrival order. */
export const selectThread = (thread: ChatThread) => (s: ChatState) =>
  s.messages.filter((m) => m.threadId === thread);
