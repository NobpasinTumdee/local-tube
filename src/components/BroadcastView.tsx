import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Maximize2,
  Minimize2,
  RadioTower,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useWebRTCStore, selectAuthenticatedPeers } from '../store/useWebRTCStore';
import {
  captureVideoStream,
  getActiveVideoElement,
  isCapturable,
  subscribeActiveVideo,
} from '../services/mediaElementRegistry';
import { startBroadcast, stopBroadcast } from '../services/webrtcService';

/* ─────────────────────────────────────────────────────────────
 *  LIVE BROADCAST
 * ─────────────────────────────────────────────────────────────
 *  Two halves of one feature:
 *
 *  • BroadcastControls — host side. Grabs the live pixels off the <video>
 *    element the user is already watching with captureStream() and pushes
 *    them to authenticated peers. The file itself never moves; only frames
 *    do, so a viewer can watch but never obtains a copy.
 *
 *  • BroadcastView — viewer side. Renders whatever authenticated stream
 *    arrived. It is receive-only: we answer the call with no stream of our
 *    own, so no camera, microphone or screen is ever offered back.
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

export function BroadcastControls({ compact = false, onNavigate }: ControlsProps) {
  const peers = useWebRTCStore(selectAuthenticatedPeers);
  const broadcastTitle = useWebRTCStore((s) => s.broadcastTitle);
  const viewers = useWebRTCStore((s) => s.broadcastViewers);
  const logEvent = useWebRTCStore((s) => s.logEvent);
  const videos = useStore((s) => s.videos);
  const currentVideoId = useStore((s) => s.currentVideoId);

  /* Track the live player element so the button enables/disables itself. */
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(() => getActiveVideoElement());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeActiveVideo(setVideoEl), []);

  /*
   * readyState changes without re-rendering React, so poll lightly while
   * the panel is open rather than wiring listeners onto a foreign element.
   */
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (broadcastTitle) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [broadcastTitle]);

  const title = useMemo(
    () => videos.find((v) => v.id === currentVideoId)?.title ?? 'Live broadcast',
    [videos, currentVideoId],
  );

  const live = !!broadcastTitle;
  const ready = isCapturable(videoEl);
  const canStart = ready && peers.length > 0;

  function go() {
    setError(null);
    try {
      const el = getActiveVideoElement();
      if (!isCapturable(el)) throw new Error('Play a video first — there is nothing to capture yet.');
      /* Live frames + audio straight off the element the user is watching. */
      startBroadcast(captureVideoStream(el), title);
      onNavigate?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start the broadcast.';
      setError(message);
      logEvent('warn', message);
    }
  }

  const reason = !ready
    ? 'Start playing a video to broadcast it'
    : peers.length === 0
      ? 'No verified peers to broadcast to'
      : `Broadcast "${title}" to ${peers.length} peer${peers.length === 1 ? '' : 's'}`;

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
            <RadioTower className="h-4 w-4" />
            Go live
          </button>
        )}
        {error && (
          <p className="col-span-2 flex items-center gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
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
          <RadioTower className="h-4 w-4" />
          Go live
        </button>
      )}
      {!canStart && !live && <p className="mt-2 text-center text-xs text-content/40">{reason}</p>}
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  VIEWER
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Floating player for an incoming broadcast. Mounted app-wide; renders
 * nothing at all unless an authenticated peer is actually streaming.
 */
export default function BroadcastView() {
  const incoming = useWebRTCStore((s) => s.incomingBroadcast);
  const disconnectAll = useWebRTCStore((s) => s.disconnectAll);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [expanded, setExpanded] = useState(true);
  /* Browsers block autoplay with sound; start muted and let the user opt in. */
  const [muted, setMuted] = useState(true);
  const [waiting, setWaiting] = useState(true);

  /*
   * MediaStream is attached via srcObject, never via a URL. It is live —
   * there is no buffer to seek, which is exactly what keeps latency at
   * WebRTC's floor rather than a player's.
   */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !incoming) return;
    el.srcObject = incoming.stream;
    el.play().catch(() => {
      /* Autoplay refused — the poster/unmute affordance covers it. */
    });
    return () => {
      el.srcObject = null;
    };
  }, [incoming]);

  useEffect(() => {
    if (!incoming) return;
    setWaiting(incoming.stream.getVideoTracks().length === 0);
  }, [incoming]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted, incoming]);

  if (!incoming) return null;

  return createPortal(
    <div
      className={
        expanded
          ? 'fixed inset-0 z-[300] flex flex-col bg-black/95 backdrop-blur-sm'
          : 'fixed bottom-5 right-5 z-[300] flex w-[380px] flex-col overflow-hidden rounded-xl border border-content/10 bg-surface shadow-2xl shadow-black/60'
      }
    >
      {/* bar */}
      <div
        className={`flex items-center gap-2 px-3 py-2 ${
          expanded ? 'bg-black/60' : 'border-b border-content/10 bg-surface'
        }`}
      >
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-content">{incoming.title}</p>
          <p className="truncate text-xs text-content/50">from {incoming.peerName}</p>
        </div>

        <button
          onClick={() => setMuted((m) => !m)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-content/70 transition hover:bg-content/10 hover:text-content"
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-content/70 transition hover:bg-content/10 hover:text-content"
          aria-label={expanded ? 'Minimize' : 'Expand'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
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
      <div className={`relative bg-black ${expanded ? 'flex-1' : 'aspect-video w-full'}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls={false}
          className="h-full w-full object-contain"
          onLoadedMetadata={() => setWaiting(false)}
          onClick={() => setMuted((m) => !m)}
        />
        {waiting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-content/50">
            <RadioTower className="h-8 w-8 animate-pulse" />
            <p className="text-sm">Waiting for the stream…</p>
          </div>
        )}
        {muted && !waiting && (
          <button
            onClick={() => setMuted(false)}
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-black"
          >
            <VolumeX className="h-4 w-4" />
            Tap to unmute
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
