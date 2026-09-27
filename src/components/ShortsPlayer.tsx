import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart, SkipForward, Volume2, VolumeX, X, GripVertical, Zap, Shuffle, Play, Pause,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  useShortsStore, useCurrentShort, shortsSlotKey, shortsSourceLabel,
} from '../store/useShortsStore';
import { DND_SLOT } from '../utils/layoutGrid';

interface Props {
  /** Grid slot this feed occupies. */
  slot: number;
  /** The `shorts://…` id stored in that slot — carries the source folders. */
  sentinel: string;
  /** Same registry MediaTile uses, so master play/pause/mute reach the feed. */
  onRegister?: (slot: number, el: HTMLVideoElement | null) => void;
}

/* ─────────────────────────────────────────────────────────────
 *  SHORTS PLAYER
 * ─────────────────────────────────────────────────────────────
 *  One endless vertical feed, sized to live inside a single grid cell.
 *
 *  Memory is the thing to get right here, because unlike a normal tile this
 *  component churns files for as long as it is mounted: every advance creates
 *  a blob URL for the next file, and the effect's cleanup revokes the
 *  previous one. Nothing accumulates whether the video ended on its own, was
 *  skipped, or the whole slot was torn down — three feeds cycling for an hour
 *  hold three blob URLs, not three hundred.
 *
 *  Muted by default and per slot: several of these can be on screen at once,
 *  and four soundtracks at full volume is not a feature.
 * ───────────────────────────────────────────────────────────── */

export default function ShortsPlayer({ slot, sentinel, onRegister }: Props) {
  const slotKey = useMemo(() => shortsSlotKey(slot, sentinel), [slot, sentinel]);

  const videos = useStore((s) => s.videos);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const removeFromLayout = useStore((s) => s.removeFromLayout);
  const videoMeta = useStore((s) => s.videoMeta);

  const getNextShort = useShortsStore((s) => s.getNextShort);
  const reshuffle = useShortsStore((s) => s.reshuffle);
  const releaseSlot = useShortsStore((s) => s.releaseSlot);
  const currentId = useCurrentShort(slotKey);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [liked, setLiked] = useState(false);

  const item = useMemo(() => videos.find((v) => v.id === currentId) ?? null, [videos, currentId]);
  const isFavorite = !!currentId && favorites.includes(currentId);

  const next = useCallback(() => {
    getNextShort(slotKey);
  }, [getNextShort, slotKey]);

  /* First video for this slot, and a fresh one whenever the library changes
     under it (folder unmounted, re-scan) leaves the slot empty. */
  useEffect(() => {
    if (!currentId) next();
  }, [currentId, next]);

  /* Forget this slot's queue when the tile goes away, so a later feed in the
     same cell starts from a new shuffle instead of the old leftovers. */
  useEffect(() => () => releaseSlot(slotKey), [releaseSlot, slotKey]);

  /* ── Blob lifecycle: exactly one live URL per feed ── */
  useEffect(() => {
    if (!item) {
      setSrc(null);
      return;
    }
    let url: string | undefined;
    let cancelled = false;
    (async () => {
      try {
        const file = await item.handle.getFile();
        url = URL.createObjectURL(file);
        if (!cancelled) setSrc(url);
      } catch {
        /* Unreadable file (moved, permission lost): don't stall the feed. */
        if (!cancelled) next();
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url); // ← revoke on advance, skip and unmount
    };
  }, [item, next]);

  useEffect(() => {
    onRegister?.(slot, videoRef.current);
    return () => onRegister?.(slot, null);
  }, [slot, src, onRegister]);

  /* The heart pulses on the way in; reset it when the video changes. */
  useEffect(() => setLiked(false), [currentId]);

  const onLike = () => {
    if (!currentId) return;
    toggleFavorite(currentId);
    setLiked(true);
  };

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    el.paused ? el.play().catch(() => {}) : el.pause();
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  const duration = currentId ? videoMeta[currentId]?.duration : undefined;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-black ring-1 ring-content/10"
    >
      {/*
        The 9:16 stage. `max-h-full`/`max-w-full` keep it inside whatever cell
        the grid template hands us — in a wide cell it letterboxes on black
        rather than stretching, which is what makes a landscape source still
        read as a Short.
      */}
      <div className="relative aspect-[9/16] max-h-full max-w-full overflow-hidden">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            autoPlay
            muted={muted}
            playsInline
            preload="auto"
            className="h-full w-full object-cover"
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            /* The feed itself: roll straight into the next random pick. */
            onEnded={next}
            /* A codec the browser cannot decode would otherwise freeze the
               feed on a black cell forever. */
            onError={next}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-content/30">
            <Zap className="h-7 w-7 animate-pulse" />
            <span className="text-[11px] font-medium">
              {item ? 'Loading short…' : 'No videos in this source'}
            </span>
          </div>
        )}

        {/* ── Right rail: like / skip / sound ── */}
        <div className="absolute bottom-3 right-2 flex flex-col items-center gap-3">
          <RailBtn
            label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={onLike}
            disabled={!currentId}
          >
            <Heart
              className={`h-5 w-5 transition-transform duration-200 ${
                isFavorite ? 'fill-primary text-primary' : 'text-white'
              } ${liked ? 'scale-125' : 'scale-100'}`}
            />
          </RailBtn>
          <RailBtn label="Next short" onClick={next}>
            <SkipForward className="h-5 w-5 text-white" />
          </RailBtn>
          <RailBtn label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} disabled={!src}>
            {muted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-primary" />}
          </RailBtn>
        </div>

        {/* ── Centre play affordance while paused ── */}
        {src && !playing && (
          <button
            onClick={togglePlay}
            aria-label="Play"
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/30"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
              <Play className="ml-0.5 h-6 w-6 text-white" />
            </span>
          </button>
        )}

        {/* ── Caption ── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-8">
          <p className="truncate pr-12 text-[12px] font-semibold text-white/95">
            {item?.title ?? '—'}
          </p>
          <p className="truncate pr-12 text-[10px] text-white/55">
            {item?.rootFolderName}
            {duration ? ` · ${Math.round(duration)}s` : ''}
          </p>
        </div>
      </div>

      {/* ── Slot chrome: drag to swap, reshuffle, remove ── */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-2 py-1.5 transition-opacity ${
          hovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_SLOT, String(slot));
            e.dataTransfer.effectAllowed = 'move';
          }}
          className="pointer-events-auto flex h-6 w-6 cursor-grab items-center justify-center rounded text-white/70 hover:bg-white/15 hover:text-white active:cursor-grabbing"
          title="Drag to swap slot"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="flex items-center gap-1 rounded bg-primary/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
          <Zap className="h-3 w-3" />
          Shorts
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/70">
          {shortsSourceLabel(sentinel)}
        </span>
        <button
          onClick={() => { reshuffle(slotKey); next(); }}
          className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/80 transition hover:bg-white/20"
          aria-label="Reshuffle this feed"
          title="Reshuffle"
        >
          <Shuffle className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => removeFromLayout(slot)}
          className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/80 transition hover:bg-primary hover:text-white"
          aria-label="Remove feed from layout"
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Pause hint for the master bar's benefit — keeps parity with MediaTile. */}
      {src && playing && hovered && (
        <button
          onClick={togglePlay}
          aria-label="Pause"
          className="absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white/90 transition hover:bg-black/75"
        >
          <Pause className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function RailBtn({
  label, onClick, disabled, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
