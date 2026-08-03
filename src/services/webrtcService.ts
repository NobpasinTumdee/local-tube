import type { DataConnection, MediaConnection, Peer } from 'peerjs';
import {
  useWebRTCStore,
  registerRtcTeardown,
  type SessionRole,
  type SignalingMode,
} from '../store/useWebRTCStore';
import { useChatStore, LOCAL_SENDER_ID, type ChatThread } from '../store/useChatStore';
import {
  AUTH_TIMEOUT_MS,
  CHAT_MAX_FILE_BYTES,
  CHAT_ROOM_TARGET,
  DEFAULT_ICE_SERVERS,
  MAX_AUTH_ATTEMPTS,
  MAX_ICE_CANDIDATES,
  MAX_INCOMING_TRACKS,
  PROTOCOL_VERSION,
  assertSecureContext,
  clearRoomKeyCache,
  computeProof,
  decodeMessage,
  deriveRoomKey,
  encodeMessage,
  frameChunk,
  isPreAuthMessage,
  isValidNegotiationId,
  isValidNonce,
  makeNonce,
  negotiateChunkSize,
  newMessageId,
  parseChunk,
  peerIdForRoom,
  randomHex,
  safeMimeFor,
  sanitizeChatText,
  sanitizeDisplayName,
  sanitizeFilename,
  timingSafeEqual,
  validateChatFile,
  validateChatText,
  validateFileOffer,
  validateRoster,
  validateIceCandidate,
  validateSdp,
  type WireMessage,
} from './p2pProtocol';

/* ─────────────────────────────────────────────────────────────
 *  WEBRTC SERVICE
 * ─────────────────────────────────────────────────────────────
 *  The only module in LocalTube that talks to the network.
 *
 *  OPT-IN BY CONSTRUCTION
 *  ──────────────────────
 *  Importing this file does nothing: no Peer is constructed, no socket is
 *  opened, no listener is attached. PeerJS itself is pulled in with a
 *  dynamic import() inside startSession(), so until the user clicks
 *  "Start", the library is never even fetched — verifiable in the Network
 *  tab. `session` stays null and every exported function is a no-op.
 *
 *  NO REMOTE READ
 *  ──────────────
 *  This module has no reference to the media library, no FileSystemHandle
 *  and no directory API. It cannot enumerate anything even if it wanted
 *  to. Bytes can only enter it through sendFileToPeers(), which the UI
 *  calls with File objects a local user hand-picked. There is no inbound
 *  message that triggers a read — see the vocabulary in p2pProtocol.ts.
 * ───────────────────────────────────────────────────────────── */

/** Star topology: everyone talks to the host, nobody talks to each other. */
const MAX_PEERS = 8;

/* Backpressure gates. PeerJS starts buffering internally at 8 MB; we stay
 * an order of magnitude below that so chunks go straight onto the wire and
 * a slow receiver can never balloon the sender's heap. */
const SEND_HIGH_WATER = 1024 * 1024;
const SEND_LOW_WATER = 256 * 1024;
const DRAIN_TIMEOUT_MS = 15_000;

/** Progress commits are throttled — a 2 GB file is ~130k chunks. */
const PROGRESS_INTERVAL_MS = 120;

/**
 * Which feature a transfer belongs to. Both kinds share the framing, the
 * ordering checks and the backpressure below — they differ only in where
 * progress is reported and what happens when the last chunk lands.
 *
 * 'library' — a hand-picked file push. Requires explicit consent.
 * 'chat'    — an attachment inside a message. Auto-accepted, hard-capped
 *             at CHAT_MAX_FILE_BYTES, and never written to disk.
 */
type TransferKind = 'library' | 'chat';

interface OutgoingTransfer {
  id: string;
  seq: number;
  kind: TransferKind;
  /** Relay/duplicate send: move the bytes but don't touch any local UI. */
  silent?: boolean;
  file: File;
  filename: string;
  size: number;
  chunkSize: number;
  chunks: number;
  sent: number;
  cancelled: boolean;
}

interface IncomingTransfer {
  id: string;
  seq: number;
  kind: TransferKind;
  filename: string;
  size: number;
  chunkSize: number;
  chunks: number;
  received: number;
  nextIndex: number;
  accepted: boolean;
  parts: ArrayBuffer[];
  mime: string;
  mediaType: 'video' | 'image' | 'other';
  playable: boolean;
  lastCommit: number;
  /* ── chat only ── */
  /** Address the sender used: 'ALL' or a peer id. Drives host relaying. */
  chatTo?: ChatThread;
  /** Stamped origin of the attachment (never the sender's claim on a relay). */
  chatFrom?: string;
  chatFromName?: string;
  /** False when we are only a relay hop and must not render the message. */
  chatDisplay?: boolean;
}

/**
 * One in-band-relayed media negotiation. Unlike a PeerJS MediaConnection
 * this is a bare RTCPeerConnection we drive ourselves — its offer, answer
 * and candidates travel over the DataChannel rather than the broker.
 */
interface RelayState {
  pc: RTCPeerConnection;
  /** Matches the `nid` on the wire; stale traffic is discarded by it. */
  nid: number;
  /** 'sender' = we are broadcasting; 'receiver' = we are watching. */
  role: 'sender' | 'receiver';
  /** True once setRemoteDescription has resolved — until then ICE queues. */
  remoteReady: boolean;
  /** Candidates that arrived before the remote description was applied. */
  pendingIce: RTCIceCandidateInit[];
  /** Inbound candidate count, for the anti-abuse cap. */
  iceIn: number;
  delivered: boolean;
}

interface ConnState {
  conn: DataConnection;
  role: SessionRole;
  authenticated: boolean;
  name: string;
  /** Challenge issued by the host. */
  hostNonce: string;
  /** Counter-challenge issued by the guest. */
  guestNonce: string;
  authTimer: ReturnType<typeof setTimeout> | null;
  nextSeq: number;
  /** Queued + in-flight pushes, keyed by transfer id. */
  outgoing: Map<string, OutgoingTransfer>;
  /** Accepted-or-pending inbound pushes, keyed by their binary header seq. */
  incoming: Map<number, IncomingTransfer>;
  pumping: boolean;
  /** Title from the peer's `bcast-start`, used when their call arrives. */
  broadcastTitle: string;
  /** Guest side: watchdog waiting for the announced media call to land. */
  mediaWatchdog: ReturnType<typeof setTimeout> | null;
  /** Guest side: how many re-call requests we've sent for this broadcast. */
  mediaRetries: number;
  /** In-band relay negotiation with this peer, if any (one at a time). */
  relay: RelayState | null;
  /** Allocator for {@link RelayState.nid}. */
  nextNid: number;
}

interface Session {
  peer: Peer;
  role: SessionRole;
  /** Read once at session start; see the type's doc comment. */
  signalingMode: SignalingMode;
  roomId: string;
  roomKey: CryptoKey;
  displayName: string;
  hostPeerId: string;
  conns: Map<string, ConnState>;
  /** Outbound broadcast calls we placed (host). */
  calls: Map<string, MediaConnection>;
  /** Inbound broadcast call we answered (guest). */
  incomingCall: MediaConnection | null;
  /** The captureStream() result we are broadcasting (host). */
  localStream: MediaStream | null;
  destroyed: boolean;
}

/** The single live session. Null until the user opts in. */
let session: Session | null = null;

/** Remote ids locked out after repeated wrong passwords (this session only). */
const bannedPeers = new Map<string, number>();

let unloadHandler: (() => void) | null = null;

/* ── store shortcuts ───────────────────────────────────────── */
const store = () => useWebRTCStore.getState();
const chat = () => useChatStore.getState();
const log = (level: 'info' | 'warn' | 'danger', message: string) => store().logEvent(level, message);

/* ─────────────────────────────────────────────────────────────
 *  SESSION LIFECYCLE
 * ───────────────────────────────────────────────────────────── */

export interface StartSessionOptions {
  role: SessionRole;
  /** Digits only — namespaced into a real PeerJS id internally. */
  roomId: string;
  password: string;
  displayName: string;
  /**
   * Optional self-hosted PeerServer. Strongly recommended for anything
   * sensitive: the default is PeerJS's public broker, which learns your
   * room id and your IP. It never sees file bytes or the password.
   */
  signaling?: { host: string; port: number; path?: string; secure?: boolean };
  /**
   * How live broadcasts negotiate their media. Defaults to the store's
   * setting, which defaults to the in-band relay (works on any broker).
   */
  signalingMode?: SignalingMode;
  /** PeerJS console verbosity (0 silent … 3 all). Diagnostics only. */
  debug?: number;
}

/**
 * Boots PeerJS and claims (host) or dials (guest) the room. Resolves once
 * the signaling socket is open — peers arrive asynchronously afterwards.
 */
export async function startSession(opts: StartSessionOptions): Promise<void> {
  if (session) throw new Error('A P2P session is already running. Disconnect first.');

  assertSecureContext();

  const s = store();
  s.beginSession({
    role: opts.role,
    roomId: opts.roomId,
    password: opts.password,
    displayName: sanitizeDisplayName(opts.displayName),
  });

  /* PBKDF2 up front so the first joiner isn't kept waiting on it. */
  const roomKey = await deriveRoomKey(opts.roomId, opts.password);

  /* The dynamic import is the opt-in boundary: this is the first moment
   * PeerJS exists in the page at all. */
  const { Peer: PeerCtor } = await import('peerjs');

  const hostPeerId = peerIdForRoom(opts.roomId);
  /* A guest must NOT claim the room id — it takes a random one so two
   * guests can share a room without an id collision. */
  const localId = opts.role === 'host' ? hostPeerId : `${hostPeerId}-g${randomHex(8)}`;

  const peer = new PeerCtor(localId, {
    debug: opts.debug ?? 0,
    ...(opts.signaling
      ? {
          host: opts.signaling.host,
          port: opts.signaling.port,
          path: opts.signaling.path ?? '/',
          secure: opts.signaling.secure ?? true,
        }
      : {}),
  });

  const signalingMode = opts.signalingMode ?? s.signalingMode;

  session = {
    peer,
    role: opts.role,
    signalingMode,
    roomId: opts.roomId,
    roomKey,
    displayName: sanitizeDisplayName(opts.displayName),
    hostPeerId,
    conns: new Map(),
    calls: new Map(),
    incomingCall: null,
    localStream: null,
    destroyed: false,
  };

  bannedPeers.clear();
  registerRtcTeardown(destroySession);

  /* Best effort: a closed tab should not leave a room claimed on the broker. */
  unloadHandler = () => destroySession();
  window.addEventListener('pagehide', unloadHandler);

  attachPeerHandlers(peer, opts.role);

  await new Promise<void>((resolve, reject) => {
    const onOpen = (id: string) => {
      cleanup();
      store().sessionEstablished(id);
      log('info', `Local peer id: ${id}`);
      log('info', opts.role === 'host' ? `Room ${opts.roomId} opened.` : `Dialling room ${opts.roomId}…`);
      log(
        'info',
        signalingMode === 'default-relay'
          ? 'Live video mode: in-band relay (media signaling travels over the encrypted data channel).'
          : 'Live video mode: native PeerJS routing (media signaling travels through the signaling server).',
      );
      if (signalingMode === 'self-hosted-server' && !opts.signaling) {
        log(
          'warn',
          'Native routing is selected but no self-hosted signaling server is configured — ' +
            'the public broker does not relay media offers, so broadcasts will not reach viewers.',
        );
      }
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(new Error(friendlyPeerError(err, opts)));
    };
    const cleanup = () => {
      peer.off('open', onOpen);
      peer.off('error', onError);
    };
    peer.on('open', onOpen);
    peer.on('error', onError);
  }).catch((err) => {
    /* Never leave a half-built session lying around. */
    destroySession();
    throw err;
  });

  if (opts.role === 'guest') {
    /* Reaching the broker is not "connected" for a guest — that word is
     * reserved for a peer that has actually passed the handshake. */
    store().setStatus('connecting');
    dialHost();
  }
}

function attachPeerHandlers(peer: Peer, role: SessionRole): void {
  peer.on('connection', (conn) => {
    /*
     * Star topology. A guest has exactly one legitimate peer — the host it
     * dialled — so an unsolicited inbound connection is always either a
     * stranger who guessed the id or another guest probing. Drop it before
     * the handshake even starts.
     */
    if (role === 'guest') {
      log('warn', `Refused an unsolicited inbound connection (guests never accept connections).`);
      safeClose(conn);
      return;
    }
    if (bannedPeers.has(conn.peer)) {
      log('danger', `Blocked a locked-out peer (${shortId(conn.peer)}) from reconnecting.`);
      safeClose(conn);
      return;
    }
    if (session && session.conns.size >= MAX_PEERS) {
      log('warn', `Room full (${MAX_PEERS}) — refused ${shortId(conn.peer)}.`);
      safeClose(conn);
      return;
    }
    setupConnection(conn, 'host');
  });

  peer.on('call', (call) => {
    log('info', `Incoming media call from ${call.peer} (our id: ${peer.id}).`);
    const st = session?.conns.get(call.peer);
    /*
     * A media call from anyone who has not completed the password
     * handshake is rejected outright — otherwise a stranger who knows the
     * room id could push video into a viewer's screen.
     */
    if (!st?.authenticated) {
      log('danger', `Rejected an incoming stream from an unauthenticated peer (${shortId(call.peer)}).`);
      try {
        call.close();
      } catch {
        /* ignore */
      }
      return;
    }
    acceptBroadcastCall(call, st);
  });

  peer.on('error', (err: Error & { type?: string }) => {
    const message = friendlyPeerError(err);
    store().setError(message);
    log('warn', message);
    /* A dead room id or a broken socket means the session can't function. */
    if (err.type === 'peer-unavailable' || err.type === 'unavailable-id') {
      store().disconnectAll(message);
    }
  });

  peer.on('disconnected', () => {
    if (!session || session.destroyed) return;
    log('warn', 'Lost the signaling server. Existing peer connections are unaffected.');
    try {
      peer.reconnect();
    } catch {
      /* ignore — nothing more we can do */
    }
  });

  peer.on('close', () => {
    if (session && !session.destroyed) store().disconnectAll('Signaling connection closed.');
  });
}

function dialHost(): void {
  if (!session) return;
  const conn = session.peer.connect(session.hostPeerId, {
    reliable: true,
    /* 'raw' hands strings and ArrayBuffers straight through, so we own the
     * framing and the chunk size instead of PeerJS's binary packer. */
    serialization: 'raw',
    metadata: { v: PROTOCOL_VERSION },
  });
  setupConnection(conn, 'guest');
}

/**
 * Tears down every P2P resource this tab holds. Idempotent, never throws.
 * Called by the store's kill switch — do not call directly from the UI, go
 * through `useWebRTCStore.getState().disconnectAll()` so the state is wiped
 * in the same breath.
 */
export function destroySession(): void {
  const s = session;
  session = null;
  registerRtcTeardown(null);

  if (unloadHandler) {
    window.removeEventListener('pagehide', unloadHandler);
    unloadHandler = null;
  }
  if (!s) return;
  s.destroyed = true;

  /* 1 ─ Data channels: cancel transfers, say goodbye, close. */
  for (const st of s.conns.values()) {
    if (st.authTimer) clearTimeout(st.authTimer);
    if (st.mediaWatchdog) clearTimeout(st.mediaWatchdog);
    /* Relayed media rides its own RTCPeerConnection — closing the data
     * channel does not close it, so it has to be closed by hand. */
    if (st.relay) {
      const { pc } = st.relay;
      st.relay = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      /* Receiver side: the decoders are ours to stop. On the sender side
       * these are the shared capture tracks, stopped once in step 3. */
      for (const receiver of pc.getReceivers()) {
        try {
          receiver.track?.stop();
        } catch {
          /* ignore */
        }
      }
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
    for (const out of st.outgoing.values()) out.cancelled = true;
    /* Drop half-received buffers so the bytes are collectable immediately. */
    for (const inc of st.incoming.values()) inc.parts.length = 0;
    st.incoming.clear();
    st.outgoing.clear();
    try {
      if (st.conn.open) st.conn.send(encodeMessage({ t: 'bye' }));
    } catch {
      /* ignore */
    }
    safeClose(st.conn);
  }
  s.conns.clear();

  /* 2 ─ Media connections, both directions. */
  for (const call of s.calls.values()) {
    try {
      call.close();
    } catch {
      /* ignore */
    }
  }
  s.calls.clear();
  if (s.incomingCall) {
    try {
      s.incomingCall.close();
    } catch {
      /* ignore */
    }
    s.incomingCall = null;
  }

  /* 3 ─ Stop the tracks we captured from the local player. This detaches
   *     the encoder; the user's own playback is untouched. */
  if (s.localStream) {
    for (const track of s.localStream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    s.localStream = null;
  }

  /* 4 ─ Kill the signaling socket and release the room id. */
  try {
    s.peer.destroy();
  } catch {
    /* ignore */
  }

  /* 5 ─ Forget the derived room key. */
  clearRoomKeyCache();
  bannedPeers.clear();
}

export const isSessionLive = () => session !== null && !session.destroyed;

/* ─────────────────────────────────────────────────────────────
 *  CONNECTION SETUP & AUTH HANDSHAKE
 * ─────────────────────────────────────────────────────────────
 *  host                                   guest
 *   │  ── hello{nonceH} ──────────────────▶ │
 *   │  ◀── auth{nonceG, proofG, name} ───── │   proofG = HMAC(k, "guest->host|nonceH|nonceG")
 *   │  ── auth-ok{proofH, name} ──────────▶ │   proofH = HMAC(k, "host->guest|nonceH|nonceG")
 *   │                                       │
 *  Either side closes the moment a proof fails to verify. Until both
 *  proofs verify, the connection may carry nothing but these messages.
 * ───────────────────────────────────────────────────────────── */

function setupConnection(conn: DataConnection, role: SessionRole): void {
  if (!session) return;

  const st: ConnState = {
    conn,
    role,
    authenticated: false,
    name: 'Peer',
    hostNonce: '',
    guestNonce: '',
    authTimer: null,
    nextSeq: 1,
    outgoing: new Map(),
    incoming: new Map(),
    pumping: false,
    broadcastTitle: 'Live broadcast',
    mediaWatchdog: null,
    mediaRetries: 0,
    relay: null,
    nextNid: 1,
  };
  session.conns.set(conn.peer, st);

  store().upsertPeer({
    id: conn.peer,
    name: role === 'host' ? 'Joining…' : 'Room host',
    authenticated: false,
    joinedAt: Date.now(),
    failedAttempts: 0,
    direct: true,
  });

  /* A peer that stalls mid-handshake is a peer that never authenticates. */
  st.authTimer = setTimeout(() => {
    if (!st.authenticated) {
      log('danger', `Handshake timed out for ${shortId(conn.peer)} — connection dropped.`);
      dropConnection(st, 'Handshake timed out');
    }
  }, AUTH_TIMEOUT_MS);

  conn.on('open', () => {
    if (!session) return;
    if (role === 'host') {
      st.hostNonce = makeNonce();
      send(st, { t: 'hello', v: PROTOCOL_VERSION, nonce: st.hostNonce });
    }
    /* The guest stays silent until it receives the host's challenge. */
  });

  conn.on('data', (data: unknown) => {
    try {
      handleData(st, data);
    } catch (err) {
      log('danger', `Protocol error from ${shortId(conn.peer)} — connection dropped.`);
      console.error('[LocalTube P2P]', err);
      dropConnection(st, 'Protocol error');
    }
  });

  conn.on('close', () => handleConnectionClosed(st));

  conn.on('error', (err) => {
    log('warn', `Connection error with ${shortId(conn.peer)}: ${err.message}`);
    handleConnectionClosed(st);
  });
}

function handleData(st: ConnState, data: unknown): void {
  if (!session) return;

  /* ── Binary frame: a file chunk. Only ever legal post-auth. ── */
  if (data instanceof ArrayBuffer) {
    if (!st.authenticated) throw new Error('Binary data before authentication');
    handleChunk(st, data);
    return;
  }
  if (ArrayBuffer.isView(data)) {
    if (!st.authenticated) throw new Error('Binary data before authentication');
    /* Copy out of the view's backing store (which may be shared) so the
     * chunk we keep is a plain, exclusively-owned ArrayBuffer. */
    const view = data as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer as ArrayBufferLike, view.byteOffset, view.byteLength));
    handleChunk(st, copy.buffer);
    return;
  }

  /* ── Control frame ── */
  const msg = decodeMessage(data);
  if (!msg) throw new Error('Undecodable frame');

  /** Set by the bcast-start branch; declared here for the switch scope. */
  let alreadyTracking = false;

  /*
   * THE GATE. An unauthenticated peer's vocabulary is limited to the
   * handshake itself; anything else is treated as hostile and severs the
   * connection immediately.
   */
  if (!st.authenticated && !isPreAuthMessage(msg.t)) {
    throw new Error(`Message "${msg.t}" before authentication`);
  }

  switch (msg.t) {
    case 'hello':
      onHello(st, msg);
      break;
    case 'auth':
      onAuth(st, msg);
      break;
    case 'auth-ok':
      onAuthOk(st, msg);
      break;
    case 'auth-fail':
      log('danger', `Room rejected us: ${sanitizeDisplayName(msg.reason)}`);
      store().setError('Wrong room password — the host rejected this browser.');
      dropConnection(st, 'Rejected by host');
      break;
    case 'file-offer':
      onFileOffer(st, msg);
      break;
    case 'file-accept':
      onFileAccept(st, msg.id);
      break;
    case 'file-decline':
      onFileDecline(st, msg.id);
      break;
    case 'file-done':
      onFileDone(st, msg.id, msg.size);
      break;
    case 'file-abort':
      onFileAbort(st, msg.id, msg.reason);
      break;
    case 'bcast-start':
      /* Announcement only — the actual media arrives as a separate call,
       * which is still checked against the authenticated peer set. This
       * opens the lobby immediately so the viewer sees "connecting to
       * stream…" rather than nothing while ICE negotiates. */
      st.broadcastTitle = sanitizeDisplayName(msg.title) || 'Live broadcast';
      alreadyTracking = store().broadcastMeta?.peerId === st.conn.peer;
      store().announceIncomingBroadcast({
        peerId: st.conn.peer,
        peerName: st.name,
        title: st.broadcastTitle,
        startedAt: Date.now(),
      });
      log('info', `${st.name} started broadcasting "${st.broadcastTitle}".`);
      /* Each re-call re-announces, so only reset the retry budget for a
       * genuinely new broadcast — otherwise the watchdog loops forever. */
      if (!alreadyTracking) st.mediaRetries = 0;
      armMediaWatchdog(st);
      break;
    case 'bcast-request':
      /* A viewer never got our offer (broker dropped it). Call them again. */
      onBroadcastRequest(st, msg.attempt);
      break;
    case 'bcast-stop':
      clearMediaWatchdog(st);
      closeRelay(st);
      endIncomingBroadcast(st.conn.peer);
      break;
    case 'roster':
      onRoster(st, msg);
      break;
    /* ── chat ── */
    case 'chat':
      onChatText(st, msg);
      break;
    case 'chat-file':
      onChatFileOffer(st, msg);
      break;
    /* ── in-band media signaling (default-relay mode) ── */
    case 'media-offer':
      onMediaOffer(st, msg);
      break;
    case 'media-answer':
      onMediaAnswer(st, msg);
      break;
    case 'media-ice':
      onMediaIce(st, msg);
      break;
    case 'bye':
      dropConnection(st, 'Peer left');
      break;
    default:
      throw new Error('Unknown message type');
  }
}

/* ── guest side ── */
function onHello(st: ConnState, msg: Extract<WireMessage, { t: 'hello' }>): void {
  if (st.role !== 'guest') throw new Error('hello from a guest');
  if (msg.v !== PROTOCOL_VERSION) {
    store().setError(`Version mismatch: the host runs protocol v${msg.v}, this build speaks v${PROTOCOL_VERSION}.`);
    dropConnection(st, 'Protocol version mismatch');
    return;
  }
  if (!isValidNonce(msg.nonce)) throw new Error('Malformed challenge');

  st.hostNonce = msg.nonce;
  st.guestNonce = makeNonce();

  void (async () => {
    if (!session) return;
    const proof = await computeProof(session.roomKey, 'guest->host', st.hostNonce, st.guestNonce);
    send(st, {
      t: 'auth',
      v: PROTOCOL_VERSION,
      nonce: st.guestNonce,
      proof,
      name: session.displayName,
    });
  })();
}

/* ── host side ── */
function onAuth(st: ConnState, msg: Extract<WireMessage, { t: 'auth' }>): void {
  if (st.role !== 'host') throw new Error('auth from a host');
  if (st.authenticated) throw new Error('Duplicate auth');
  if (msg.v !== PROTOCOL_VERSION) {
    sendAuthFail(st, 'Protocol version mismatch');
    return;
  }
  if (!isValidNonce(msg.nonce) || typeof msg.proof !== 'string') throw new Error('Malformed auth');

  st.guestNonce = msg.nonce;

  void (async () => {
    if (!session) return;
    const expected = await computeProof(session.roomKey, 'guest->host', st.hostNonce, st.guestNonce);

    /* Constant-time: never leak how much of the proof was correct. */
    if (!timingSafeEqual(expected, msg.proof)) {
      const attempts = (bannedPeers.get(st.conn.peer) ?? 0) + 1;
      bannedPeers.set(st.conn.peer, attempts);
      store().patchPeer(st.conn.peer, { failedAttempts: attempts });
      log(
        'danger',
        `Wrong password from ${shortId(st.conn.peer)} (attempt ${attempts}/${MAX_AUTH_ATTEMPTS}) — connection dropped.`,
      );
      if (attempts >= MAX_AUTH_ATTEMPTS) {
        log('danger', `${shortId(st.conn.peer)} is locked out for this session.`);
      }
      sendAuthFail(st, 'Authentication failed');
      return;
    }

    /* Proven. Now prove ourselves back so the guest knows we're the real room. */
    const ours = await computeProof(session.roomKey, 'host->guest', st.hostNonce, st.guestNonce);
    st.name = sanitizeDisplayName(msg.name);
    markAuthenticated(st);
    send(st, { t: 'auth-ok', proof: ours, name: session.displayName });

    /*
     * Strictly AFTER auth-ok. The joiner does not consider itself
     * authenticated until it has verified our proof, so anything we send
     * before that lands on its pre-auth gate and gets the connection
     * dropped as a protocol violation — by our own rule, correctly.
     */
    publishRoster();
  })();
}

/* ── guest side ── */
function onAuthOk(st: ConnState, msg: Extract<WireMessage, { t: 'auth-ok' }>): void {
  if (st.role !== 'guest') throw new Error('auth-ok from a guest');
  if (st.authenticated) throw new Error('Duplicate auth-ok');
  if (typeof msg.proof !== 'string') throw new Error('Malformed auth-ok');

  void (async () => {
    if (!session) return;
    const expected = await computeProof(session.roomKey, 'host->guest', st.hostNonce, st.guestNonce);
    if (!timingSafeEqual(expected, msg.proof)) {
      /*
       * We knew the password but the other side could not prove it knows it
       * too. Something is squatting this room id — get off it immediately
       * and tell the user plainly.
       */
      log('danger', 'The room could not prove it knows the password — possible impostor. Disconnected.');
      store().setError(
        'This room failed verification: it does not know the password you entered. Someone may be squatting the room ID. No data was sent.',
      );
      dropConnection(st, 'Host failed verification');
      store().disconnectAll('Aborted: room failed verification');
      return;
    }
    st.name = sanitizeDisplayName(msg.name);
    markAuthenticated(st);
  })();
}

function markAuthenticated(st: ConnState): void {
  st.authenticated = true;
  if (st.authTimer) {
    clearTimeout(st.authTimer);
    st.authTimer = null;
  }
  store().upsertPeer({
    id: st.conn.peer,
    name: st.name,
    authenticated: true,
    joinedAt: Date.now(),
    failedAttempts: 0,
    direct: true,
  });
  bannedPeers.delete(st.conn.peer);
  store().setStatus(store().broadcastTitle ? 'broadcasting' : 'connected');
  log('info', `${st.name} authenticated (${shortId(st.conn.peer)}).`);
  chat().pushSystem(`${st.name} joined the room.`);

  /* A guest's whole purpose is to wait for the host, so drop them straight
   * into the room instead of leaving them on an empty screen. */
  if (session?.role === 'guest') store().setLobbyOpen(true);

  /* Late joiner during a live broadcast — bring them in. */
  if (session?.localStream && store().broadcastTitle) {
    callPeer(st, store().broadcastTitle ?? 'Live');
  }
}

function sendAuthFail(st: ConnState, reason: string): void {
  try {
    if (st.conn.open) st.conn.send(encodeMessage({ t: 'auth-fail', reason }));
  } catch {
    /* ignore */
  }
  /* Requirement: authentication failure drops the connection immediately.
   * A microtask of slack lets the reason frame reach the wire first. */
  queueMicrotask(() => dropConnection(st, reason));
}

function dropConnection(st: ConnState, reason: string): void {
  if (st.authTimer) {
    clearTimeout(st.authTimer);
    st.authTimer = null;
  }
  for (const out of st.outgoing.values()) out.cancelled = true;
  safeClose(st.conn);
  handleConnectionClosed(st, reason);
}

function handleConnectionClosed(st: ConnState, reason?: string): void {
  if (!session) return;
  if (!session.conns.has(st.conn.peer)) return; // already reaped
  session.conns.delete(st.conn.peer);

  if (st.authTimer) clearTimeout(st.authTimer);
  clearMediaWatchdog(st);
  closeRelay(st);

  /* Fail every transfer that was still moving, in both directions. */
  const transfers = store().transferProgress;
  for (const t of Object.values(transfers)) {
    if (t.peerId !== st.conn.peer) continue;
    if (t.status === 'transferring' || t.status === 'awaiting-consent') {
      store().patchTransfer(t.id, { status: 'failed', error: reason ?? 'Peer disconnected' });
    }
  }
  /* Chat attachments that were still moving in either direction die with
   * the connection — mark them so the bubble stops spinning forever. */
  for (const inc of st.incoming.values()) {
    if (inc.kind === 'chat' && inc.chatDisplay) {
      chat().patchAttachment(inc.id, { error: 'Sender disconnected' });
    }
    inc.parts.length = 0;
  }
  for (const out of st.outgoing.values()) {
    if (out.kind === 'chat' && !out.silent) {
      chat().patchAttachment(out.id, { error: 'Peer disconnected' });
    }
  }
  st.incoming.clear();
  st.outgoing.clear();

  if (st.authenticated) {
    chat().pushSystem(`${st.name} left the room.`);
    chat().dropPeerThread(st.conn.peer);
  }

  /* Hang up any media we had with them. */
  const call = session.calls.get(st.conn.peer);
  if (call) {
    try {
      call.close();
    } catch {
      /* ignore */
    }
    session.calls.delete(st.conn.peer);
  }
  endIncomingBroadcast(st.conn.peer);

  store().removePeer(st.conn.peer);
  if (st.authenticated) {
    log('info', `${st.name} left${reason ? ` (${reason})` : ''}.`);
    publishRoster();
  }

  /* A guest whose only connection is the host now has nothing left. */
  if (session.role === 'guest' && session.conns.size === 0) {
    store().disconnectAll(reason ?? 'Disconnected from the room');
  }
}

/* ─────────────────────────────────────────────────────────────
 *  FILE PUSH — SENDER
 * ─────────────────────────────────────────────────────────────
 *  Always initiated locally. `peerIds` comes from checkboxes the user
 *  ticked in ShareModal; `files` are File objects the UI resolved from
 *  handles the user picked. Nothing on the wire can reach this function.
 * ───────────────────────────────────────────────────────────── */

export function sendFileToPeers(file: File, peerIds: string[]): void {
  if (!session) throw new Error('No P2P session is running.');

  for (const peerId of peerIds) {
    const st = session.conns.get(peerId);
    if (!st || !st.authenticated) {
      log('warn', `Skipped ${shortId(peerId)} — not an authenticated peer.`);
      continue;
    }

    const id = randomHex(16);
    const seq = st.nextSeq++;
    const chunkSize = negotiateChunkSize(st.conn.peerConnection);
    const chunks = file.size === 0 ? 0 : Math.ceil(file.size / chunkSize);
    const filename = sanitizeFilename(file.name);
    const { mediaType, playable } = safeMimeFor(filename);

    const transfer: OutgoingTransfer = {
      id,
      seq,
      kind: 'library',
      file,
      filename,
      size: file.size,
      chunkSize,
      chunks,
      sent: 0,
      cancelled: false,
    };
    st.outgoing.set(id, transfer);

    store().upsertTransfer({
      id,
      peerId,
      peerName: st.name,
      direction: 'outgoing',
      filename,
      size: file.size,
      transferred: 0,
      status: 'awaiting-consent',
      startedAt: Date.now(),
      mediaType,
      playable,
    });

    send(st, {
      t: 'file-offer',
      id,
      seq,
      name: filename,
      size: file.size,
      mediaType,
      chunkSize,
      chunks,
    });
  }
}

/** Receiver said yes — start pumping bytes. */
function onFileAccept(st: ConnState, id: string): void {
  const transfer = st.outgoing.get(id);
  if (!transfer) return;
  store().patchTransfer(id, { status: 'transferring' });
  void pump(st, transfer);
}

function onFileDecline(st: ConnState, id: string): void {
  const transfer = st.outgoing.get(id);
  if (!transfer) return;
  transfer.cancelled = true;
  st.outgoing.delete(id);
  store().patchTransfer(id, { status: 'declined', error: 'Declined by the recipient' });
  log('info', `${st.name} declined "${transfer.filename}".`);
}

/**
 * Streams one file. The source is read lazily a slice at a time via
 * File.slice(), so a 4 GB video is never resident in memory — only one
 * chunk is, and only while it's in flight.
 */
async function pump(st: ConnState, transfer: OutgoingTransfer): Promise<void> {
  /* One transfer at a time per connection keeps the chunk stream
   * unambiguous and stops N parallel files starving each other. */
  while (st.pumping) {
    await new Promise((r) => setTimeout(r, 50));
    if (transfer.cancelled || !session) return;
  }
  st.pumping = true;

  /* A silent (relayed) transfer shares its id with a message we may also be
   * displaying as *received* — writing progress from it would rewind the
   * bar on an attachment that already finished. */
  const commit = (bytes: number) => {
    if (transfer.silent) return;
    if (transfer.kind === 'chat') {
      chat().patchAttachment(transfer.id, { progress: transfer.size ? bytes / transfer.size : 1 });
    } else {
      store().patchTransfer(transfer.id, { transferred: bytes });
    }
  };

  let lastCommit = 0;
  try {
    for (let index = 0; index < transfer.chunks; index++) {
      if (transfer.cancelled || !session || !st.conn.open) {
        throw new Error(transfer.cancelled ? 'Cancelled' : 'Connection closed');
      }

      const start = index * transfer.chunkSize;
      const slice = transfer.file.slice(start, Math.min(start + transfer.chunkSize, transfer.size));
      const buf = await slice.arrayBuffer();

      await waitForDrain(st.conn);
      if (transfer.cancelled || !st.conn.open) throw new Error('Cancelled');

      st.conn.send(frameChunk(transfer.seq, index, buf));
      transfer.sent += buf.byteLength;

      const now = Date.now();
      if (now - lastCommit > PROGRESS_INTERVAL_MS || index === transfer.chunks - 1) {
        lastCommit = now;
        commit(transfer.sent);
      }
    }

    send(st, { t: 'file-done', id: transfer.id, size: transfer.size });
    if (transfer.kind === 'chat') {
      if (!transfer.silent) chat().patchAttachment(transfer.id, { progress: 1 });
    } else {
      store().patchTransfer(transfer.id, { transferred: transfer.size, status: 'completed' });
    }
    log('info', `Sent "${transfer.filename}" to ${st.name}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transfer failed';
    if (transfer.kind === 'chat') {
      if (!transfer.silent) chat().patchAttachment(transfer.id, { error: message });
    } else {
      store().patchTransfer(transfer.id, {
        status: transfer.cancelled ? 'cancelled' : 'failed',
        error: message,
      });
    }
    if (st.conn.open) {
      send(st, { t: 'file-abort', id: transfer.id, reason: message });
    }
  } finally {
    st.outgoing.delete(transfer.id);
    st.pumping = false;
  }
}

/**
 * Blocks while the send buffer is full. Without this, a fast disk and a
 * slow link make the sender's memory grow without bound — the classic
 * DataChannel footgun.
 */
function waitForDrain(conn: DataConnection): Promise<void> {
  const dc = conn.dataChannel;
  if (!dc || dc.bufferedAmount < SEND_HIGH_WATER) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      dc.removeEventListener('bufferedamountlow', finish);
      clearTimeout(timer);
      resolve();
    };
    /* Safety net: if the event never fires (closed channel), don't hang. */
    const timer = setTimeout(finish, DRAIN_TIMEOUT_MS);
    dc.bufferedAmountLowThreshold = SEND_LOW_WATER;
    dc.addEventListener('bufferedamountlow', finish);
  });
}

/** User-initiated cancel, from either side of a transfer. */
export function cancelTransfer(id: string): void {
  if (!session) return;
  for (const st of session.conns.values()) {
    const out = st.outgoing.get(id);
    if (out) {
      out.cancelled = true;
      store().patchTransfer(id, { status: 'cancelled', error: 'Cancelled' });
      return;
    }
    for (const [seq, inc] of st.incoming) {
      if (inc.id !== id) continue;
      inc.parts.length = 0;
      st.incoming.delete(seq);
      send(st, { t: 'file-abort', id, reason: 'Cancelled by recipient' });
      store().patchTransfer(id, { status: 'cancelled', error: 'Cancelled' });
      return;
    }
  }
}

/* ─────────────────────────────────────────────────────────────
 *  FILE PUSH — RECEIVER
 * ─────────────────────────────────────────────────────────────
 *  Receiving is opt-in too: an offer only becomes a transfer once the
 *  local user clicks Accept. Until then not one byte is buffered.
 * ───────────────────────────────────────────────────────────── */

function onFileOffer(st: ConnState, msg: Extract<WireMessage, { t: 'file-offer' }>): void {
  const problem = validateFileOffer(msg);
  if (problem) {
    log('warn', `Rejected a malformed offer from ${st.name}: ${problem}`);
    send(st, { t: 'file-decline', id: typeof msg.id === 'string' ? msg.id : '', reason: problem });
    return;
  }
  if (st.incoming.has(msg.seq)) {
    throw new Error('Duplicate transfer sequence');
  }

  /* Filename and MIME are re-derived locally — the peer's claims about
   * either are ignored (see safeMimeFor in p2pProtocol). */
  const filename = sanitizeFilename(msg.name);
  const { mime, mediaType, playable } = safeMimeFor(filename);

  st.incoming.set(msg.seq, {
    id: msg.id,
    seq: msg.seq,
    kind: 'library',
    filename,
    size: msg.size,
    chunkSize: msg.chunkSize,
    chunks: msg.chunks,
    received: 0,
    nextIndex: 0,
    accepted: false,
    parts: [],
    mime,
    mediaType,
    playable,
    lastCommit: 0,
  });

  store().upsertTransfer({
    id: msg.id,
    peerId: st.conn.peer,
    peerName: st.name,
    direction: 'incoming',
    filename,
    size: msg.size,
    transferred: 0,
    status: 'awaiting-consent',
    startedAt: Date.now(),
    mediaType,
    playable,
  });
  log('info', `${st.name} offered "${filename}".`);
}

export function acceptIncomingFile(id: string): void {
  if (!session) return;
  for (const st of session.conns.values()) {
    for (const inc of st.incoming.values()) {
      if (inc.id !== id || inc.accepted) continue;
      inc.accepted = true;
      store().patchTransfer(id, { status: 'transferring' });
      send(st, { t: 'file-accept', id });
      return;
    }
  }
}

export function declineIncomingFile(id: string): void {
  if (!session) return;
  for (const st of session.conns.values()) {
    for (const [seq, inc] of st.incoming) {
      if (inc.id !== id) continue;
      inc.parts.length = 0;
      st.incoming.delete(seq);
      send(st, { t: 'file-decline', id, reason: 'Declined' });
      store().patchTransfer(id, { status: 'declined', error: 'You declined this file' });
      return;
    }
  }
}

function handleChunk(st: ConnState, buf: ArrayBuffer): void {
  const parsed = parseChunk(buf);
  if (!parsed) throw new Error('Malformed chunk frame');

  const inc = st.incoming.get(parsed.seq);
  /* A chunk for an unknown, declined or already-finished transfer is not
   * something a well-behaved peer sends. */
  if (!inc) throw new Error('Chunk for an unknown transfer');
  if (!inc.accepted) throw new Error('Chunk before the transfer was accepted');
  /* Ordered+reliable SCTP guarantees sequence; verifying it anyway means a
   * misbehaving peer can't scramble the reassembly. */
  if (parsed.index !== inc.nextIndex) throw new Error('Out-of-order chunk');
  if (inc.received + parsed.payload.byteLength > inc.size) throw new Error('Transfer exceeded its declared size');

  inc.parts.push(parsed.payload);
  inc.received += parsed.payload.byteLength;
  inc.nextIndex++;

  const now = Date.now();
  if (now - inc.lastCommit > PROGRESS_INTERVAL_MS || inc.nextIndex === inc.chunks) {
    inc.lastCommit = now;
    if (inc.kind === 'chat') {
      chat().patchAttachment(inc.id, { progress: inc.size ? inc.received / inc.size : 1 });
    } else {
      store().patchTransfer(inc.id, { transferred: inc.received });
    }
  }
}

function onFileDone(st: ConnState, id: string, claimedSize: number): void {
  for (const [seq, inc] of st.incoming) {
    if (inc.id !== id) continue;
    st.incoming.delete(seq);

    /* Cross-check what arrived against what was promised, twice over. */
    if (inc.received !== inc.size || inc.received !== claimedSize || inc.nextIndex !== inc.chunks) {
      inc.parts.length = 0;
      const problem = `Incomplete transfer (${inc.received} of ${inc.size} bytes)`;
      if (inc.kind === 'chat') {
        chat().patchAttachment(id, { error: 'Transfer was incomplete' });
      } else {
        store().patchTransfer(id, { status: 'failed', error: problem });
      }
      log('warn', `"${inc.filename}" from ${st.name} was incomplete and was discarded.`);
      return;
    }

    /* MIME is ours, not theirs — a peer can never get a text/html blob URL
     * minted in this origin. */
    const blob = new Blob(inc.parts, { type: inc.mime });
    inc.parts.length = 0; // release the chunk array; the Blob owns the bytes now
    const blobUrl = URL.createObjectURL(blob);

    if (inc.kind === 'chat') {
      if (inc.chatDisplay) {
        chat().patchAttachment(id, { blobUrl, progress: 1 });
        log('info', `Received chat attachment "${inc.filename}" from ${inc.chatFromName ?? st.name}.`);
      } else {
        /* Pure relay hop — we hold the bytes only long enough to forward
         * them, and never mint a URL we would then have to remember to
         * revoke. Dropping the reference here is what makes that true. */
        URL.revokeObjectURL(blobUrl);
      }
      /* Store-and-forward: the room only reaches other guests through us. */
      relayChatAttachment(st, inc, blob);
      return;
    }

    store().patchTransfer(id, {
      status: 'completed',
      transferred: inc.size,
      blobUrl,
    });
    log('info', `Received "${inc.filename}" from ${st.name}.`);
    return;
  }
}

function onFileAbort(st: ConnState, id: string, reason: string): void {
  let kind: TransferKind = 'library';
  for (const [seq, inc] of st.incoming) {
    if (inc.id !== id) continue;
    kind = inc.kind;
    inc.parts.length = 0;
    st.incoming.delete(seq);
  }
  const out = st.outgoing.get(id);
  if (out) {
    kind = out.kind;
    out.cancelled = true;
    st.outgoing.delete(id);
  }
  const message = sanitizeDisplayName(reason);
  if (kind === 'chat') {
    chat().patchAttachment(id, { error: message });
    return;
  }
  store().patchTransfer(id, { status: 'failed', error: message });
}

/* ─────────────────────────────────────────────────────────────
 *  CHAT
 * ─────────────────────────────────────────────────────────────
 *  The room is a star, so the host is the only path between guests: it
 *  relays room messages and guest→guest whispers. Two rules make that
 *  safe, and both are enforced here rather than trusted from the wire:
 *
 *   • ORIGIN IS STAMPED. When the host relays, it replaces `from` with the
 *     identity of the connection the bytes actually arrived on. A guest
 *     cannot claim to be another guest, or to be the host.
 *   • WHISPERS ARE NOT FANNED OUT. A message addressed to one peer is
 *     forwarded to exactly that connection, or dropped.
 *
 *  Attachments are store-and-forward: the host receives the whole file
 *  (bounded by CHAT_MAX_FILE_BYTES) and re-sends it. Nothing is written to
 *  disk at any hop — the bytes exist as a Blob in the tab's heap and die
 *  with it. See the header of useChatStore for the persistence contract.
 * ───────────────────────────────────────────────────────────── */

const localPeerId = () => session?.peer.id ?? '';

/* ── roster (host → guests) ────────────────────────────────── */

/**
 * Tells every guest who else is in the room, so they can open a whisper
 * thread with someone they have no connection to. Called whenever
 * membership changes; cheap enough at MAX_PEERS that diffing isn't worth it.
 */
function publishRoster(): void {
  if (!session || session.role !== 'host') return;
  const authed = [...session.conns.values()].filter((c) => c.authenticated);

  for (const st of authed) {
    /* Each guest gets everyone *except itself*, plus the host. */
    const peers = [
      { id: localPeerId(), name: session.displayName },
      ...authed.filter((o) => o !== st).map((o) => ({ id: o.conn.peer, name: o.name })),
    ];
    send(st, { t: 'roster', peers });
  }
}

function onRoster(st: ConnState, msg: Extract<WireMessage, { t: 'roster' }>): void {
  /* Only the host publishes membership. A guest claiming otherwise is
   * trying to inject peers into our list. */
  if (st.role !== 'guest') throw new Error('roster from a non-host');
  const problem = validateRoster(msg);
  if (problem) throw new Error(problem);

  store().applyRoster(
    msg.peers
      /* The host is already in our list as a direct peer. */
      .filter((p) => p.id !== localPeerId() && p.id !== st.conn.peer)
      .map((p) => ({ id: p.id, name: sanitizeDisplayName(p.name) })),
  );
}

/** The connections a locally-composed message should be handed to. */
function chatRoute(target: ChatThread): ConnState[] {
  if (!session) return [];
  const authed = [...session.conns.values()].filter((c) => c.authenticated);
  /* A guest has exactly one connection; the host fans out from there. */
  if (session.role === 'guest') return authed;
  if (target === CHAT_ROOM_TARGET) return authed;
  const one = session.conns.get(target);
  return one?.authenticated ? [one] : [];
}

/** Which tab a message belongs in — always the *other* participant. */
const threadFor = (target: ChatThread, otherId: string): ChatThread =>
  target === CHAT_ROOM_TARGET ? CHAT_ROOM_TARGET : otherId;

export function sendChatMessage(text: string, target: ChatThread): void {
  if (!session) throw new Error('No P2P session is running.');
  const clean = sanitizeChatText(text);
  if (!clean) return;

  const targets = chatRoute(target);
  if (targets.length === 0) {
    chat().pushSystem(
      target === CHAT_ROOM_TARGET
        ? 'Nobody is in the room yet — message not sent.'
        : 'That peer is no longer connected — message not sent.',
      target,
    );
    return;
  }

  const id = newMessageId();
  for (const st of targets) send(st, { t: 'chat', id, to: target, text: clean });

  chat().addMessage({
    id,
    senderId: LOCAL_SENDER_ID,
    senderName: store().displayName,
    targetPeerId: target,
    threadId: target,
    mine: true,
    text: clean,
    timestamp: Date.now(),
  });
}

/* ── inbound text ──────────────────────────────────────────── */

function onChatText(st: ConnState, msg: Extract<WireMessage, { t: 'chat' }>): void {
  if (!session) return;
  const problem = validateChatText(msg);
  if (problem) throw new Error(problem);

  const text = sanitizeChatText(msg.text);
  if (!text) return;

  /* ── We are the host: this arrived from a guest. ── */
  if (st.role === 'host') {
    /* Their claimed identity is discarded — we know who they are. */
    const from = st.conn.peer;
    const fromName = st.name;

    if (msg.to === CHAT_ROOM_TARGET) {
      deliverChatText(msg.id, from, fromName, CHAT_ROOM_TARGET, CHAT_ROOM_TARGET, text);
      for (const other of session.conns.values()) {
        if (other === st || !other.authenticated) continue;
        send(other, { t: 'chat', id: msg.id, to: CHAT_ROOM_TARGET, text, from, fromName });
      }
      return;
    }

    if (msg.to === localPeerId()) {
      deliverChatText(msg.id, from, fromName, msg.to, from, text);
      return;
    }

    /* A whisper for someone else: exactly one hop, no copy for us. */
    const target = session.conns.get(msg.to);
    if (!target?.authenticated) return;
    send(target, { t: 'chat', id: msg.id, to: msg.to, text, from, fromName });
    return;
  }

  /* ── We are a guest: this arrived from the host, which we authenticated,
   *    so its stamp is the thing we trust. ── */
  if (msg.to !== CHAT_ROOM_TARGET && msg.to !== localPeerId()) return; // misrouted
  const from = typeof msg.from === 'string' && msg.from ? msg.from : st.conn.peer;
  const fromName = msg.fromName ? sanitizeDisplayName(msg.fromName) : st.name;
  deliverChatText(msg.id, from, fromName, msg.to, threadFor(msg.to, from), text);
}

function deliverChatText(
  id: string,
  senderId: string,
  senderName: string,
  targetPeerId: ChatThread,
  threadId: ChatThread,
  text: string,
): void {
  chat().addMessage({
    id,
    senderId,
    senderName,
    targetPeerId,
    threadId,
    mine: false,
    text,
    timestamp: Date.now(),
  });
}

/* ── attachments ───────────────────────────────────────────── */

export function sendChatAttachment(file: File, target: ChatThread): void {
  if (!session) throw new Error('No P2P session is running.');
  if (file.size > CHAT_MAX_FILE_BYTES) {
    throw new Error(
      `Attachments are capped at ${Math.floor(CHAT_MAX_FILE_BYTES / (1024 * 1024))} MB. ` +
        `Use "Send files" for anything larger.`,
    );
  }

  const targets = chatRoute(target);
  if (targets.length === 0) throw new Error('Nobody to send this to.');

  const id = newMessageId();
  const filename = sanitizeFilename(file.name);
  const { mime, mediaType } = safeMimeFor(filename);

  /* Our own copy renders immediately from the local File. Revoked by
   * clearAllChat / ring-buffer eviction like any other attachment. */
  chat().addMessage({
    id,
    senderId: LOCAL_SENDER_ID,
    senderName: store().displayName,
    targetPeerId: target,
    threadId: target,
    mine: true,
    file: {
      name: filename,
      size: file.size,
      type: mediaType === 'image' ? mime : file.type || mime,
      blobUrl: URL.createObjectURL(file),
      progress: 0,
    },
    timestamp: Date.now(),
  });

  targets.forEach((st, i) => {
    /* Only the first send drives the progress bar — N concurrent pumps
     * writing one number would just make it jitter. */
    pushChatFile(st, file, filename, id, target, i > 0);
  });
}

/** Queues one chat attachment onto one connection. */
function pushChatFile(
  st: ConnState,
  file: File,
  filename: string,
  id: string,
  target: ChatThread,
  silent: boolean,
  from?: string,
  fromName?: string,
): void {
  const seq = st.nextSeq++;
  const chunkSize = negotiateChunkSize(st.conn.peerConnection);
  const chunks = file.size === 0 ? 0 : Math.ceil(file.size / chunkSize);

  const transfer: OutgoingTransfer = {
    id,
    seq,
    kind: 'chat',
    silent,
    file,
    filename,
    size: file.size,
    chunkSize,
    chunks,
    sent: 0,
    cancelled: false,
  };
  st.outgoing.set(id, transfer);

  send(st, {
    t: 'chat-file',
    id,
    seq,
    to: target,
    name: filename,
    size: file.size,
    chunkSize,
    chunks,
    ...(from ? { from, fromName } : {}),
  });

  /* Chat attachments are auto-accepted, so there is no file-accept to wait
   * for — start pumping immediately. */
  void pump(st, transfer);
}

function onChatFileOffer(st: ConnState, msg: Extract<WireMessage, { t: 'chat-file' }>): void {
  if (!session) return;
  const problem = validateChatFile(msg);
  if (problem) {
    log('warn', `Rejected a malformed chat attachment from ${st.name}: ${problem}`);
    send(st, { t: 'file-abort', id: typeof msg.id === 'string' ? msg.id : '', reason: problem });
    return;
  }
  if (st.incoming.has(msg.seq)) throw new Error('Duplicate transfer sequence');

  const host = st.role === 'host';
  const from = host ? st.conn.peer : (msg.from || st.conn.peer);
  const fromName = host ? st.name : msg.fromName ? sanitizeDisplayName(msg.fromName) : st.name;

  /* Is this for us, or are we only the relay? */
  const forUs = msg.to === CHAT_ROOM_TARGET || msg.to === localPeerId();
  if (!host && !forUs) return; // a guest should never see someone else's whisper

  const filename = sanitizeFilename(msg.name);
  const { mime, mediaType, playable } = safeMimeFor(filename);

  st.incoming.set(msg.seq, {
    id: msg.id,
    seq: msg.seq,
    kind: 'chat',
    filename,
    size: msg.size,
    chunkSize: msg.chunkSize,
    chunks: msg.chunks,
    received: 0,
    nextIndex: 0,
    /* No consent gate: capped, in-memory, and part of a conversation the
     * user opted into by joining the room. */
    accepted: true,
    parts: [],
    mime,
    mediaType,
    playable,
    lastCommit: 0,
    chatTo: msg.to,
    chatFrom: from,
    chatFromName: fromName,
    chatDisplay: forUs,
  });

  if (!forUs) return; // pure relay — receive the bytes, show nothing

  chat().addMessage({
    id: msg.id,
    senderId: from,
    senderName: fromName,
    targetPeerId: msg.to,
    threadId: threadFor(msg.to, from),
    mine: false,
    file: {
      name: filename,
      size: msg.size,
      type: mime,
      blobUrl: null,
      progress: 0,
    },
    timestamp: Date.now(),
  });
}

/**
 * Host only: pass a completed attachment on to the peers that can't reach
 * its sender directly. The Blob is re-wrapped as a File and goes back out
 * through the ordinary send path.
 */
function relayChatAttachment(st: ConnState, inc: IncomingTransfer, blob: Blob): void {
  if (!session || session.role !== 'host') return;
  const to = inc.chatTo ?? CHAT_ROOM_TARGET;

  const targets: ConnState[] = [];
  if (to === CHAT_ROOM_TARGET) {
    for (const other of session.conns.values()) {
      if (other !== st && other.authenticated) targets.push(other);
    }
  } else if (to !== localPeerId()) {
    const one = session.conns.get(to);
    if (one?.authenticated) targets.push(one);
  }
  if (targets.length === 0) return;

  const file = new File([blob], inc.filename, { type: inc.mime });
  for (const target of targets) {
    pushChatFile(target, file, inc.filename, inc.id, to, true, inc.chatFrom, inc.chatFromName);
  }
  log('info', `Relayed "${inc.filename}" to ${targets.length} peer(s).`);
}

/* ─────────────────────────────────────────────────────────────
 *  LIVE BROADCAST
 * ─────────────────────────────────────────────────────────────
 *  The stream comes from captureStream() on the <video> element the user
 *  is already watching. It is push-only: peers cannot ask to be called,
 *  and only authenticated peers are ever dialled.
 * ───────────────────────────────────────────────────────────── */

/**
 * Starts broadcasting `stream` (captured by the caller from the active
 * player) to every authenticated peer.
 */
export function startBroadcast(stream: MediaStream, title: string): void {
  if (!session) throw new Error('No P2P session is running.');
  if (session.localStream) stopBroadcast();

  const authenticated = [...session.conns.values()].filter((st) => st.authenticated);
  if (authenticated.length === 0) throw new Error('No authenticated peers to broadcast to.');

  /*
   * A captureStream() taken from a media element that isn't actually
   * decoding yields a MediaStream with ZERO tracks. peer.call() with such
   * a stream still "succeeds": it negotiates a connection with no media
   * m-lines, so the receiver's ontrack never fires and the viewer never
   * opens — a silent failure that looks exactly like a broken feature.
   * Refuse it here, where we can still explain why.
   */
  const tracks = stream.getTracks();
  if (tracks.length === 0) {
    throw new Error(
      'The player produced an empty stream. Make sure the video is actually playing, then go live again.',
    );
  }
  /* Same failure mode, one step later: a stream whose tracks have already
   * ended (a previous broadcast stopped them) still negotiates happily and
   * still delivers nothing. Re-capture instead of going live into a void. */
  if (tracks.every((t) => t.readyState === 'ended')) {
    throw new Error(
      'That captured stream has already ended. Reopen the video in the player, then go live again.',
    );
  }

  session.localStream = stream;
  const safeTitle = sanitizeDisplayName(title) || 'Live';
  store().setBroadcast(safeTitle);

  /* If the source ends (user closed the player), take the broadcast down. */
  for (const track of tracks) {
    track.addEventListener('ended', () => {
      if (session?.localStream === stream) {
        log('warn', 'The captured video ended — stopping the broadcast.');
        stopBroadcast();
      }
    });
  }

  for (const st of authenticated) callPeer(st, safeTitle);
  log(
    'info',
    `Broadcasting "${safeTitle}" to ${authenticated.length} peer(s) — ` +
      `${stream.getVideoTracks().length} video / ${stream.getAudioTracks().length} audio track(s).`,
  );
}

/* ─────────────────────────────────────────────────────────────
 *  DUAL-MODE BROADCAST ROUTER
 * ─────────────────────────────────────────────────────────────
 *  Both branches end at the same place: one RTCPeerConnection carrying
 *  DTLS/SRTP-encrypted tracks directly between the two browsers. The only
 *  difference is which path the *offer* takes to get there.
 *
 *    Branch A · self-hosted-server → peer.call()  → offer via the broker
 *    Branch B · default-relay      → in-band SDP  → offer via DataChannel
 *
 *  B is the default because A only works on a signaling server that
 *  actually relays media offers — the public PeerJS broker does not.
 * ───────────────────────────────────────────────────────────── */

function callPeer(st: ConnState, title: string): void {
  if (!session?.localStream) return;

  /* Announce over the DataChannel first so the guest's lobby can show
   * "connecting to stream…" while ICE does its thing. Both branches. */
  send(st, { t: 'bcast-start', title });

  if (session.signalingMode === 'default-relay') {
    void startRelayOffer(st, title).catch((err) => {
      log('warn', `Could not start the relayed stream to ${st.name}: ${(err as Error).message}`);
      closeRelay(st);
    });
    return;
  }
  nativeCallPeer(st);
}

/** Branch A — PeerJS's own media routing. */
function nativeCallPeer(st: ConnState): void {
  if (!session?.localStream) return;
  if (!session.peer.open || session.peer.disconnected) {
    log('warn', `Signaling link is down — ${st.name} will not receive the call until it recovers.`);
  }
  try {
    const call = session.peer.call(st.conn.peer, session.localStream);
    session.calls.set(st.conn.peer, call);
    store().addViewer(st.conn.peer);
    call.on('close', () => {
      session?.calls.delete(st.conn.peer);
      store().removeViewer(st.conn.peer);
    });
    call.on('error', (err) => log('warn', `Stream to ${st.name} failed: ${err.message}`));
    log('info', `Calling ${st.conn.peer} with the live stream (our id: ${session.peer.id}).`);
  } catch (err) {
    log('warn', `Could not start the stream to ${st.name}: ${(err as Error).message}`);
  }
}

export function stopBroadcast(): void {
  if (!session) return;

  /* Branch A — hang up every PeerJS media call. */
  for (const call of session.calls.values()) {
    try {
      call.close();
    } catch {
      /* ignore */
    }
  }
  session.calls.clear();

  /* Branch B — close every relayed peer connection, and tell every viewer
   * the broadcast is over regardless of which branch carried it. */
  for (const st of session.conns.values()) {
    if (st.relay?.role === 'sender') closeRelay(st);
    if (st.authenticated) send(st, { t: 'bcast-stop' });
  }

  if (session.localStream) {
    /* Stops the capture, not the user's playback. */
    for (const track of session.localStream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    session.localStream = null;
  }

  store().setBroadcast(null);
  log('info', 'Broadcast ended.');
}

/* ─────────────────────────────────────────────────────────────
 *  BRANCH B — IN-BAND DATACHANNEL SDP RELAY
 * ─────────────────────────────────────────────────────────────
 *  The broker introduces the two browsers and is then bypassed entirely:
 *  the media offer, the answer and every ICE candidate ride the DataChannel
 *  that the password handshake already established.
 *
 *  Why this is not a security regression
 *  ────────────────────────────────────
 *  • The messages are post-auth (see PRE_AUTH_TYPES) — a stranger who
 *    guessed the room id has no channel to send them on.
 *  • The offer is sendonly and we never add a local track to a *receiving*
 *    connection, so answering can never turn on a camera or a microphone.
 *  • SDP and candidates are bounds-checked before they reach the browser's
 *    parser, and inbound candidates are capped.
 *  • Nothing here can request data: a relayed offer carries media the
 *    broadcaster chose to push, exactly like the branch it replaces.
 *
 *  It is also strictly *more* private than Branch A: the broker sees the
 *  media offer in native routing, and sees nothing at all here.
 * ───────────────────────────────────────────────────────────── */

/**
 * ICE configuration for a relayed connection. Prefers whatever the live
 * PeerJS instance is already using so both branches traverse NAT
 * identically; falls back to plain STUN.
 */
function relayIceConfig(): RTCConfiguration {
  const fromPeer = (session?.peer as unknown as { options?: { config?: RTCConfiguration } })?.options
    ?.config;
  if (fromPeer?.iceServers?.length) return fromPeer;
  return { iceServers: DEFAULT_ICE_SERVERS };
}

/** Wires the shared handlers both directions of a relay need. */
function attachRelayHandlers(st: ConnState, relay: RelayState): void {
  const { pc, nid } = relay;

  pc.onicecandidate = (ev) => {
    /* A null candidate is the end-of-candidates marker; the remote side
     * infers it from the SDP, so there is nothing to forward. */
    if (!ev.candidate || st.relay !== relay) return;
    send(st, {
      t: 'media-ice',
      nid,
      candidate: ev.candidate.candidate,
      sdpMid: ev.candidate.sdpMid,
      sdpMLineIndex: ev.candidate.sdpMLineIndex,
      usernameFragment: ev.candidate.usernameFragment,
    });
  };

  pc.onconnectionstatechange = () => {
    if (st.relay !== relay) return;
    switch (pc.connectionState) {
      case 'connected':
        log('info', `Relayed media connection with ${st.name} is up.`);
        break;
      case 'failed':
        log('warn', `Relayed media connection with ${st.name} failed (no network path found).`);
        if (relay.role === 'receiver') {
          /* Let the watchdog ask for a fresh offer rather than sitting on
           * a dead connection forever. */
          closeRelay(st);
          endIncomingBroadcast(st.conn.peer);
        } else {
          closeRelay(st);
        }
        break;
      case 'closed':
        if (relay.role === 'receiver') endIncomingBroadcast(st.conn.peer);
        break;
      default:
        break;
    }
  };
}

/** Applies candidates that arrived before the remote description did. */
async function flushPendingIce(relay: RelayState): Promise<void> {
  const queued = relay.pendingIce.splice(0);
  for (const init of queued) {
    try {
      await relay.pc.addIceCandidate(init);
    } catch {
      /* A single unusable candidate is normal — ICE tries the rest. */
    }
  }
}

/* ── sender side (host) ────────────────────────────────────── */

/**
 * Builds a sendonly RTCPeerConnection for `st` and pushes its offer down
 * the DataChannel. Resolves once the offer is on the wire; the connection
 * completes asynchronously as candidates trickle.
 */
async function startRelayOffer(st: ConnState, title: string): Promise<void> {
  if (!session?.localStream) return;
  const stream = session.localStream;

  /* Replace any previous negotiation with this peer — two half-open
   * connections would both try to deliver the same stream. */
  closeRelay(st);

  const relay: RelayState = {
    pc: new RTCPeerConnection(relayIceConfig()),
    nid: st.nextNid++,
    role: 'sender',
    remoteReady: false,
    pendingIce: [],
    iceIn: 0,
    delivered: false,
  };
  st.relay = relay;
  attachRelayHandlers(st, relay);

  for (const track of stream.getTracks()) {
    relay.pc.addTrack(track, stream);
  }

  const offer = await relay.pc.createOffer();
  /* The peer may have gone away while we were building the offer. */
  if (st.relay !== relay || !session) return;
  await relay.pc.setLocalDescription(offer);
  if (st.relay !== relay || !session) return;

  const sdp = relay.pc.localDescription?.sdp;
  if (!sdp) throw new Error('The browser produced no local description');

  send(st, { t: 'media-offer', nid: relay.nid, sdp, title });
  store().addViewer(st.conn.peer);
  log('info', `Sent ${st.name} a relayed media offer (negotiation ${relay.nid}).`);
}

function onMediaAnswer(st: ConnState, msg: Extract<WireMessage, { t: 'media-answer' }>): void {
  if (!isValidNegotiationId(msg.nid)) throw new Error('Malformed negotiation id');
  const relay = st.relay;
  /* Stale answer for a negotiation we already replaced — ignore quietly. */
  if (!relay || relay.role !== 'sender' || relay.nid !== msg.nid) return;
  if (relay.remoteReady) throw new Error('Duplicate media answer');

  const problem = validateSdp(msg.sdp, 'answer');
  if (problem) throw new Error(problem);

  void (async () => {
    try {
      await relay.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      if (st.relay !== relay) return;
      relay.remoteReady = true;
      await flushPendingIce(relay);
      log('info', `${st.name} accepted the relayed stream — negotiating a network path…`);
    } catch (err) {
      log('warn', `${st.name}'s answer could not be applied: ${(err as Error).message}`);
      closeRelay(st);
    }
  })();
}

/* ── receiver side (guest) ─────────────────────────────────── */

/**
 * Answers a relayed offer. The answer is generated from the offer alone —
 * we add no tracks and no transceivers of our own, so the resulting
 * connection is receive-only by construction.
 */
function onMediaOffer(st: ConnState, msg: Extract<WireMessage, { t: 'media-offer' }>): void {
  if (!isValidNegotiationId(msg.nid)) throw new Error('Malformed negotiation id');
  const problem = validateSdp(msg.sdp, 'offer');
  if (problem) throw new Error(problem);

  /* A re-offer supersedes whatever we had — the host sends one when a
   * viewer reports the stream never arrived. */
  closeRelay(st);
  st.broadcastTitle = sanitizeDisplayName(msg.title) || 'Live broadcast';

  const relay: RelayState = {
    pc: new RTCPeerConnection(relayIceConfig()),
    nid: msg.nid,
    role: 'receiver',
    remoteReady: false,
    pendingIce: [],
    iceIn: 0,
    delivered: false,
  };
  st.relay = relay;
  attachRelayHandlers(st, relay);

  relay.pc.ontrack = (ev) => {
    if (st.relay !== relay) return;
    /* A peer cannot make us hold an unbounded number of decoders. */
    if (relay.pc.getReceivers().length > MAX_INCOMING_TRACKS) {
      log('danger', `${st.name} offered more than ${MAX_INCOMING_TRACKS} tracks — refusing the stream.`);
      closeRelay(st);
      return;
    }
    const stream = ev.streams[0] ?? new MediaStream([ev.track]);
    if (relay.delivered) {
      /* Second track of the same broadcast (audio after video): re-commit
       * so the viewer picks it up instead of staying silent. */
      if (store().activeStream === stream) store().setActiveStream(stream, incomingMeta(st));
      return;
    }
    if (commitIncomingStream(st, stream, 'relayed ontrack')) relay.delivered = true;
  };

  void (async () => {
    try {
      await relay.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      if (st.relay !== relay || !session) return;
      relay.remoteReady = true;
      await flushPendingIce(relay);

      const answer = await relay.pc.createAnswer();
      if (st.relay !== relay || !session) return;
      await relay.pc.setLocalDescription(answer);
      if (st.relay !== relay || !session) return;

      const sdp = relay.pc.localDescription?.sdp;
      if (!sdp) throw new Error('The browser produced no local description');
      send(st, { t: 'media-answer', nid: relay.nid, sdp });
      log('info', `Answered ${st.name}'s relayed offer (negotiation ${relay.nid}) — negotiating media…`);
    } catch (err) {
      log('danger', `Could not answer ${st.name}'s relayed offer: ${(err as Error).message}`);
      closeRelay(st);
    }
  })();
}

/* ── shared ────────────────────────────────────────────────── */

function onMediaIce(st: ConnState, msg: Extract<WireMessage, { t: 'media-ice' }>): void {
  if (!isValidNegotiationId(msg.nid)) throw new Error('Malformed negotiation id');
  const relay = st.relay;
  /* Candidates for a superseded negotiation are expected in-flight noise. */
  if (!relay || relay.nid !== msg.nid) return;

  const problem = validateIceCandidate(msg);
  if (problem) throw new Error(problem);

  if (++relay.iceIn > MAX_ICE_CANDIDATES) {
    throw new Error('Too many ICE candidates');
  }

  const init: RTCIceCandidateInit = {
    candidate: msg.candidate,
    sdpMid: msg.sdpMid,
    sdpMLineIndex: msg.sdpMLineIndex,
    ...(typeof msg.usernameFragment === 'string' ? { usernameFragment: msg.usernameFragment } : {}),
  };

  /* Candidates routinely beat the description they belong to — queue them
   * rather than letting addIceCandidate reject. */
  if (!relay.remoteReady) {
    relay.pendingIce.push(init);
    return;
  }
  relay.pc.addIceCandidate(init).catch(() => {
    /* One bad candidate does not sink a negotiation. */
  });
}

/**
 * Tears down the relay for one peer. Never stops the local capture: the
 * sender's tracks belong to session.localStream and are shared with the
 * user's own playback, so only stopBroadcast/destroySession stop them.
 */
function closeRelay(st: ConnState): void {
  const relay = st.relay;
  if (!relay) return;
  st.relay = null;

  relay.pc.onicecandidate = null;
  relay.pc.ontrack = null;
  relay.pc.onconnectionstatechange = null;
  relay.pendingIce.length = 0;
  try {
    relay.pc.close();
  } catch {
    /* ignore */
  }
  if (relay.role === 'sender') store().removeViewer(st.conn.peer);
}

/* ─────────────────────────────────────────────────────────────
 *  RECEIVING A BROADCAST (guest)
 * ─────────────────────────────────────────────────────────────
 *  PeerJS emits `stream` exactly once, from RTCPeerConnection.ontrack,
 *  and does NOT replay it to listeners attached later. Three things here
 *  exist because of that:
 *
 *   1. Listeners are attached BEFORE answer(). answer() synchronously
 *      starts negotiation and drains any signaling messages PeerJS
 *      buffered before this connection object existed, so attaching
 *      afterwards is a race we don't need to take.
 *   2. After answering we read `call.remoteStream` directly, in case the
 *      event fired during answer() and we still missed it.
 *   3. A late sweep rebuilds the stream from the peer connection's
 *      receivers if, despite the above, nothing arrived. This is the
 *      difference between "the viewer silently never appears" and "the
 *      viewer appears".
 * ───────────────────────────────────────────────────────────── */

/** How long to wait for `stream` before rebuilding from the receivers. */
const STREAM_FALLBACK_MS = 2500;

/* ── Media-call watchdog (guest side) ──────────────────────────
 *
 *  A media offer is signaling traffic: it goes host → broker → guest. If
 *  the guest's websocket is mid-reconnect when it arrives, the broker
 *  drops it and NOTHING retries — the host believes it called, the guest
 *  never hears, and the viewer silently never opens. Meanwhile the
 *  DataChannel is peer-to-peer and perfectly healthy, which is why the
 *  "X started broadcasting" text still shows up.
 *
 *  So the guest arms a watchdog when a broadcast is announced and asks
 *  for a re-call over the DataChannel if no media materialises. */
const MEDIA_WATCHDOG_MS = 4000;
/**
 * The in-band relay cannot lose the offer — it rides the same ordered,
 * reliable channel as the announcement that armed this watchdog. So the
 * only thing left to wait for is ICE, which deserves considerably more
 * than four seconds before we tear a working negotiation down and retry.
 */
const RELAY_WATCHDOG_MS = 12_000;
const MAX_MEDIA_RETRIES = 4;

function clearMediaWatchdog(st: ConnState): void {
  if (st.mediaWatchdog) {
    clearTimeout(st.mediaWatchdog);
    st.mediaWatchdog = null;
  }
}

function armMediaWatchdog(st: ConnState): void {
  clearMediaWatchdog(st);
  const delay = session?.signalingMode === 'default-relay' ? RELAY_WATCHDOG_MS : MEDIA_WATCHDOG_MS;
  st.mediaWatchdog = setTimeout(() => {
    st.mediaWatchdog = null;
    if (!session) return;
    /* Already watching? Nothing to do. */
    if (store().isReceivingBroadcast) return;
    /* Broadcast was withdrawn while we waited. */
    if (store().broadcastMeta?.peerId !== st.conn.peer) return;

    if (st.mediaRetries >= MAX_MEDIA_RETRIES) {
      log('danger', `Gave up waiting for ${st.name}'s stream after ${MAX_MEDIA_RETRIES} attempts.`);
      store().setError(
        session.signalingMode === 'default-relay'
          ? `${st.name}'s stream was offered but no direct network path could be established. ` +
              `This is usually a restrictive NAT or firewall on one side. Try both browsers on the same network, ` +
              `or configure a TURN server.`
          : `${st.name}'s video invitation never arrived. Native PeerJS routing sends it through the signaling ` +
              `server, and the public broker does not relay media invitations. Switch "Live video" to In-Band Relay ` +
              `(no server needed), or run npx peer --port 9000 and point both browsers at it.`,
      );
      return;
    }

    st.mediaRetries++;
    log('warn', `No media from ${st.name} yet — requesting a re-offer (attempt ${st.mediaRetries}).`);
    send(st, { t: 'bcast-request', attempt: st.mediaRetries });
    armMediaWatchdog(st);
  }, delay);
}

/** Host side: a viewer says our offer never arrived, so place it again. */
function onBroadcastRequest(st: ConnState, attempt: number): void {
  if (!session?.localStream) {
    /* We're not live (any more) — tell them so they stop asking. */
    send(st, { t: 'bcast-stop' });
    return;
  }
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_MEDIA_RETRIES + 1) {
    throw new Error('Malformed broadcast request');
  }

  /* Tear down the stale call before replacing it, or PeerJS keeps both. */
  const existing = session.calls.get(st.conn.peer);
  if (existing) {
    try {
      existing.close();
    } catch {
      /* ignore */
    }
    session.calls.delete(st.conn.peer);
    store().removeViewer(st.conn.peer);
  }

  log('warn', `${st.name} did not receive the stream — re-calling (their attempt ${attempt}).`);
  callPeer(st, store().broadcastTitle ?? st.broadcastTitle);
}

/** Descriptor for whatever `st` is currently broadcasting to us. */
function incomingMeta(st: ConnState) {
  return {
    peerId: st.conn.peer,
    peerName: st.name,
    title: st.broadcastTitle,
    startedAt: Date.now(),
  };
}

/**
 * Hands a received stream to the store, whichever branch produced it.
 * Returns false if the stream was unusable, so the caller can keep
 * waiting for a real one instead of latching onto an empty MediaStream.
 */
function commitIncomingStream(st: ConnState, stream: MediaStream, how: string): boolean {
  if (!session) return false;
  if (stream.getTracks().length === 0) {
    log('warn', `${st.name}'s stream arrived with no tracks — ignoring (${how}).`);
    return false;
  }

  /* Media landed — stop asking the host to re-send. */
  clearMediaWatchdog(st);
  st.mediaRetries = 0;
  store().setActiveStream(stream, incomingMeta(st));
  log(
    'info',
    `Watching ${st.name}'s broadcast — ${stream.getVideoTracks().length} video / ` +
      `${stream.getAudioTracks().length} audio track(s) [${how}].`,
  );

  /* Audio often negotiates a beat after video; re-commit so the viewer
   * picks up the extra track instead of staying silent forever. */
  stream.addEventListener('addtrack', () => {
    if (store().activeStream === stream) store().setActiveStream(stream, incomingMeta(st));
  });
  stream.addEventListener('removetrack', () => {
    if (stream.getTracks().length === 0) endIncomingBroadcast(st.conn.peer);
  });
  return true;
}

function acceptBroadcastCall(call: MediaConnection, st: ConnState): void {
  if (!session) return;

  let delivered = false;
  const deliver = (stream: MediaStream, how: string) => {
    if (delivered) return;
    if (commitIncomingStream(st, stream, how)) delivered = true;
  };

  /* 1 ─ Listen first. */
  call.on('stream', (stream) => deliver(stream, 'stream event'));
  call.on('close', () => endIncomingBroadcast(call.peer));
  call.on('error', (err) => {
    log('warn', `Broadcast connection with ${st.name} failed: ${err.message}`);
    endIncomingBroadcast(call.peer);
  });

  /* 2 ─ Answer receive-only. No camera, mic or screen is ever offered back. */
  try {
    call.answer();
  } catch (err) {
    log('danger', `Could not answer ${st.name}'s broadcast: ${(err as Error).message}`);
    return;
  }
  session.incomingCall = call;
  log('info', `Answered ${st.name}'s broadcast call — negotiating media…`);

  /* Already fired during answer()? Take it now. */
  const early = (call as MediaConnection & { remoteStream?: MediaStream }).remoteStream;
  if (early) deliver(early, 'remoteStream');

  /* 3 ─ Last-resort sweep of the transceivers. */
  setTimeout(() => {
    if (delivered || !session || session.incomingCall !== call) return;
    const pc = call.peerConnection;
    const tracks = pc?.getReceivers().map((r) => r.track).filter((t): t is MediaStreamTrack => !!t) ?? [];
    if (tracks.length === 0) {
      log(
        'warn',
        `No media arrived from ${st.name} after ${STREAM_FALLBACK_MS}ms. ` +
          `Their player may not have been playing when they went live.`,
      );
      return;
    }
    deliver(new MediaStream(tracks), 'receiver fallback');
  }, STREAM_FALLBACK_MS);
}

function endIncomingBroadcast(peerId: string): void {
  const meta = store().broadcastMeta;
  if (!meta || meta.peerId !== peerId) return;

  const stream = store().activeStream;
  if (stream) {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
  }
  store().clearIncomingBroadcast();
  if (session?.incomingCall?.peer === peerId) session.incomingCall = null;

  /* Branch B leaves a live RTCPeerConnection behind that nothing else
   * owns — release it with the stream it was carrying. */
  const st = session?.conns.get(peerId);
  if (st?.relay?.role === 'receiver') closeRelay(st);

  log('info', 'The broadcast ended.');
}

/* ─────────────────────────────────────────────────────────────
 *  HELPERS
 * ───────────────────────────────────────────────────────────── */

function send(st: ConnState, msg: WireMessage): void {
  if (!st.conn.open) return;
  try {
    st.conn.send(encodeMessage(msg));
  } catch (err) {
    log('warn', `Failed to send "${msg.t}" to ${st.name}: ${(err as Error).message}`);
  }
}

function safeClose(conn: DataConnection): void {
  try {
    conn.close();
  } catch {
    /* ignore */
  }
}

/** Peer ids are long and namespaced — show the tail in logs and UI. */
export function shortId(peerId: string): string {
  return peerId.length <= 10 ? peerId : `…${peerId.slice(-8)}`;
}

function friendlyPeerError(err: Error & { type?: string }, opts?: StartSessionOptions): string {
  switch (err.type) {
    case 'unavailable-id':
      return `Room ${opts?.roomId ?? ''} is already in use. Pick different digits.`.trim();
    case 'peer-unavailable':
      return `No open room with that ID. Check the digits, and make sure the host started the room first.`;
    case 'browser-incompatible':
      return 'This browser does not support the WebRTC features LocalTube needs.';
    case 'invalid-id':
      return 'That room ID contains characters the signaling server rejects. Use digits only.';
    case 'ssl-unavailable':
      return 'The signaling server requires a secure connection. Open LocalTube over https://.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Lost contact with the signaling server. Check your connection and try again.';
    case 'webrtc':
      return `WebRTC error: ${err.message}`;
    default:
      return err.message || 'Unknown P2P error.';
  }
}
