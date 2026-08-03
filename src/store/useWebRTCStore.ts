import { create } from 'zustand';
import { useChatStore } from './useChatStore';

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

/**
 * How a live broadcast negotiates its media connection.
 *
 * 'default-relay' (the default)
 *   Tunnels the media SDP offer/answer and the ICE candidates through the
 *   already-open, authenticated DataChannel. Works on the public PeerJS
 *   broker, which relays data offers but silently drops media offers —
 *   the reason broadcasting used to need a self-hosted server.
 *
 * 'self-hosted-server'
 *   Native PeerJS media routing (`peer.call`), where the media offer goes
 *   through the signaling server. Requires a server that actually relays
 *   it, i.e. your own (`npx peer --port 9000`).
 *
 * Both produce the same thing — one RTCPeerConnection carrying the same
 * DTLS/SRTP-encrypted tracks. Only the path the *offer* takes differs.
 */
export type SignalingMode = 'default-relay' | 'self-hosted-server';

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
  /**
   * True when we hold an actual DataConnection to this peer.
   *
   * In the star topology a guest is only ever connected to the host, but it
   * still needs to *know* about the other guests to open a whisper tab with
   * them — the host publishes a roster for exactly that. Those entries are
   * `direct: false`: chat reaches them (the host relays), file push does
   * not, so anything that moves bulk bytes must filter on this.
   */
  direct: boolean;
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

/** Who is broadcasting to us and what they called it. */
export interface BroadcastMeta {
  peerId: string;
  peerName: string;
  title: string;
  startedAt: number;
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
  /**
   * The custom signaling server this session was started against, if any.
   * Kept so an invite link can carry it — a guest who lands on the public
   * broker while the host is on their own PeerServer is on a different
   * network entirely and would simply never find the room.
   */
  signalingServer: { host: string; port: number; path?: string; secure?: boolean } | null;
  displayName: string;
  /** Survives teardown so a retry after a rejection reopens the right tab. */
  preferredRole: SessionRole;
  /**
   * Broadcast transport preference. A setting, not session state — it
   * survives the kill switch so the user doesn't have to re-pick it, and
   * it is read once by startSession (changing it mid-session does nothing
   * until the next broadcast is started).
   */
  signalingMode: SignalingMode;

  peers: PeerInfo[];

  /** Keyed by transfer id so high-frequency progress ticks stay O(1). */
  transferProgress: Record<string, TransferProgress>;

  /* ── broadcasting (host side) ── */
  broadcastTitle: string | null;
  /** Peer ids currently being sent our captured stream. */
  broadcastViewers: string[];

  /* ── broadcasting (guest side) ──
   *
   *  Split into three fields on purpose. The stream and the "are we
   *  receiving?" flag change at different moments: metadata arrives over
   *  the DataChannel (`bcast-start`) potentially well before the media
   *  call negotiates, so the lobby can show "connecting to stream…" in
   *  between instead of appearing to hang. */
  activeStream: MediaStream | null;
  isReceivingBroadcast: boolean;
  broadcastMeta: BroadcastMeta | null;

  /** Watch-party room UI visibility (auto-opened when a broadcast lands). */
  lobbyOpen: boolean;

  /* ── diagnostics ── */
  lastError: string | null;
  events: SecurityEvent[];
  /** Timestamp of the last kill-switch activation, for the "isolated" banner. */
  killedAt: number | null;

  /* ── actions ── */
  setStatus: (status: ConnectionStatus) => void;
  setSignalingMode: (mode: SignalingMode) => void;
  beginSession: (args: {
    role: SessionRole;
    roomId: string;
    password: string;
    displayName: string;
    signalingServer?: { host: string; port: number; path?: string; secure?: boolean } | null;
  }) => void;
  sessionEstablished: (localPeerId: string) => void;

  upsertPeer: (peer: PeerInfo) => void;
  patchPeer: (id: string, patch: Partial<PeerInfo>) => void;
  removePeer: (id: string) => void;
  /** Guest side: replace the set of indirect (host-published) peers. */
  applyRoster: (entries: { id: string; name: string }[]) => void;

  upsertTransfer: (transfer: TransferProgress) => void;
  patchTransfer: (id: string, patch: Partial<TransferProgress>) => void;
  dismissTransfer: (id: string) => void;

  setBroadcast: (title: string | null) => void;
  addViewer: (peerId: string) => void;
  removeViewer: (peerId: string) => void;

  /** A peer announced a broadcast — metadata only, no media yet. */
  announceIncomingBroadcast: (meta: BroadcastMeta) => void;
  /** The media call negotiated and tracks arrived. */
  setActiveStream: (stream: MediaStream, meta: BroadcastMeta) => void;
  /** Broadcast ended, peer left, or we tore down. */
  clearIncomingBroadcast: () => void;
  setLobbyOpen: (open: boolean) => void;

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
  signalingServer: null,
  peers: [] as PeerInfo[],
  /* Kept out of CLEAN_SLATE's reset targets on purpose — see disconnectAll. */
  transferProgress: {} as Record<string, TransferProgress>,
  broadcastTitle: null,
  broadcastViewers: [] as string[],
  activeStream: null,
  isReceivingBroadcast: false,
  broadcastMeta: null,
  lobbyOpen: false,
};

export const useWebRTCStore = create<WebRTCState>()((set, get) => ({
  ...CLEAN_SLATE,
  displayName: 'LocalTube user',
  preferredRole: 'host',
  /* Works everywhere with no setup — see the SignalingMode doc comment. */
  signalingMode: 'default-relay',
  lastError: null,
  events: [],
  killedAt: null,

  setStatus: (status) => set({ status }),

  setSignalingMode: (signalingMode) => set({ signalingMode }),

  beginSession: ({ role, roomId, password, displayName, signalingServer }) =>
    set({
      ...CLEAN_SLATE,
      status: 'connecting',
      role,
      preferredRole: role,
      roomId,
      password,
      signalingServer: signalingServer ?? null,
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

  /*
   * Direct peers are ours and untouched; indirect ones are entirely the
   * host's to declare, so they are replaced wholesale rather than merged —
   * that way a peer the host dropped disappears here too.
   */
  applyRoster: (entries) =>
    set((s) => {
      const directs = s.peers.filter((p) => p.direct);
      const known = new Set(directs.map((p) => p.id));
      const indirect: PeerInfo[] = entries
        .filter((e) => !known.has(e.id))
        .map((e) => {
          const prev = s.peers.find((p) => p.id === e.id);
          return {
            id: e.id,
            name: e.name,
            authenticated: true,
            joinedAt: prev?.joinedAt ?? Date.now(),
            failedAttempts: 0,
            direct: false,
          };
        });
      return { peers: [...directs, ...indirect] };
    }),

  removePeer: (id) =>
    set((s) => ({
      peers: s.peers.filter((p) => p.id !== id),
      broadcastViewers: s.broadcastViewers.filter((v) => v !== id),
      /* A departing broadcaster takes their stream with them. */
      ...(s.broadcastMeta?.peerId === id
        ? { activeStream: null, isReceivingBroadcast: false, broadcastMeta: null }
        : {}),
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

  /*
   * Announced but not yet flowing. Keeping this distinct from
   * setActiveStream is what lets the lobby say "connecting to stream…"
   * rather than silently sitting on the waiting screen while ICE works.
   */
  announceIncomingBroadcast: (meta) =>
    set({ broadcastMeta: meta, isReceivingBroadcast: false, lobbyOpen: true }),

  setActiveStream: (stream, meta) =>
    set({
      activeStream: stream,
      broadcastMeta: meta,
      isReceivingBroadcast: true,
      /* Surface the viewer without the user having to hunt for it. */
      lobbyOpen: true,
    }),

  clearIncomingBroadcast: () =>
    set({ activeStream: null, isReceivingBroadcast: false, broadcastMeta: null }),

  setLobbyOpen: (open) => set({ lobbyOpen: open }),

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
    const { transferProgress, activeStream } = get();
    for (const t of Object.values(transferProgress)) {
      if (t.blobUrl) {
        try {
          URL.revokeObjectURL(t.blobUrl);
        } catch {
          /* already revoked — fine */
        }
      }
    }

    /* 2b ─ Wipe the chat transcript and revoke every attachment URL.
     *      Chat is the other place this tab holds peer-supplied bytes, and
     *      "kill switch" has to mean all of them — not just file transfers. */
    try {
      useChatStore.getState().clearAllChat();
    } catch (err) {
      console.error('[LocalTube P2P] chat wipe error (continuing)', err);
    }

    /* 3 ─ Stop any inbound media tracks we still hold a handle on. */
    if (activeStream) {
      for (const track of activeStream.getTracks()) {
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
      /* A transport preference, not a session artefact — keep it. */
      signalingMode: s.signalingMode,
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

/**
 * Peers we hold an actual connection to. Anything that moves bulk bytes
 * (file push, media calls) must use this rather than the full list, which
 * also contains host-published peers reachable only via chat relay.
 */
export const selectDirectPeers = (s: WebRTCState) =>
  s.peers.filter((p) => p.authenticated && p.direct);

export const selectPendingIncoming = (s: WebRTCState) =>
  Object.values(s.transferProgress).filter(
    (t) => t.direction === 'incoming' && t.status === 'awaiting-consent',
  );

export const selectActiveTransfers = (s: WebRTCState) =>
  Object.values(s.transferProgress).filter((t) => t.status === 'transferring');

/** True while the app holds any P2P resource at all. */
export const selectIsLive = (s: WebRTCState) => s.status !== 'disconnected';

/** A broadcast was announced but its media hasn't negotiated yet. */
export const selectBroadcastPending = (s: WebRTCState) =>
  !!s.broadcastMeta && !s.isReceivingBroadcast;
