import {
  PASSWORD_MIN_LENGTH,
  ROOM_ID_MAX_DIGITS,
  isValidRoomId,
} from '../services/p2pProtocol';
import type { SignalingMode } from '../store/useWebRTCStore';

/* ─────────────────────────────────────────────────────────────
 *  INVITE LINKS
 * ─────────────────────────────────────────────────────────────
 *  WHY THE FRAGMENT, AND WHAT THAT DOES AND DOESN'T BUY YOU
 *  ───────────────────────────────────────────────────────
 *  Everything after `#` is stripped by the browser before the request
 *  goes out. It never appears in the request line, so it cannot reach
 *  server access logs, an intercepting proxy, or a CDN edge log — which is
 *  exactly why a query string would be the wrong place for a password.
 *  It is also excluded from the `Referer` header, so a later navigation
 *  cannot carry it to a third party.
 *
 *  Be equally clear about what it does NOT buy you. A link containing a
 *  password is a bearer credential, and it still lands in:
 *
 *    • the address bar, and therefore browser history and URL autocomplete
 *      (we scrub the current entry — see clearInviteFromUrl — but a browser
 *      may already have recorded the visit);
 *    • whatever you sent it over. A messenger, mail server or group chat
 *      that sees the link has the room. This is the dominant risk, and no
 *      amount of client-side care changes it;
 *    • the clipboard, readable by anything with clipboard access.
 *
 *  BASE64 IS NOT ENCRYPTION. The encoding below stops a password being
 *  legible over your shoulder or in a screen-share. It is trivially
 *  reversible and is not a confidentiality control. Do not describe it as
 *  one in the UI, and do not let it justify a weaker room password.
 * ───────────────────────────────────────────────────────────── */

/** Bumped if the payload shape changes incompatibly. */
export const INVITE_VERSION = 1;

/** The hash route an invite lives at. */
export const INVITE_ROUTE = '/p2p-join';

/**
 * Refuse absurd input rather than handing it to atob/JSON.parse. A real
 * invite is a couple of hundred bytes; anything near this is hostile or
 * corrupt, and either way we don't want to parse it.
 */
export const MAX_INVITE_HASH_CHARS = 4096;
const MAX_PASSWORD_CHARS = 256;
const MAX_HOST_CHARS = 255;

/** Optional self-hosted signaling server carried along with the room. */
export interface InviteSignaling {
  host: string;
  port: number;
  path?: string;
  secure?: boolean;
}

export interface InvitePayload {
  roomId: string;
  password: string;
  /**
   * The host's broadcast transport. Carried because both sides must agree:
   * a guest on the public broker and a host on their own PeerServer are on
   * different networks entirely and would simply never find each other.
   */
  signalingMode?: SignalingMode;
  signaling?: InviteSignaling;
}

/* ── base64url, UTF-8 safe ─────────────────────────────────────
 *
 *  btoa() throws on any code point above U+00FF, so a passphrase with an
 *  emoji or a non-Latin character would break a naive implementation. We
 *  encode to UTF-8 bytes first. base64url (`-`/`_`, no padding) keeps the
 *  result safe to sit in a URL without escaping.
 * ───────────────────────────────────────────────────────────── */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/* ── generate ──────────────────────────────────────────────── */

/**
 * Builds a one-click invite. The credentials live entirely in the
 * fragment, so this string can be produced and consumed without any
 * server ever seeing the room password.
 *
 * The caller is handing out a bearer credential — the UI that surfaces
 * this must say so.
 */
export function generateInviteLink(
  roomId: string,
  password: string,
  extra?: { signalingMode?: SignalingMode; signaling?: InviteSignaling },
): string {
  if (!isValidRoomId(roomId)) throw new Error('Invalid room ID.');
  if (!password) throw new Error('A room password is required to build an invite.');

  const payload: Record<string, unknown> = {
    v: INVITE_VERSION,
    r: roomId,
    p: password,
  };
  /* Only travels when it actually differs from what a fresh client does. */
  if (extra?.signalingMode === 'self-hosted-server') {
    payload.m = extra.signalingMode;
    if (extra.signaling?.host) {
      payload.s = {
        h: extra.signaling.host,
        o: extra.signaling.port,
        t: extra.signaling.path ?? '/',
        e: extra.signaling.secure !== false,
      };
    }
  }

  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${INVITE_ROUTE}?d=${toBase64Url(JSON.stringify(payload))}`;
}

/* ── parse ─────────────────────────────────────────────────── */

/**
 * Reads an invite out of a location hash (with or without the leading
 * `#`). Returns null for anything that isn't a well-formed, in-range
 * invite — callers must treat null as "no invite", never as an error to
 * surface, because a hash is attacker-supplied by definition.
 *
 * Two encodings are accepted:
 *   #/p2p-join?d=<base64url of the payload>   ← what we emit
 *   #/p2p-join?room=123456&pwd=secret         ← readable, hand-writable
 */
export function parseInviteLink(hashString: string): InvitePayload | null {
  if (typeof hashString !== 'string') return null;
  if (hashString.length > MAX_INVITE_HASH_CHARS) return null;

  const raw = hashString.startsWith('#') ? hashString.slice(1) : hashString;
  const qIndex = raw.indexOf('?');
  const route = qIndex < 0 ? raw : raw.slice(0, qIndex);
  if (route !== INVITE_ROUTE) return null;
  if (qIndex < 0) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw.slice(qIndex + 1));
  } catch {
    return null;
  }

  const encoded = params.get('d');
  return encoded ? parseEncoded(encoded) : parsePlain(params);
}

function parseEncoded(encoded: string): InvitePayload | null {
  const json = fromBase64Url(encoded);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const o = parsed as Record<string, unknown>;
  if (o.v !== INVITE_VERSION) return null;

  const invite = build(o.r, o.p);
  if (!invite) return null;

  if (o.m === 'self-hosted-server') {
    invite.signalingMode = 'self-hosted-server';
    const s = o.s as Record<string, unknown> | undefined;
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const host = typeof s.h === 'string' ? s.h.trim() : '';
      const port = typeof s.o === 'number' ? s.o : Number(s.o);
      /* A hostile invite could otherwise point the joiner at anything. We
       * cannot judge intent here, so we bound the shape and let the
       * confirmation UI show the user exactly which server they'd use. */
      if (host && host.length <= MAX_HOST_CHARS && !/[\s/\\?#@]/.test(host)) {
        if (Number.isInteger(port) && port > 0 && port <= 65535) {
          invite.signaling = {
            host,
            port,
            path: typeof s.t === 'string' && s.t.startsWith('/') ? s.t : '/',
            secure: s.e !== false,
          };
        }
      }
    }
  }
  return invite;
}

function parsePlain(params: URLSearchParams): InvitePayload | null {
  return build(params.get('room'), params.get('pwd') ?? params.get('password'));
}

/** Shared validation for both encodings. */
function build(rawRoom: unknown, rawPassword: unknown): InvitePayload | null {
  if (typeof rawRoom !== 'string' || typeof rawPassword !== 'string') return null;

  const roomId = rawRoom.trim();
  const password = rawPassword;

  if (!isValidRoomId(roomId)) return null;
  if (roomId.length > ROOM_ID_MAX_DIGITS) return null;
  /* Matching the join form's own rule keeps a malformed invite from
   * producing a session that could never have been created by hand. */
  if (password.length < PASSWORD_MIN_LENGTH || password.length > MAX_PASSWORD_CHARS) return null;

  return { roomId, password };
}

/* ── scrub ─────────────────────────────────────────────────── */

/**
 * Removes the invite from the address bar without adding a history entry.
 *
 * This replaces the *current* entry, so pressing Back cannot return to a
 * URL containing the password. It cannot un-record a visit the browser
 * already wrote to its history database, which is why the invite UI warns
 * that the link is a credential rather than pretending this erased it.
 *
 * `search` is preserved — the credentials are in the fragment, and
 * discarding unrelated query parameters would be a side effect nobody
 * asked for.
 */
export function clearInviteFromUrl(): void {
  try {
    const { pathname, search } = window.location;
    window.history.replaceState(null, document.title, `${pathname}${search}`);
  } catch {
    /* Non-fatal: a blocked replaceState must never stop the join flow. */
  }
}

/** True when the current location carries something on our invite route. */
export function hasInviteInUrl(): boolean {
  const hash = window.location.hash;
  return hash.startsWith(`#${INVITE_ROUTE}`);
}
