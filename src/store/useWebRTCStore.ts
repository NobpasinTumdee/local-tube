import { create } from 'zustand';

/* ─────────────────────────────────────────────────────────────
 *  WEBRTC / P2P STATE
 * ─────────────────────────────────────────────────────────────
 *  DELIBERATELY NOT PERSISTED.
 *
 *  Unlike useStore, this store is never wrapped in zustand's persist()
 *  middleware and never touches localStorage. Room ids, passwords, peer
 *  ids and received blobs exist only in this tab's memory and die with a
 *  refresh — that is a feature, not an omission. If you add persistence
 *  here you break the privacy contract.
 *
 *  It also holds NO PeerJS objects. The store describes the session; the
 *  live Peer / DataConnection / MediaConnection instances live inside
 *  webrtcService.ts, which registers a teardown hook via
 *  {@link registerRtcTeardown} so the kill switch below can reach them
 *  without this module importing (and therefore eagerly loading) PeerJS.
 * ───────────────────────────────────────────────────────────── */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'broadcasting';

/** 'host' owns the room id on the broker; 'guest' dialled into it. */
export type SessionRole = 'host' | 'guest';

export interface PeerInfo {
  /** Full PeerJS id (namespaced). */
  id: string;
  /** Human label supplied by the peer — sanitized before it lands here. */
  name: string;
  /**
   * False until the mutual password handshake completes. Nothing —
   * no file, no stream, no message — is ever acted on for a peer that
   * is still false.
   */
  authenticated: boolean;
  joinedAt: number;
  /** Wrong-password attempts, used for the per-peer lockout. */
  failedAttempts: number;
}

export type TransferDirection = 'outgoing' | 'incoming';

export type TransferStatus =
  /** Offered; waiting for the other side to accept or decline. */
  | 'awaiting-consent'
  | 'transferring'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'failed';

export interface TransferProgress {
  id: string;
  peerId: string;
  peerName: string;
  direction: TransferDirection;
  filename: string;
  size: number;
  /** Bytes moved so far. */
  transferred: number;
  status: TransferStatus;
  error?: string;
  startedAt: number;
  /** Receiver only: set once the blob is reassembled. Revoked on teardown. */
  blobUrl?: string;
  mediaType: 'video' | 'image' | 'other';
  /** Whether we're willing to render this in-app (allowlisted MIME only). */
  playable: boolean;
}

export type SecurityLevel = 'info' | 'warn' | 'danger';

/** Append-only, in-memory audit trail shown in the connection panel. */
export interface SecurityEvent {
  id: string;
  at: number;
  level: SecurityLevel;
  message: string;
}

export interface IncomingBroadcast {
  peerId: string;
  peerName: string;
  title: string;
  stream: MediaStream;
}

const MAX_EVENTS = 60;

interface WebRTCState {
  /* ── session ── */
  status: ConnectionStatus;
  role: SessionRole | null;
  /** The digits the user typed/generated. Never leaves memory. */
  roomId: string | null;
  /** Kept only to re-derive the room key for late joiners. Never on the wire. */
  password: string | null;
  localPeerId: string | null;
  displayName: string;
  /** Survives teardown so a retry after a rejection reopens the right tab. */
  preferredRole: SessionRole;

  peers: PeerInfo[];

  /** Keyed by transfer id so high-frequency progress ticks stay O(1). */
  transferProgress: Record<string, TransferProgress>;

  /* ── broadcasting (host side) ── */
  broadcastTitle: string | null;
  /** Peer ids currently being sent our captured stream. */
  broadcastViewers: string[];

  /* ── broadcasting (guest side) ── */
  incomingBroadcast: IncomingBroadcast | null;

  /* ── diagnostics ── */
  lastError: string | null;
  events: SecurityEvent[];
  /** Timestamp of the last kill-switch activation, for the "isolated" banner. */
  killedAt: number | null;

  /* ── actions ── */
  setStatus: (status: ConnectionStatus) => void;
  beginSession: (args: { role: SessionRole; roomId: string; password: string; displayName: string }) => void;
  sessionEstablished: (localPeerId: string) => void;

  upsertPeer: (peer: PeerInfo) => void;
  patchPeer: (id: string, patch: Partial<PeerInfo>) => void;
  removePeer: (id: string) => void;

  upsertTransfer: (transfer: TransferProgress) => void;
  patchTransfer: (id: string, patch: Partial<TransferProgress>) => void;
  dismissTransfer: (id: string) => void;

  setBroadcast: (title: string | null) => void;
  addViewer: (peerId: string) => void;
  removeViewer: (peerId: string) => void;
  setIncomingBroadcast: (broadcast: IncomingBroadcast | null) => void;

  logEvent: (level: SecurityLevel, message: string) => void;
  setError: (message: string | null) => void;
  clearKilled: () => void;

  /** THE KILL SWITCH. See the comment on the implementation. */
  disconnectAll: (reason?: string) => void;
}

/* ─────────────────────────────────────────────────────────────
 *  TEARDOWN BRIDGE
 * ─────────────────────────────────────────────────────────────
 *  webrtcService registers its destroyer here on startup. Keeping it in a
 *  plain module variable (rather than importing the service) means this
 *  store — and therefore the whole app — can be loaded without PeerJS ever
 *  being fetched, parsed or executed. Opt-in really means opt-in.
 * ───────────────────────────────────────────────────────────── */
let rtcTeardown: (() => void) | null = null;

export function registerRtcTeardown(fn: (() => void) | null): void {
  rtcTeardown = fn;
}

const newEventId = () =>
  globalThis.crypto?.randomUUID?.() ?? `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** State every session starts from, and that the kill switch restores. */
const CLEAN_SLATE = {
  status: 'disconnected' as ConnectionStatus,
  role: null,
  roomId: null,
  password: null,
  localPeerId: null,
  peers: [] as PeerInfo[],
  /* Kept out of CLEAN_SLATE's reset targets on purpose — see disconnectAll. */
  transferProgress: {} as Record<string, TransferProgress>,
  broadcastTitle: null,
  broadcastViewers: [] as string[],
  incomingBroadcast: null,
};

export const useWebRTCStore = create<WebRTCState>()((set, get) => ({
  ...CLEAN_SLATE,
  displayName: 'LocalTube user',
  preferredRole: 'host',
  lastError: null,
  events: [],
  killedAt: null,

  setStatus: (status) => set({ status }),

  beginSession: ({ role, roomId, password, displayName }) =>
    set({
      ...CLEAN_SLATE,
      status: 'connecting',
      role,
      preferredRole: role,
      roomId,
      password,
      displayName,
      lastError: null,
      killedAt: null,
    }),

  sessionEstablished: (localPeerId) =>
    set((s) => ({ localPeerId, status: s.status === 'connecting' ? 'connected' : s.status })),

  upsertPeer: (peer) =>
    set((s) => {
      const i = s.peers.findIndex((p) => p.id === peer.id);
      if (i < 0) return { peers: [...s.peers, peer] };
      const peers = [...s.peers];
      peers[i] = { ...peers[i], ...peer };
      return { peers };
    }),

  patchPeer: (id, patch) =>
    set((s) => ({ peers: s.peers.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  removePeer: (id) =>
    set((s) => ({
      peers: s.peers.filter((p) => p.id !== id),
      broadcastViewers: s.broadcastViewers.filter((v) => v !== id),
      /* A departing broadcaster takes their stream with them. */
      incomingBroadcast: s.incomingBroadcast?.peerId === id ? null : s.incomingBroadcast,
    })),

  upsertTransfer: (transfer) =>
    set((s) => ({ transferProgress: { ...s.transferProgress, [transfer.id]: transfer } })),

  patchTransfer: (id, patch) =>
    set((s) => {
      const cur = s.transferProgress[id];
      if (!cur) return {};
      return { transferProgress: { ...s.transferProgress, [id]: { ...cur, ...patch } } };
    }),

  dismissTransfer: (id) =>
    set((s) => {
      const cur = s.transferProgress[id];
      if (!cur) return {};
      /* Drop the blob's last reference so the browser can reclaim the bytes. */
      if (cur.blobUrl) URL.revokeObjectURL(cur.blobUrl);
      const next = { ...s.transferProgress };
      delete next[id];
      return { transferProgress: next };
    }),

  setBroadcast: (title) =>
    set((s) => ({
      broadcastTitle: title,
      broadcastViewers: title ? s.broadcastViewers : [],
      status: title ? 'broadcasting' : s.status === 'broadcasting' ? 'connected' : s.status,
    })),

  addViewer: (peerId) =>
    set((s) =>
      s.broadcastViewers.includes(peerId)
        ? {}
        : { broadcastViewers: [...s.broadcastViewers, peerId] },
    ),

  removeViewer: (peerId) =>
    set((s) => ({ broadcastViewers: s.broadcastViewers.filter((v) => v !== peerId) })),

  setIncomingBroadcast: (broadcast) => set({ incomingBroadcast: broadcast }),

  logEvent: (level, message) =>
    set((s) => ({
      events: [{ id: newEventId(), at: Date.now(), level, message }, ...s.events].slice(0, MAX_EVENTS),
    })),

  setError: (message) => set({ lastError: message }),

  clearKilled: () => set({ killedAt: null }),

  /* ─────────────────────────────────────────────────────────
   *  GLOBAL KILL SWITCH
   * ─────────────────────────────────────────────────────────
   *  Contract: after this returns, this browser is a leaf node again —
   *  no signaling socket, no peer connections, no data channels, no
   *  outbound media tracks, and no lingering references to bytes a peer
   *  sent us.
   *
   *  Order matters. We tear down the transport FIRST (so nothing can
   *  arrive mid-wipe and repopulate the state we're about to clear),
   *  then revoke blob URLs, then reset. Every step is defensive: a
   *  half-broken PeerJS instance must not be able to stop the wipe, so
   *  the teardown is wrapped and its failure is logged, never thrown.
   * ───────────────────────────────────────────────────────── */
  disconnectAll: (reason = 'Kill switch activated') => {
    /* 1 ─ Transport: peer.destroy(), every conn.close(), every track.stop(). */
    try {
      rtcTeardown?.();
    } catch (err) {
      console.error('[LocalTube P2P] teardown error (continuing wipe)', err);
    }
    rtcTeardown = null;

    /* 2 ─ Revoke every blob URL minted from received data. Without this the
     *     bytes stay alive in the browser for the lifetime of the document. */
    const { transferProgress, incomingBroadcast } = get();
    for (const t of Object.values(transferProgress)) {
      if (t.blobUrl) {
        try {
          URL.revokeObjectURL(t.blobUrl);
        } catch {
          /* already revoked — fine */
        }
      }
    }

    /* 3 ─ Stop any inbound media tracks we still hold a handle on. */
    if (incomingBroadcast) {
      for (const track of incomingBroadcast.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* already stopped — fine */
        }
      }
    }

    /* 4 ─ Wipe. roomId/password/peers all go back to null in one commit.
     *
     *     lastError is deliberately CARRIED OVER: a teardown is often the
     *     consequence of a failure ("wrong password", "room failed
     *     verification"), and that explanation is the one thing the user
     *     needs once the session is gone. beginSession clears it. */
    set((s) => ({
      ...CLEAN_SLATE,
      displayName: s.displayName,
      /* Remember which side the user was on so a retry lands on the same tab. */
      preferredRole: s.role ?? s.preferredRole,
      lastError: s.lastError,
      killedAt: Date.now(),
      events: [
        { id: newEventId(), at: Date.now(), level: 'danger' as SecurityLevel, message: reason },
        ...s.events,
      ].slice(0, MAX_EVENTS),
    }));
  },
}));

/* ── selectors ─────────────────────────────────────────────── */

export const selectAuthenticatedPeers = (s: WebRTCState) => s.peers.filter((p) => p.authenticated);

export const selectPendingIncoming = (s: WebRTCState) =>
  Object.values(s.transferProgress).filter(
    (t) => t.direction === 'incoming' && t.status === 'awaiting-consent',
  );

export const selectActiveTransfers = (s: WebRTCState) =>
  Object.values(s.transferProgress).filter((t) => t.status === 'transferring');

/** True while the app holds any P2P resource at all. */
export const selectIsLive = (s: WebRTCState) => s.status !== 'disconnected';
