/* ─────────────────────────────────────────────────────────────
 *  P2P WIRE PROTOCOL — types, crypto & framing
 * ─────────────────────────────────────────────────────────────
 *  This module is the *contract* between two LocalTube browsers. It is
 *  deliberately transport-agnostic and side-effect free: importing it
 *  starts nothing, opens nothing and touches no network. All PeerJS
 *  plumbing lives in webrtcService.ts.
 *
 *  SECURITY MODEL (read before changing anything here)
 *  ───────────────────────────────────────────────────
 *  • The DataChannel is the ONLY channel. There is no message type that
 *    can read, list, enumerate or request a local file. The vocabulary
 *    below is exhaustive — a peer literally cannot ask for anything.
 *    Files move only when the owner pushes a `file-offer`.
 *  • Room membership is proven with a mutual challenge/response over a
 *    key derived from the room password (PBKDF2-SHA256, then HMAC-SHA256
 *    over both nonces). The plaintext password NEVER goes on the wire, in
 *    either direction, so a peer squatting on your room id on the public
 *    signaling broker cannot harvest it.
 *  • Both nonces are mixed into every proof and each direction is domain
 *    separated, so a captured proof can neither be replayed nor reflected
 *    back at its sender.
 *
 *  HONEST LIMITATION: this is not a PAKE. A squatter who completes one
 *  handshake obtains a single HMAC they can attack offline. PBKDF2 at
 *  {@link PBKDF2_ITERATIONS} iterations makes that expensive per guess,
 *  but a weak password is still a weak password — the UI says so.
 * ───────────────────────────────────────────────────────────── */

/** Bumped on any breaking change to the message vocabulary or framing. */
export const PROTOCOL_VERSION = 1;

/*
 * Real PeerJS ids are namespaced so a bare "482913" typed by a user cannot
 * collide with (or be squatted by) unrelated apps sharing the public broker.
 * The user only ever sees/types the digits.
 */
export const PEER_ID_PREFIX = 'localtube-p2p-v1-';

export const ROOM_ID_MIN_DIGITS = 4;
export const ROOM_ID_MAX_DIGITS = 10;
export const ROOM_ID_DEFAULT_DIGITS = 6;
export const PASSWORD_MIN_LENGTH = 8;

/* ── Chunking ──────────────────────────────────────────────── */

/** Universally interoperable SCTP message size. Always safe. */
export const MIN_CHUNK_BYTES = 16 * 1024;
/** Upper bound we're willing to use even if the transport allows more. */
export const MAX_CHUNK_BYTES = 64 * 1024;
/** `[u32 transferSeq][u32 chunkIndex]` prepended to every binary chunk. */
export const CHUNK_HEADER_BYTES = 8;

/* ── Receiver-side hard limits (anti-abuse) ────────────────── */

/** Received files are reassembled in memory — cap what a peer can push. */
export const MAX_INCOMING_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
export const MAX_FILENAME_LENGTH = 180;
export const MAX_DISPLAY_NAME_LENGTH = 32;
/** Auth must complete this fast or the connection is dropped. */
export const AUTH_TIMEOUT_MS = 15_000;
/** Wrong password attempts tolerated from one remote id before it's banned. */
export const MAX_AUTH_ATTEMPTS = 3;

/* ── In-band media signaling limits ────────────────────────── */

/**
 * A session description is a text blob we hand straight to the browser's
 * SDP parser, so it gets a hard ceiling. Real offers are 2–8 KB; 128 KB is
 * generous enough for a many-track renegotiation and still far too small
 * to be useful as a memory-exhaustion vector.
 */
export const MAX_SDP_BYTES = 128 * 1024;
/** One `a=candidate:` line. The spec-ish practical maximum is ~250 chars. */
export const MAX_ICE_CANDIDATE_CHARS = 1024;
/**
 * Trickle ICE for one relay connection. A healthy negotiation emits a few
 * dozen; anything past this is a peer trying to make us do work.
 */
export const MAX_ICE_CANDIDATES = 256;
/** Tracks we are willing to receive from one broadcaster. */
export const MAX_INCOMING_TRACKS = 4;

/* ── Key derivation ────────────────────────────────────────── */

/**
 * Deliberately slow. A room-id squatter who captures one proof must spend
 * this much work per password guess offline.
 */
export const PBKDF2_ITERATIONS = 250_000;
const NONCE_BYTES = 32;

/* ─────────────────────────────────────────────────────────────
 *  ICE
 * ─────────────────────────────────────────────────────────────
 *  Only used by the in-band relay, and only as a fallback: the relay
 *  prefers whatever ICE configuration the live PeerJS instance is already
 *  using, so both paths reach the network identically.
 *
 *  A STUN server is contacted only to learn this machine's public
 *  ip:port — it sees no media, no files and no room password. On a LAN
 *  the host-candidate pair usually wins before STUN even answers.
 * ───────────────────────────────────────────────────────────── */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

/* ─────────────────────────────────────────────────────────────
 *  MESSAGE VOCABULARY
 * ─────────────────────────────────────────────────────────────
 *  Note what is absent: no "list", "get", "read", "browse", "stat".
 *  Adding one would break invariant #1 — don't.
 * ───────────────────────────────────────────────────────────── */

/** Host → guest, immediately on open. Carries the host's challenge. */
export interface HelloMsg {
  t: 'hello';
  v: number;
  nonce: string;
}

/** Guest → host. Answers the host's challenge and issues its own. */
export interface AuthMsg {
  t: 'auth';
  v: number;
  /** Guest's counter-challenge — the host must answer it in `auth-ok`. */
  nonce: string;
  proof: string;
  name: string;
}

/** Host → guest. Proves the host also knows the password. */
export interface AuthOkMsg {
  t: 'auth-ok';
  proof: string;
  name: string;
}

/** Sent (best effort) right before the loser of a handshake is dropped. */
export interface AuthFailMsg {
  t: 'auth-fail';
  reason: string;
}

/** Owner → peer. A *push* announcement; never a response to a request. */
export interface FileOfferMsg {
  t: 'file-offer';
  id: string;
  /** Numeric handle echoed in every binary chunk header. */
  seq: number;
  name: string;
  size: number;
  mediaType: 'video' | 'image' | 'other';
  chunkSize: number;
  chunks: number;
}

/** Receiver consents to the push. Chunks start only after this. */
export interface FileAcceptMsg {
  t: 'file-accept';
  id: string;
}

export interface FileDeclineMsg {
  t: 'file-decline';
  id: string;
  reason?: string;
}

export interface FileDoneMsg {
  t: 'file-done';
  id: string;
  /** Byte count the sender believes it sent — cross-checked by the receiver. */
  size: number;
}

export interface FileAbortMsg {
  t: 'file-abort';
  id: string;
  reason: string;
}

/** Announces an incoming `peer.call`, so the viewer UI can arm itself. */
export interface BroadcastStartMsg {
  t: 'bcast-start';
  title: string;
}

export interface BroadcastStopMsg {
  t: 'bcast-stop';
}

/**
 * Guest → host: "your announcement arrived but your media call never did,
 * please place it again."
 *
 * Media offers travel through the signaling broker, which drops anything
 * addressed to a peer whose websocket happens to be reconnecting. The
 * DataChannel is peer-to-peer and unaffected, so it is the reliable path
 * for asking for a retry — without this, a dropped offer is unrecoverable
 * and the viewer never opens.
 */
export interface BroadcastRequestMsg {
  t: 'bcast-request';
  attempt: number;
}

/* ─────────────────────────────────────────────────────────────
 *  IN-BAND MEDIA SIGNALING  (the "default-relay" broadcast mode)
 * ─────────────────────────────────────────────────────────────
 *  PeerJS's own `peer.call()` sends the media offer through the signaling
 *  broker. The public broker relays data offers happily but drops the
 *  larger media offers, so a broadcast over it silently never arrives.
 *
 *  These three messages carry the exact same negotiation over the
 *  DataChannel we already have — which is peer-to-peer, DTLS-encrypted and
 *  demonstrably reliable, since it is the same channel the file transfer
 *  rides on. The broker is not involved at all after the initial
 *  introduction, so nothing can drop the offer.
 *
 *  They are ordinary post-auth messages: {@link PRE_AUTH_TYPES} does not
 *  contain them, so an unauthenticated peer cannot open a media connection
 *  by this route any more than it can by the other one. They also remain
 *  push-only — there is still no message that asks a peer to *send*
 *  anything, so invariant #1 is untouched.
 * ───────────────────────────────────────────────────────────── */

/** Broadcaster → viewer. A sendonly SDP offer, tunnelled in-band. */
export interface MediaOfferMsg {
  t: 'media-offer';
  /** Monotonic per-connection; lets a late answer for a torn-down
   *  negotiation be discarded instead of corrupting the current one. */
  nid: number;
  sdp: string;
  title: string;
}

/** Viewer → broadcaster. The recvonly answer. */
export interface MediaAnswerMsg {
  t: 'media-answer';
  nid: number;
  sdp: string;
}

/** Trickle ICE, both directions, for the negotiation identified by `nid`. */
export interface MediaIceMsg {
  t: 'media-ice';
  nid: number;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

/** Courtesy notice before a clean disconnect. */
export interface ByeMsg {
  t: 'bye';
}

export type WireMessage =
  | HelloMsg
  | AuthMsg
  | AuthOkMsg
  | AuthFailMsg
  | FileOfferMsg
  | FileAcceptMsg
  | FileDeclineMsg
  | FileDoneMsg
  | FileAbortMsg
  | BroadcastStartMsg
  | BroadcastStopMsg
  | BroadcastRequestMsg
  | MediaOfferMsg
  | MediaAnswerMsg
  | MediaIceMsg
  | ByeMsg;

/** The only two messages tolerated before a peer is authenticated. */
const PRE_AUTH_TYPES = new Set<WireMessage['t']>(['hello', 'auth', 'auth-ok', 'auth-fail']);

export const isPreAuthMessage = (t: WireMessage['t']) => PRE_AUTH_TYPES.has(t);

/* ─────────────────────────────────────────────────────────────
 *  ENCODING
 * ───────────────────────────────────────────────────────────── */

export function encodeMessage(msg: WireMessage): string {
  return JSON.stringify(msg);
}

/**
 * Parses an inbound control frame. Returns null for anything that isn't a
 * well-formed message — callers treat null as a protocol violation and drop
 * the connection rather than guessing.
 */
export function decodeMessage(raw: unknown): WireMessage | null {
  if (typeof raw !== 'string' || raw.length > 64 * 1024) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const t = (parsed as { t?: unknown }).t;
  if (typeof t !== 'string') return null;
  return parsed as WireMessage;
}

/** `[u32 transferSeq][u32 chunkIndex][payload]`, big-endian. */
export function frameChunk(seq: number, index: number, payload: ArrayBuffer): ArrayBuffer {
  const out = new ArrayBuffer(CHUNK_HEADER_BYTES + payload.byteLength);
  const view = new DataView(out);
  view.setUint32(0, seq, false);
  view.setUint32(4, index, false);
  new Uint8Array(out, CHUNK_HEADER_BYTES).set(new Uint8Array(payload));
  return out;
}

export interface ParsedChunk {
  seq: number;
  index: number;
  payload: ArrayBuffer;
}

export function parseChunk(buf: ArrayBuffer): ParsedChunk | null {
  if (buf.byteLength <= CHUNK_HEADER_BYTES) return null;
  if (buf.byteLength > CHUNK_HEADER_BYTES + MAX_CHUNK_BYTES) return null;
  const view = new DataView(buf);
  return {
    seq: view.getUint32(0, false),
    index: view.getUint32(4, false),
    payload: buf.slice(CHUNK_HEADER_BYTES),
  };
}

/**
 * Largest chunk this connection can carry, clamped to our own bounds.
 * `sctp.maxMessageSize` is 64 KiB+ on modern Chromium/Firefox and only
 * 16 KiB against older stacks — reading it keeps us fast *and* safe.
 */
export function negotiateChunkSize(pc: RTCPeerConnection | undefined): number {
  const max = pc?.sctp?.maxMessageSize;
  if (!max || !Number.isFinite(max)) return MIN_CHUNK_BYTES;
  const usable = max - CHUNK_HEADER_BYTES;
  if (usable >= MAX_CHUNK_BYTES) return MAX_CHUNK_BYTES;
  if (usable >= MIN_CHUNK_BYTES) return MIN_CHUNK_BYTES;
  return Math.max(1024, Math.floor(usable));
}

/* ─────────────────────────────────────────────────────────────
 *  CRYPTO
 * ───────────────────────────────────────────────────────────── */

/**
 * WebCrypto's subtle API only exists in a secure context. Serving LocalTube
 * over plain http:// on a LAN ip silently loses it — fail loudly instead of
 * falling back to something weaker.
 */
export function assertSecureContext(): void {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Secure context required: room passwords need WebCrypto. Open LocalTube over https:// or on localhost.',
    );
  }
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Cryptographically random hex string — used for nonces and transfer ids. */
export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function makeNonce(): string {
  return randomHex(NONCE_BYTES);
}

/** Unbiased random digit string (rejection-free: 10 divides 250 evenly). */
export function randomRoomId(digits = ROOM_ID_DEFAULT_DIGITS): string {
  const n = Math.min(ROOM_ID_MAX_DIGITS, Math.max(ROOM_ID_MIN_DIGITS, digits));
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < n; i++) {
    /* 250 is the largest multiple of 10 ≤ 255, so re-draw above it. */
    let b = bytes[i];
    while (b >= 250) {
      const one = new Uint8Array(1);
      crypto.getRandomValues(one);
      b = one[0];
    }
    out += (b % 10).toString();
  }
  return out;
}

/**
 * PBKDF2(password, "localtube-p2p|<roomId>") → HMAC key.
 *
 * Cached per (roomId, password) because it costs ~200 ms and every joining
 * peer needs it. {@link clearRoomKeyCache} wipes it — the kill switch calls it.
 */
let keyCache: { fingerprint: string; key: CryptoKey } | null = null;

export async function deriveRoomKey(roomId: string, password: string): Promise<CryptoKey> {
  assertSecureContext();
  const fingerprint = `${roomId} ${password}`;
  if (keyCache && keyCache.fingerprint === fingerprint) return keyCache.key;

  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`localtube-p2p|${roomId}`),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  keyCache = { fingerprint, key };
  return key;
}

export function clearRoomKeyCache(): void {
  keyCache = null;
}

/** Which side of the handshake a proof belongs to (blocks reflection). */
export type ProofDirection = 'guest->host' | 'host->guest';

/**
 * HMAC-SHA256(roomKey, "<dir>|<hostNonce>|<guestNonce>").
 *
 * Both nonces are bound in, so a proof is worthless outside the exact
 * handshake that produced it; the direction tag stops an attacker replaying
 * the guest's proof back at the guest as the host's.
 */
export async function computeProof(
  key: CryptoKey,
  direction: ProofDirection,
  hostNonce: string,
  guestNonce: string,
): Promise<string> {
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(`localtube-p2p-v${PROTOCOL_VERSION}|${direction}|${hostNonce}|${guestNonce}`),
  );
  return toHex(new Uint8Array(sig));
}

/**
 * Length-independent, branch-free comparison. Prevents an attacker from
 * learning the correct proof one byte at a time by timing the reject.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Rejects a nonce that is missing, malformed or too short to be unguessable. */
export function isValidNonce(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32,128}$/.test(value);
}

/* ─────────────────────────────────────────────────────────────
 *  SANITIZERS
 * ─────────────────────────────────────────────────────────────
 *  Everything below treats remote input as hostile.
 * ───────────────────────────────────────────────────────────── */

/** C0/C1 control characters — stripped from every remote-supplied string. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/*
 * A received file becomes a Blob URL, and a Blob URL opens in *our own
 * origin*. Honouring a peer-supplied MIME type would therefore let a peer
 * hand us `text/html` and script into the LocalTube origin. So the MIME is
 * never taken from the wire — it is re-derived locally from the extension
 * against this allowlist, and anything unknown becomes an inert download.
 */
const MIME_BY_EXT: Record<string, { mime: string; mediaType: 'video' | 'image' }> = {
  mp4: { mime: 'video/mp4', mediaType: 'video' },
  m4v: { mime: 'video/mp4', mediaType: 'video' },
  webm: { mime: 'video/webm', mediaType: 'video' },
  ogv: { mime: 'video/ogg', mediaType: 'video' },
  ogg: { mime: 'video/ogg', mediaType: 'video' },
  mov: { mime: 'video/quicktime', mediaType: 'video' },
  mkv: { mime: 'video/x-matroska', mediaType: 'video' },
  jpg: { mime: 'image/jpeg', mediaType: 'image' },
  jpeg: { mime: 'image/jpeg', mediaType: 'image' },
  png: { mime: 'image/png', mediaType: 'image' },
  gif: { mime: 'image/gif', mediaType: 'image' },
  webp: { mime: 'image/webp', mediaType: 'image' },
  avif: { mime: 'image/avif', mediaType: 'image' },
  bmp: { mime: 'image/bmp', mediaType: 'image' },
};

export interface SafeMime {
  mime: string;
  mediaType: 'video' | 'image' | 'other';
  /** True only for types we're willing to render in-app. */
  playable: boolean;
}

export function safeMimeFor(filename: string): SafeMime {
  const i = filename.lastIndexOf('.');
  const ext = i < 0 ? '' : filename.slice(i + 1).toLowerCase();
  const hit = MIME_BY_EXT[ext];
  if (!hit) return { mime: 'application/octet-stream', mediaType: 'other', playable: false };
  return { ...hit, playable: true };
}

/**
 * Reduces a remote filename to a harmless basename: no directory separators
 * (path traversal via the `download` attribute), no control characters, no
 * leading dots, bounded length.
 */
export function sanitizeFilename(raw: unknown): string {
  if (typeof raw !== 'string') return 'received-file';
  const basename = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = basename
    .replace(CONTROL_CHARS, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  return cleaned || 'received-file';
}

/** Display names are rendered in the peer list — keep them short and inert. */
export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Peer';
  const cleaned = raw
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
  return cleaned || 'Peer';
}

export function isValidRoomId(value: string): boolean {
  return new RegExp(`^[0-9]{${ROOM_ID_MIN_DIGITS},${ROOM_ID_MAX_DIGITS}}$`).test(value);
}

export const peerIdForRoom = (roomId: string) => `${PEER_ID_PREFIX}${roomId}`;

/**
 * Structural validation of an inbound offer, before any UI is shown and
 * before a single byte is buffered.
 */
export function validateFileOffer(msg: FileOfferMsg): string | null {
  if (typeof msg.id !== 'string' || !/^[0-9a-f]{8,64}$/.test(msg.id)) return 'Malformed transfer id';
  if (!Number.isInteger(msg.seq) || msg.seq < 0 || msg.seq > 0xffffffff) return 'Malformed transfer sequence';
  if (!Number.isInteger(msg.size) || msg.size < 0) return 'Malformed size';
  if (msg.size > MAX_INCOMING_FILE_BYTES) return 'File exceeds the 2 GB receive limit';
  if (!Number.isInteger(msg.chunkSize) || msg.chunkSize < 1 || msg.chunkSize > MAX_CHUNK_BYTES) {
    return 'Malformed chunk size';
  }
  if (!Number.isInteger(msg.chunks) || msg.chunks < 0) return 'Malformed chunk count';
  /* The declared shape must be internally consistent — no lying about size. */
  const expected = msg.size === 0 ? 0 : Math.ceil(msg.size / msg.chunkSize);
  if (msg.chunks !== expected) return 'Inconsistent chunk count';
  return null;
}

/* ── In-band signaling validation ──────────────────────────── */

/** Negotiation ids are small positive integers, allocated per connection. */
export function isValidNegotiationId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= 0xffff;
}

/**
 * Bounds-checks a relayed session description before it reaches the
 * browser's SDP parser.
 *
 * The parser is the same one that handles broker-delivered offers, so this
 * is not a new attack surface — but a relayed offer arrives over a channel
 * an authenticated peer controls completely, so it is worth refusing the
 * obviously-malformed and the absurdly-large before we hand it over.
 */
export function validateSdp(sdp: unknown, kind: 'offer' | 'answer'): string | null {
  if (typeof sdp !== 'string') return 'Session description is not a string';
  if (sdp.length === 0) return 'Empty session description';
  if (sdp.length > MAX_SDP_BYTES) return 'Session description exceeds the size limit';
  /* Every SDP starts with a version line; anything else is not an SDP. */
  if (!sdp.startsWith('v=0')) return 'Malformed session description';
  /* An offer with no media section can only be an attempt to renegotiate
   * this connection into something other than a one-way broadcast. */
  if (!/^m=(audio|video)[ ]/m.test(sdp)) return `Relayed ${kind} carries no media section`;
  return null;
}

/** Structural check on a trickled candidate. */
export function validateIceCandidate(msg: MediaIceMsg): string | null {
  if (typeof msg.candidate !== 'string') return 'Candidate is not a string';
  if (msg.candidate.length > MAX_ICE_CANDIDATE_CHARS) return 'Candidate exceeds the size limit';
  /* The empty candidate is the legal "end of candidates" marker. */
  if (msg.candidate !== '' && !msg.candidate.startsWith('candidate:')) return 'Malformed candidate';
  if (msg.sdpMid !== null && typeof msg.sdpMid !== 'string') return 'Malformed sdpMid';
  if (typeof msg.sdpMid === 'string' && msg.sdpMid.length > 32) return 'Malformed sdpMid';
  if (
    msg.sdpMLineIndex !== null &&
    (!Number.isInteger(msg.sdpMLineIndex) || msg.sdpMLineIndex < 0 || msg.sdpMLineIndex > 32)
  ) {
    return 'Malformed sdpMLineIndex';
  }
  if (msg.sdpMid === null && msg.sdpMLineIndex === null) return 'Candidate identifies no media section';
  return null;
}
