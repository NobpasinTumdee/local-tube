import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Loader2,
  Minimize2,
  RadioTower,
  Square,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useWebRTCStore, selectDirectPeers } from '../store/useWebRTCStore';
import {
  captureLiveStream,
  getActiveVideoElement,
  isCapturable,
  subscribeActiveVideo,
} from '../services/mediaElementRegistry';
import { startBroadcast, stopBroadcast } from '../services/webrtcService';

/* ─────────────────────────────────────────────────────────────
 *  LIVE BROADCAST
 * ─────────────────────────────────────────────────────────────
 *  • BroadcastControls — host side. Captures the <video> the user is
 *    already watching and pushes frames to verified peers. The file never
 *    moves; a viewer can watch but never obtains a copy.
 *
 *  • BroadcastView — viewer side, FULLSCREEN. WatchPartyLobby is the
 *    primary viewer; this takes over only when the lobby has been closed,
 *    so dismissing the room UI never loses the stream. Exactly one of the
 *    two is ever on screen.
 * ───────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
 *  HOST CONTROLS
 * ═══════════════════════════════════════════════════════════════ */

interface ControlsProps {
  /** Renders as a single grid-cell button (used inside the P2P panel). */
  compact?: boolean;
  /** Called after going live, so a containing panel can get out of the way. */
  onNavigate?: () => void;
}

/**
 * Everything needed to start or stop a broadcast, shared by the panel
 * controls and the in-player button so the two can never diverge on what
 * "ready" means or how failures are reported.
 */
function useBroadcastControl(onNavigate?: () => void) {
  /* Media is a real peer connection, not something the host can relay. */
  const peers = useWebRTCStore(selectDirectPeers);
  const broadcastTitle = useWebRTCStore((s) => s.broadcastTitle);
  const viewers = useWebRTCStore((s) => s.broadcastViewers);
  const logEvent = useWebRTCStore((s) => s.logEvent);
  const videos = useStore((s) => s.videos);
  const currentVideoId = useStore((s) => s.currentVideoId);

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(() => getActiveVideoElement());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeActiveVideo(setVideoEl), []);

  /*
   * readyState changes without notifying React, so poll lightly while idle
   * rather than wiring listeners onto an element we don't own.
   *
   * Gated on having peers because this hook is now also mounted by the
   * in-player button, which is on screen for every video. Solo viewing —
   * the overwhelmingly common case — must not pay for a timer that exists
   * only to enable a button that isn't rendered.
   */
  const [, forceTick] = useState(0);
  const peerCount = peers.length;
  useEffect(() => {
    if (broadcastTitle || peerCount === 0) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [broadcastTitle, peerCount]);

  const title = useMemo(
    () => videos.find((v) => v.id === currentVideoId)?.title ?? 'Live broadcast',
    [videos, currentVideoId],
  );

  const live = !!broadcastTitle;
  const ready = isCapturable(videoEl);
  const canStart = ready && peers.length > 0 && !busy;

  async function go() {
    setError(null);
    setBusy(true);
    try {
      const el = getActiveVideoElement();
      if (!isCapturable(el)) throw new Error('Play a video first — there is nothing to capture yet.');
      /*
       * captureLiveStream resumes playback if paused and verifies the
       * stream actually carries tracks. Broadcasting a track-less stream
       * negotiates "successfully" but delivers nothing, which is exactly
       * the silent failure this replaces.
       */
      const stream = await captureLiveStream(el);
      startBroadcast(stream, title);
      onNavigate?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start the broadcast.';
      setError(message);
      logEvent('warn', message);
    } finally {
      setBusy(false);
    }
  }

  const reason = !ready
    ? 'Start playing a video to broadcast it'
    : peers.length === 0
      ? 'No verified peers to broadcast to'
      : `Broadcast "${title}" to ${peers.length} peer${peers.length === 1 ? '' : 's'}`;

  return { peers, viewers, live, ready, canStart, busy, error, reason, title, go };
}

export function BroadcastControls({ compact = false, onNavigate }: ControlsProps) {
  const { viewers, live, canStart, busy, error, reason, go } = useBroadcastControl(onNavigate);

  if (compact) {
    return (
      <div className="contents">
        {live ? (
          <button
            onClick={stopBroadcast}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white transition hover:bg-red-500"
            title={`Live to ${viewers.length} viewer(s)`}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop live ({viewers.length})
          </button>
        ) : (
          <button
            onClick={go}
            disabled={!canStart}
            title={reason}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-content/[0.06] text-sm font-semibold text-content transition hover:bg-content/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadioTower className="h-4 w-4" />}
            Go live
          </button>
        )}
        {error && (
          <p className="col-span-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-500">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-content/10 bg-content/[0.03] p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50">
        <RadioTower className="h-3.5 w-3.5" />
        Live broadcast
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-content/50">
        Streams the video you're watching in real time. Viewers see frames, not the file — nothing is
        copied to their disk.
      </p>
      {live ? (
        <button
          onClick={stopBroadcast}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white transition hover:bg-red-500"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          Stop broadcasting ({viewers.length} watching)
        </button>
      ) : (
        <button
          onClick={go}
          disabled={!canStart}
          title={reason}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadioTower className="h-4 w-4" />}
          Go live
        </button>
      )}
      {!canStart && !live && !busy && <p className="mt-2 text-center text-xs text-content/40">{reason}</p>}
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  IN-PLAYER GO LIVE BUTTON
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Sits in the player's control bar next to Theater / Ambient.
 *
 * It renders NOTHING unless at least one peer has completed the password
 * handshake. Solo viewing — which is what LocalTube is most of the time —
 * therefore looks exactly as it did before this feature existed, and the
 * button can never be the thing that reveals a P2P session is possible.
 */
export function PlayerGoLiveButton() {
  const { peers, viewers, live, canStart, busy, error, reason, go } = useBroadcastControl();

  if (peers.length === 0) return null;

  if (live) {
    return (
      <button
        onClick={stopBroadcast}
        className="flex h-9 items-center gap-1.5 rounded-full bg-red-600 px-3 text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500"
        title={`Live to ${viewers.length} viewer${viewers.length === 1 ? '' : 's'} — click to stop`}
        aria-label="Stop broadcasting"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
        <span className="text-[11px] font-black uppercase tracking-wider">Live</span>
        {viewers.length > 0 && (
          <span className="text-[11px] font-bold tabular-nums opacity-80">{viewers.length}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={go}
      disabled={!canStart}
      title={error ?? reason}
      aria-label="Go live"
      className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-content/10 disabled:cursor-not-allowed disabled:opacity-40 ${
        error ? 'text-amber-500' : 'text-content/70 hover:text-content'
      }`}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <RadioTower className="h-5 w-5" />}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  VIEWER (fullscreen fallback)
 * ═══════════════════════════════════════════════════════════════ */

export default function BroadcastView() {
  const activeStream = useWebRTCStore((s) => s.activeStream);
  const isReceiving = useWebRTCStore((s) => s.isReceivingBroadcast);
  const meta = useWebRTCStore((s) => s.broadcastMeta);
  const lobbyOpen = useWebRTCStore((s) => s.lobbyOpen);
  const setLobbyOpen = useWebRTCStore((s) => s.setLobbyOpen);
  const disconnectAll = useWebRTCStore((s) => s.disconnectAll);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [needsGesture, setNeedsGesture] = useState(false);

  /* The lobby owns the viewer whenever it's open. */
  const visible = isReceiving && !lobbyOpen;

  /*
   * A MediaStream cannot be assigned to `src` — it has no URL, and
   * stringifying it yields "[object MediaStream]", so the element shows
   * nothing at all. It must be attached imperatively to the DOM node via
   * srcObject, which means a ref + an effect keyed on the stream.
   */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!activeStream || !visible) {
      el.srcObject = null;
      return;
    }
    if (el.srcObject === activeStream) return;

    el.srcObject = activeStream;
    el.muted = muted;
    el.play().then(
      () => setNeedsGesture(false),
      () => setNeedsGesture(true),
    );
  }, [activeStream, visible, muted]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted, visible]);

  const unmuteAndSync = () => {
    const el = videoRef.current;
    setMuted(false);
    if (!el) return;
    el.muted = false;
    el.play().then(
      () => setNeedsGesture(false),
      () => setNeedsGesture(true),
    );
  };

  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex flex-col bg-black">
      {/* bar */}
      <div className="flex items-center gap-2 bg-black/70 px-4 py-2">
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{meta?.title}</p>
          <p className="truncate text-xs text-white/50">from {meta?.peerName}</p>
        </div>

        <button
          onClick={() => setMuted((m) => !m)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setLobbyOpen(true)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20"
          title="Back to the watch party room"
        >
          <Users className="h-3.5 w-3.5" />
          Room
        </button>
        <button
          onClick={() => setLobbyOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Exit fullscreen"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => disconnectAll('Left the broadcast (kill switch)')}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-red-600/90 px-2.5 text-xs font-bold text-white transition hover:bg-red-500"
          title="Leave and destroy every P2P connection"
        >
          <X className="h-3.5 w-3.5" />
          Leave
        </button>
      </div>

      {/* stream */}
      <div className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          controls={false}
          className="h-full w-full object-contain"
          onClick={() => (muted ? unmuteAndSync() : setMuted(true))}
        />
        {(muted || needsGesture) && (
          <button
            onClick={unmuteAndSync}
            className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-2xl shadow-primary/40 transition hover:brightness-110 active:scale-[0.98]"
          >
            <VolumeX className="h-4 w-4" />
            Tap to Unmute &amp; Sync
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
