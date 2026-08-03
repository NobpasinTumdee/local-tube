import { create } from 'zustand';
import { useChatStore } from './useChatStore';
const MAX_EVENTS = 60;
/* ─────────────────────────────────────────────────────────────
 *  TEARDOWN BRIDGE
 * ─────────────────────────────────────────────────────────────
 *  webrtcService registers its destroyer here on startup. Keeping it in a
 *  plain module variable (rather than importing the service) means this
 *  store — and therefore the whole app — can be loaded without PeerJS ever
 *  being fetched, parsed or executed. Opt-in really means opt-in.
 * ───────────────────────────────────────────────────────────── */
let rtcTeardown = null;
export function registerRtcTeardown(fn) {
    rtcTeardown = fn;
}
const newEventId = () => globalThis.crypto?.randomUUID?.() ?? `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
/** State every session starts from, and that the kill switch restores. */
const CLEAN_SLATE = {
    status: 'disconnected',
    role: null,
    roomId: null,
    password: null,
    localPeerId: null,
    signalingServer: null,
    peers: [],
    /* Kept out of CLEAN_SLATE's reset targets on purpose — see disconnectAll. */
    transferProgress: {},
    broadcastTitle: null,
    broadcastViewers: [],
    activeStream: null,
    isReceivingBroadcast: false,
    broadcastMeta: null,
    lobbyOpen: false,
};
export const useWebRTCStore = create()((set, get) => ({
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
    beginSession: ({ role, roomId, password, displayName, signalingServer }) => set({
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
    sessionEstablished: (localPeerId) => set((s) => ({ localPeerId, status: s.status === 'connecting' ? 'connected' : s.status })),
    upsertPeer: (peer) => set((s) => {
        const i = s.peers.findIndex((p) => p.id === peer.id);
        if (i < 0)
            return { peers: [...s.peers, peer] };
        const peers = [...s.peers];
        peers[i] = { ...peers[i], ...peer };
        return { peers };
    }),
    patchPeer: (id, patch) => set((s) => ({ peers: s.peers.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    /*
     * Direct peers are ours and untouched; indirect ones are entirely the
     * host's to declare, so they are replaced wholesale rather than merged —
     * that way a peer the host dropped disappears here too.
     */
    applyRoster: (entries) => set((s) => {
        const directs = s.peers.filter((p) => p.direct);
        const known = new Set(directs.map((p) => p.id));
        const indirect = entries
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
    removePeer: (id) => set((s) => ({
        peers: s.peers.filter((p) => p.id !== id),
        broadcastViewers: s.broadcastViewers.filter((v) => v !== id),
        /* A departing broadcaster takes their stream with them. */
        ...(s.broadcastMeta?.peerId === id
            ? { activeStream: null, isReceivingBroadcast: false, broadcastMeta: null }
            : {}),
    })),
    upsertTransfer: (transfer) => set((s) => ({ transferProgress: { ...s.transferProgress, [transfer.id]: transfer } })),
    patchTransfer: (id, patch) => set((s) => {
        const cur = s.transferProgress[id];
        if (!cur)
            return {};
        return { transferProgress: { ...s.transferProgress, [id]: { ...cur, ...patch } } };
    }),
    dismissTransfer: (id) => set((s) => {
        const cur = s.transferProgress[id];
        if (!cur)
            return {};
        /* Drop the blob's last reference so the browser can reclaim the bytes. */
        if (cur.blobUrl)
            URL.revokeObjectURL(cur.blobUrl);
        const next = { ...s.transferProgress };
        delete next[id];
        return { transferProgress: next };
    }),
    setBroadcast: (title) => set((s) => ({
        broadcastTitle: title,
        broadcastViewers: title ? s.broadcastViewers : [],
        status: title ? 'broadcasting' : s.status === 'broadcasting' ? 'connected' : s.status,
    })),
    addViewer: (peerId) => set((s) => s.broadcastViewers.includes(peerId)
        ? {}
        : { broadcastViewers: [...s.broadcastViewers, peerId] }),
    removeViewer: (peerId) => set((s) => ({ broadcastViewers: s.broadcastViewers.filter((v) => v !== peerId) })),
    /*
     * Announced but not yet flowing. Keeping this distinct from
     * setActiveStream is what lets the lobby say "connecting to stream…"
     * rather than silently sitting on the waiting screen while ICE works.
     */
    announceIncomingBroadcast: (meta) => set({ broadcastMeta: meta, isReceivingBroadcast: false, lobbyOpen: true }),
    setActiveStream: (stream, meta) => set({
        activeStream: stream,
        broadcastMeta: meta,
        isReceivingBroadcast: true,
        /* Surface the viewer without the user having to hunt for it. */
        lobbyOpen: true,
    }),
    clearIncomingBroadcast: () => set({ activeStream: null, isReceivingBroadcast: false, broadcastMeta: null }),
    setLobbyOpen: (open) => set({ lobbyOpen: open }),
    logEvent: (level, message) => set((s) => ({
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
        }
        catch (err) {
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
                }
                catch {
                    /* already revoked — fine */
                }
            }
        }
        /* 2b ─ Wipe the chat transcript and revoke every attachment URL.
         *      Chat is the other place this tab holds peer-supplied bytes, and
         *      "kill switch" has to mean all of them — not just file transfers. */
        try {
            useChatStore.getState().clearAllChat();
        }
        catch (err) {
            console.error('[LocalTube P2P] chat wipe error (continuing)', err);
        }
        /* 3 ─ Stop any inbound media tracks we still hold a handle on. */
        if (activeStream) {
            for (const track of activeStream.getTracks()) {
                try {
                    track.stop();
                }
                catch {
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
                { id: newEventId(), at: Date.now(), level: 'danger', message: reason },
                ...s.events,
            ].slice(0, MAX_EVENTS),
        }));
    },
}));
/* ── selectors ─────────────────────────────────────────────── */
export const selectAuthenticatedPeers = (s) => s.peers.filter((p) => p.authenticated);
/**
 * Peers we hold an actual connection to. Anything that moves bulk bytes
 * (file push, media calls) must use this rather than the full list, which
 * also contains host-published peers reachable only via chat relay.
 */
export const selectDirectPeers = (s) => s.peers.filter((p) => p.authenticated && p.direct);
export const selectPendingIncoming = (s) => Object.values(s.transferProgress).filter((t) => t.direction === 'incoming' && t.status === 'awaiting-consent');
export const selectActiveTransfers = (s) => Object.values(s.transferProgress).filter((t) => t.status === 'transferring');
/** True while the app holds any P2P resource at all. */
export const selectIsLive = (s) => s.status !== 'disconnected';
/** A broadcast was announced but its media hasn't negotiated yet. */
export const selectBroadcastPending = (s) => !!s.broadcastMeta && !s.isReceivingBroadcast;
