import { useWebRTCStore, registerRtcTeardown, } from '../store/useWebRTCStore';
import { AUTH_TIMEOUT_MS, MAX_AUTH_ATTEMPTS, PROTOCOL_VERSION, assertSecureContext, clearRoomKeyCache, computeProof, decodeMessage, deriveRoomKey, encodeMessage, frameChunk, isPreAuthMessage, isValidNonce, makeNonce, negotiateChunkSize, parseChunk, peerIdForRoom, randomHex, safeMimeFor, sanitizeDisplayName, sanitizeFilename, timingSafeEqual, validateFileOffer, } from './p2pProtocol';
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
const DRAIN_TIMEOUT_MS = 15000;
/** Progress commits are throttled — a 2 GB file is ~130k chunks. */
const PROGRESS_INTERVAL_MS = 120;
/** The single live session. Null until the user opts in. */
let session = null;
/** Remote ids locked out after repeated wrong passwords (this session only). */
const bannedPeers = new Map();
let unloadHandler = null;
/* ── store shortcuts ───────────────────────────────────────── */
const store = () => useWebRTCStore.getState();
const log = (level, message) => store().logEvent(level, message);
/**
 * Boots PeerJS and claims (host) or dials (guest) the room. Resolves once
 * the signaling socket is open — peers arrive asynchronously afterwards.
 */
export async function startSession(opts) {
    if (session)
        throw new Error('A P2P session is already running. Disconnect first.');
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
        debug: 0,
        ...(opts.signaling
            ? {
                host: opts.signaling.host,
                port: opts.signaling.port,
                path: opts.signaling.path ?? '/',
                secure: opts.signaling.secure ?? true,
            }
            : {}),
    });
    session = {
        peer,
        role: opts.role,
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
    await new Promise((resolve, reject) => {
        const onOpen = (id) => {
            cleanup();
            store().sessionEstablished(id);
            log('info', opts.role === 'host' ? `Room ${opts.roomId} opened.` : `Dialling room ${opts.roomId}…`);
            resolve();
        };
        const onError = (err) => {
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
function attachPeerHandlers(peer, role) {
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
            }
            catch {
                /* ignore */
            }
            return;
        }
        acceptBroadcastCall(call, st);
    });
    peer.on('error', (err) => {
        const message = friendlyPeerError(err);
        store().setError(message);
        log('warn', message);
        /* A dead room id or a broken socket means the session can't function. */
        if (err.type === 'peer-unavailable' || err.type === 'unavailable-id') {
            store().disconnectAll(message);
        }
    });
    peer.on('disconnected', () => {
        if (!session || session.destroyed)
            return;
        log('warn', 'Lost the signaling server. Existing peer connections are unaffected.');
        try {
            peer.reconnect();
        }
        catch {
            /* ignore — nothing more we can do */
        }
    });
    peer.on('close', () => {
        if (session && !session.destroyed)
            store().disconnectAll('Signaling connection closed.');
    });
}
function dialHost() {
    if (!session)
        return;
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
export function destroySession() {
    const s = session;
    session = null;
    registerRtcTeardown(null);
    if (unloadHandler) {
        window.removeEventListener('pagehide', unloadHandler);
        unloadHandler = null;
    }
    if (!s)
        return;
    s.destroyed = true;
    /* 1 ─ Data channels: cancel transfers, say goodbye, close. */
    for (const st of s.conns.values()) {
        if (st.authTimer)
            clearTimeout(st.authTimer);
        for (const out of st.outgoing.values())
            out.cancelled = true;
        /* Drop half-received buffers so the bytes are collectable immediately. */
        for (const inc of st.incoming.values())
            inc.parts.length = 0;
        st.incoming.clear();
        st.outgoing.clear();
        try {
            if (st.conn.open)
                st.conn.send(encodeMessage({ t: 'bye' }));
        }
        catch {
            /* ignore */
        }
        safeClose(st.conn);
    }
    s.conns.clear();
    /* 2 ─ Media connections, both directions. */
    for (const call of s.calls.values()) {
        try {
            call.close();
        }
        catch {
            /* ignore */
        }
    }
    s.calls.clear();
    if (s.incomingCall) {
        try {
            s.incomingCall.close();
        }
        catch {
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
            }
            catch {
                /* ignore */
            }
        }
        s.localStream = null;
    }
    /* 4 ─ Kill the signaling socket and release the room id. */
    try {
        s.peer.destroy();
    }
    catch {
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
function setupConnection(conn, role) {
    if (!session)
        return;
    const st = {
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
    };
    session.conns.set(conn.peer, st);
    store().upsertPeer({
        id: conn.peer,
        name: role === 'host' ? 'Joining…' : 'Room host',
        authenticated: false,
        joinedAt: Date.now(),
        failedAttempts: 0,
    });
    /* A peer that stalls mid-handshake is a peer that never authenticates. */
    st.authTimer = setTimeout(() => {
        if (!st.authenticated) {
            log('danger', `Handshake timed out for ${shortId(conn.peer)} — connection dropped.`);
            dropConnection(st, 'Handshake timed out');
        }
    }, AUTH_TIMEOUT_MS);
    conn.on('open', () => {
        if (!session)
            return;
        if (role === 'host') {
            st.hostNonce = makeNonce();
            send(st, { t: 'hello', v: PROTOCOL_VERSION, nonce: st.hostNonce });
        }
        /* The guest stays silent until it receives the host's challenge. */
    });
    conn.on('data', (data) => {
        try {
            handleData(st, data);
        }
        catch (err) {
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
function handleData(st, data) {
    if (!session)
        return;
    /* ── Binary frame: a file chunk. Only ever legal post-auth. ── */
    if (data instanceof ArrayBuffer) {
        if (!st.authenticated)
            throw new Error('Binary data before authentication');
        handleChunk(st, data);
        return;
    }
    if (ArrayBuffer.isView(data)) {
        if (!st.authenticated)
            throw new Error('Binary data before authentication');
        /* Copy out of the view's backing store (which may be shared) so the
         * chunk we keep is a plain, exclusively-owned ArrayBuffer. */
        const view = data;
        const copy = new Uint8Array(view.byteLength);
        copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        handleChunk(st, copy.buffer);
        return;
    }
    /* ── Control frame ── */
    const msg = decodeMessage(data);
    if (!msg)
        throw new Error('Undecodable frame');
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
             * which is still checked against the authenticated peer set. */
            st.broadcastTitle = sanitizeDisplayName(msg.title) || 'Live broadcast';
            log('info', `${st.name} started broadcasting "${st.broadcastTitle}".`);
            break;
        case 'bcast-stop':
            endIncomingBroadcast(st.conn.peer);
            break;
        case 'bye':
            dropConnection(st, 'Peer left');
            break;
        default:
            throw new Error('Unknown message type');
    }
}
/* ── guest side ── */
function onHello(st, msg) {
    if (st.role !== 'guest')
        throw new Error('hello from a guest');
    if (msg.v !== PROTOCOL_VERSION) {
        store().setError(`Version mismatch: the host runs protocol v${msg.v}, this build speaks v${PROTOCOL_VERSION}.`);
        dropConnection(st, 'Protocol version mismatch');
        return;
    }
    if (!isValidNonce(msg.nonce))
        throw new Error('Malformed challenge');
    st.hostNonce = msg.nonce;
    st.guestNonce = makeNonce();
    void (async () => {
        if (!session)
            return;
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
function onAuth(st, msg) {
    if (st.role !== 'host')
        throw new Error('auth from a host');
    if (st.authenticated)
        throw new Error('Duplicate auth');
    if (msg.v !== PROTOCOL_VERSION) {
        sendAuthFail(st, 'Protocol version mismatch');
        return;
    }
    if (!isValidNonce(msg.nonce) || typeof msg.proof !== 'string')
        throw new Error('Malformed auth');
    st.guestNonce = msg.nonce;
    void (async () => {
        if (!session)
            return;
        const expected = await computeProof(session.roomKey, 'guest->host', st.hostNonce, st.guestNonce);
        /* Constant-time: never leak how much of the proof was correct. */
        if (!timingSafeEqual(expected, msg.proof)) {
            const attempts = (bannedPeers.get(st.conn.peer) ?? 0) + 1;
            bannedPeers.set(st.conn.peer, attempts);
            store().patchPeer(st.conn.peer, { failedAttempts: attempts });
            log('danger', `Wrong password from ${shortId(st.conn.peer)} (attempt ${attempts}/${MAX_AUTH_ATTEMPTS}) — connection dropped.`);
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
    })();
}
/* ── guest side ── */
function onAuthOk(st, msg) {
    if (st.role !== 'guest')
        throw new Error('auth-ok from a guest');
    if (st.authenticated)
        throw new Error('Duplicate auth-ok');
    if (typeof msg.proof !== 'string')
        throw new Error('Malformed auth-ok');
    void (async () => {
        if (!session)
            return;
        const expected = await computeProof(session.roomKey, 'host->guest', st.hostNonce, st.guestNonce);
        if (!timingSafeEqual(expected, msg.proof)) {
            /*
             * We knew the password but the other side could not prove it knows it
             * too. Something is squatting this room id — get off it immediately
             * and tell the user plainly.
             */
            log('danger', 'The room could not prove it knows the password — possible impostor. Disconnected.');
            store().setError('This room failed verification: it does not know the password you entered. Someone may be squatting the room ID. No data was sent.');
            dropConnection(st, 'Host failed verification');
            store().disconnectAll('Aborted: room failed verification');
            return;
        }
        st.name = sanitizeDisplayName(msg.name);
        markAuthenticated(st);
    })();
}
function markAuthenticated(st) {
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
    });
    bannedPeers.delete(st.conn.peer);
    store().setStatus(store().broadcastTitle ? 'broadcasting' : 'connected');
    log('info', `${st.name} authenticated (${shortId(st.conn.peer)}).`);
    /* Late joiner during a live broadcast — bring them in. */
    if (session?.localStream && store().broadcastTitle) {
        callPeer(st, store().broadcastTitle ?? 'Live');
    }
}
function sendAuthFail(st, reason) {
    try {
        if (st.conn.open)
            st.conn.send(encodeMessage({ t: 'auth-fail', reason }));
    }
    catch {
        /* ignore */
    }
    /* Requirement: authentication failure drops the connection immediately.
     * A microtask of slack lets the reason frame reach the wire first. */
    queueMicrotask(() => dropConnection(st, reason));
}
function dropConnection(st, reason) {
    if (st.authTimer) {
        clearTimeout(st.authTimer);
        st.authTimer = null;
    }
    for (const out of st.outgoing.values())
        out.cancelled = true;
    safeClose(st.conn);
    handleConnectionClosed(st, reason);
}
function handleConnectionClosed(st, reason) {
    if (!session)
        return;
    if (!session.conns.has(st.conn.peer))
        return; // already reaped
    session.conns.delete(st.conn.peer);
    if (st.authTimer)
        clearTimeout(st.authTimer);
    /* Fail every transfer that was still moving, in both directions. */
    const transfers = store().transferProgress;
    for (const t of Object.values(transfers)) {
        if (t.peerId !== st.conn.peer)
            continue;
        if (t.status === 'transferring' || t.status === 'awaiting-consent') {
            store().patchTransfer(t.id, { status: 'failed', error: reason ?? 'Peer disconnected' });
        }
    }
    for (const inc of st.incoming.values())
        inc.parts.length = 0;
    st.incoming.clear();
    st.outgoing.clear();
    /* Hang up any media we had with them. */
    const call = session.calls.get(st.conn.peer);
    if (call) {
        try {
            call.close();
        }
        catch {
            /* ignore */
        }
        session.calls.delete(st.conn.peer);
    }
    endIncomingBroadcast(st.conn.peer);
    store().removePeer(st.conn.peer);
    if (st.authenticated)
        log('info', `${st.name} left${reason ? ` (${reason})` : ''}.`);
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
export function sendFileToPeers(file, peerIds) {
    if (!session)
        throw new Error('No P2P session is running.');
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
        const transfer = {
            id,
            seq,
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
function onFileAccept(st, id) {
    const transfer = st.outgoing.get(id);
    if (!transfer)
        return;
    store().patchTransfer(id, { status: 'transferring' });
    void pump(st, transfer);
}
function onFileDecline(st, id) {
    const transfer = st.outgoing.get(id);
    if (!transfer)
        return;
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
async function pump(st, transfer) {
    /* One transfer at a time per connection keeps the chunk stream
     * unambiguous and stops N parallel files starving each other. */
    while (st.pumping) {
        await new Promise((r) => setTimeout(r, 50));
        if (transfer.cancelled || !session)
            return;
    }
    st.pumping = true;
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
            if (transfer.cancelled || !st.conn.open)
                throw new Error('Cancelled');
            st.conn.send(frameChunk(transfer.seq, index, buf));
            transfer.sent += buf.byteLength;
            const now = Date.now();
            if (now - lastCommit > PROGRESS_INTERVAL_MS || index === transfer.chunks - 1) {
                lastCommit = now;
                store().patchTransfer(transfer.id, { transferred: transfer.sent });
            }
        }
        send(st, { t: 'file-done', id: transfer.id, size: transfer.size });
        store().patchTransfer(transfer.id, { transferred: transfer.size, status: 'completed' });
        log('info', `Sent "${transfer.filename}" to ${st.name}.`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Transfer failed';
        store().patchTransfer(transfer.id, {
            status: transfer.cancelled ? 'cancelled' : 'failed',
            error: message,
        });
        if (st.conn.open) {
            send(st, { t: 'file-abort', id: transfer.id, reason: message });
        }
    }
    finally {
        st.outgoing.delete(transfer.id);
        st.pumping = false;
    }
}
/**
 * Blocks while the send buffer is full. Without this, a fast disk and a
 * slow link make the sender's memory grow without bound — the classic
 * DataChannel footgun.
 */
function waitForDrain(conn) {
    const dc = conn.dataChannel;
    if (!dc || dc.bufferedAmount < SEND_HIGH_WATER)
        return Promise.resolve();
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled)
                return;
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
export function cancelTransfer(id) {
    if (!session)
        return;
    for (const st of session.conns.values()) {
        const out = st.outgoing.get(id);
        if (out) {
            out.cancelled = true;
            store().patchTransfer(id, { status: 'cancelled', error: 'Cancelled' });
            return;
        }
        for (const [seq, inc] of st.incoming) {
            if (inc.id !== id)
                continue;
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
function onFileOffer(st, msg) {
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
export function acceptIncomingFile(id) {
    if (!session)
        return;
    for (const st of session.conns.values()) {
        for (const inc of st.incoming.values()) {
            if (inc.id !== id || inc.accepted)
                continue;
            inc.accepted = true;
            store().patchTransfer(id, { status: 'transferring' });
            send(st, { t: 'file-accept', id });
            return;
        }
    }
}
export function declineIncomingFile(id) {
    if (!session)
        return;
    for (const st of session.conns.values()) {
        for (const [seq, inc] of st.incoming) {
            if (inc.id !== id)
                continue;
            inc.parts.length = 0;
            st.incoming.delete(seq);
            send(st, { t: 'file-decline', id, reason: 'Declined' });
            store().patchTransfer(id, { status: 'declined', error: 'You declined this file' });
            return;
        }
    }
}
function handleChunk(st, buf) {
    const parsed = parseChunk(buf);
    if (!parsed)
        throw new Error('Malformed chunk frame');
    const inc = st.incoming.get(parsed.seq);
    /* A chunk for an unknown, declined or already-finished transfer is not
     * something a well-behaved peer sends. */
    if (!inc)
        throw new Error('Chunk for an unknown transfer');
    if (!inc.accepted)
        throw new Error('Chunk before the transfer was accepted');
    /* Ordered+reliable SCTP guarantees sequence; verifying it anyway means a
     * misbehaving peer can't scramble the reassembly. */
    if (parsed.index !== inc.nextIndex)
        throw new Error('Out-of-order chunk');
    if (inc.received + parsed.payload.byteLength > inc.size)
        throw new Error('Transfer exceeded its declared size');
    inc.parts.push(parsed.payload);
    inc.received += parsed.payload.byteLength;
    inc.nextIndex++;
    const now = Date.now();
    if (now - inc.lastCommit > PROGRESS_INTERVAL_MS || inc.nextIndex === inc.chunks) {
        inc.lastCommit = now;
        store().patchTransfer(inc.id, { transferred: inc.received });
    }
}
function onFileDone(st, id, claimedSize) {
    for (const [seq, inc] of st.incoming) {
        if (inc.id !== id)
            continue;
        st.incoming.delete(seq);
        /* Cross-check what arrived against what was promised, twice over. */
        if (inc.received !== inc.size || inc.received !== claimedSize || inc.nextIndex !== inc.chunks) {
            inc.parts.length = 0;
            store().patchTransfer(id, {
                status: 'failed',
                error: `Incomplete transfer (${inc.received} of ${inc.size} bytes)`,
            });
            log('warn', `"${inc.filename}" from ${st.name} was incomplete and was discarded.`);
            return;
        }
        /* MIME is ours, not theirs — a peer can never get a text/html blob URL
         * minted in this origin. */
        const blob = new Blob(inc.parts, { type: inc.mime });
        inc.parts.length = 0; // release the chunk array; the Blob owns the bytes now
        const blobUrl = URL.createObjectURL(blob);
        store().patchTransfer(id, {
            status: 'completed',
            transferred: inc.size,
            blobUrl,
        });
        log('info', `Received "${inc.filename}" from ${st.name}.`);
        return;
    }
}
function onFileAbort(st, id, reason) {
    for (const [seq, inc] of st.incoming) {
        if (inc.id !== id)
            continue;
        inc.parts.length = 0;
        st.incoming.delete(seq);
    }
    const out = st.outgoing.get(id);
    if (out) {
        out.cancelled = true;
        st.outgoing.delete(id);
    }
    store().patchTransfer(id, { status: 'failed', error: sanitizeDisplayName(reason) });
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
export function startBroadcast(stream, title) {
    if (!session)
        throw new Error('No P2P session is running.');
    if (session.localStream)
        stopBroadcast();
    const authenticated = [...session.conns.values()].filter((st) => st.authenticated);
    if (authenticated.length === 0)
        throw new Error('No authenticated peers to broadcast to.');
    session.localStream = stream;
    const safeTitle = sanitizeDisplayName(title) || 'Live';
    store().setBroadcast(safeTitle);
    for (const st of authenticated)
        callPeer(st, safeTitle);
    log('info', `Broadcasting "${safeTitle}" to ${authenticated.length} peer(s).`);
}
function callPeer(st, title) {
    if (!session?.localStream)
        return;
    send(st, { t: 'bcast-start', title });
    try {
        const call = session.peer.call(st.conn.peer, session.localStream);
        session.calls.set(st.conn.peer, call);
        store().addViewer(st.conn.peer);
        call.on('close', () => {
            session?.calls.delete(st.conn.peer);
            store().removeViewer(st.conn.peer);
        });
        call.on('error', (err) => log('warn', `Stream to ${st.name} failed: ${err.message}`));
    }
    catch (err) {
        log('warn', `Could not start the stream to ${st.name}: ${err.message}`);
    }
}
export function stopBroadcast() {
    if (!session)
        return;
    for (const [peerId, call] of session.calls) {
        try {
            call.close();
        }
        catch {
            /* ignore */
        }
        const st = session.conns.get(peerId);
        if (st?.authenticated)
            send(st, { t: 'bcast-stop' });
    }
    session.calls.clear();
    if (session.localStream) {
        /* Stops the capture, not the user's playback. */
        for (const track of session.localStream.getTracks()) {
            try {
                track.stop();
            }
            catch {
                /* ignore */
            }
        }
        session.localStream = null;
    }
    store().setBroadcast(null);
    log('info', 'Broadcast ended.');
}
function acceptBroadcastCall(call, st) {
    if (!session)
        return;
    /* Answer with no local stream: this is receive-only. We never hand a
     * camera, a mic or anything else back. */
    call.answer();
    session.incomingCall = call;
    call.on('stream', (stream) => {
        store().setIncomingBroadcast({
            peerId: call.peer,
            peerName: st.name,
            title: st.broadcastTitle,
            stream,
        });
        log('info', `Watching ${st.name}'s live broadcast.`);
    });
    call.on('close', () => endIncomingBroadcast(call.peer));
    call.on('error', () => endIncomingBroadcast(call.peer));
}
function endIncomingBroadcast(peerId) {
    const current = store().incomingBroadcast;
    if (!current || current.peerId !== peerId)
        return;
    for (const track of current.stream.getTracks()) {
        try {
            track.stop();
        }
        catch {
            /* ignore */
        }
    }
    store().setIncomingBroadcast(null);
    if (session?.incomingCall?.peer === peerId)
        session.incomingCall = null;
    log('info', 'The broadcast ended.');
}
/* ─────────────────────────────────────────────────────────────
 *  HELPERS
 * ───────────────────────────────────────────────────────────── */
function send(st, msg) {
    if (!st.conn.open)
        return;
    try {
        st.conn.send(encodeMessage(msg));
    }
    catch (err) {
        log('warn', `Failed to send "${msg.t}" to ${st.name}: ${err.message}`);
    }
}
function safeClose(conn) {
    try {
        conn.close();
    }
    catch {
        /* ignore */
    }
}
/** Peer ids are long and namespaced — show the tail in logs and UI. */
export function shortId(peerId) {
    return peerId.length <= 10 ? peerId : `…${peerId.slice(-8)}`;
}
function friendlyPeerError(err, opts) {
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
