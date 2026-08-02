import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, X, GripVertical, Plus, Film } from 'lucide-react';
import { useStore } from '../store/useStore';
import { formatDuration } from '../utils/format';
import { DND_VIDEO_ID, DND_SLOT } from '../utils/layoutGrid';

interface Props {
  slot: number;
  videoId: string | null;
  /** Registers this tile's <video> element with the parent for master controls. */
  onRegister: (slot: number, el: HTMLVideoElement | null) => void;
}

/*
 * A single cell in the multi-video grid.
 *
 * • Owns its OWN blob URL (created on mount, revoked on unmount / id change) so
 *   nothing leaks when tiles come and go.
 * • Has fully independent controls: play/pause, mute, scrub, time.
 * • Registers its <video> element upward so the master bar can drive all tiles.
 * • Empty tiles are drop targets + click-to-focus hints; filled tiles are
 *   draggable for slot-to-slot swapping.
 *
 * Performance: videos start MUTED (required for reliable autoplay) with
 * `preload="metadata"` so four streams don't hammer decode/bandwidth at once.
 */
export default function VideoTile({ slot, videoId, onRegister }: Props) {
  const videos = useStore((s) => s.videos);
  const videoMeta = useStore((s) => s.videoMeta);
  const addToLayout = useStore((s) => s.addToLayout);
  const removeFromLayout = useStore((s) => s.removeFromLayout);
  const swapSlots = useStore((s) => s.swapSlots);

  const video = useMemo(() => videos.find((v) => v.id === videoId) ?? null, [videos, videoId]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);

  /* ── Blob lifecycle: one object URL per tile, revoked on change/unmount ── */
  useEffect(() => {
    if (!video) {
      setSrc(null);
      return;
    }
    let url: string | undefined;
    let cancelled = false;
    (async () => {
      try {
        const file = await video.handle.getFile();
        url = URL.createObjectURL(file);
        if (!cancelled) setSrc(url);
      } catch {
        /* unreadable file — leave placeholder */
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [video]);

  /* ── Register / unregister the <video> element for the master controls ── */
  useEffect(() => {
    onRegister(slot, videoRef.current);
    return () => onRegister(slot, null);
    // re-run once the element exists (src set) and whenever the slot changes
  }, [slot, src, onRegister]);

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.paused ? el.play().catch(() => {}) : el.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * el.duration;
  }, []);

  /* ── Drop handling: accept a video id (from a card) or a slot (swap) ── */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const vid = e.dataTransfer.getData(DND_VIDEO_ID);
    const fromSlot = e.dataTransfer.getData(DND_SLOT);
    if (vid) addToLayout(vid, slot);
    else if (fromSlot !== '') swapSlots(parseInt(fromSlot, 10), slot);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOver) setDragOver(true);
  };

  /* ─────────────── EMPTY SLOT ─────────────── */
  if (!video) {
    return (
      <button
        type="button"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        className={`flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-content/40 transition ${
          dragOver
            ? 'border-primary/70 bg-primary/10 text-content/80'
            : 'border-content/10 bg-content/[0.02] hover:border-content/25 hover:text-content/60'
        }`}
      >
        <Plus className="h-6 w-6" />
        <span className="text-xs font-medium">Slot {slot + 1}</span>
        <span className="px-4 text-center text-[11px] text-content/30">
          Click a video below or drop one here
        </span>
      </button>
    );
  }

  const thumb = videoMeta[video.id]?.thumbnailUrl;

  /* ─────────────── FILLED SLOT ─────────────── */
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative h-full w-full overflow-hidden rounded-xl bg-black ring-1 transition ${
        dragOver ? 'ring-2 ring-primary/80' : 'ring-content/10'
      }`}
    >
      {src ? (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted={muted}
          loop
          playsInline
          preload="metadata"
          className="h-full w-full bg-black object-contain"
          poster={thumb}
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => setCurrent(videoRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Film className="h-8 w-8 animate-pulse text-content/20" />
        </div>
      )}

      {/* ── Top bar: slot badge + drag handle + remove (visible on hover) ── */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-2 py-1.5 transition-opacity ${
          hovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* drag handle — dragging a filled tile lets you swap slots */}
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
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/85">
          {video.title}
        </span>
        <button
          onClick={() => removeFromLayout(slot)}
          className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/80 transition hover:bg-primary hover:text-white"
          aria-label="Remove from layout"
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Bottom controls (independent per tile) ── */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 transition-opacity ${
          hovered || !playing ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* seek bar */}
        <div className="group/bar relative flex h-3 cursor-pointer items-center" onClick={seek}>
          <div className="h-[3px] w-full rounded-full bg-white/25 transition-all group-hover/bar:h-[5px]">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={togglePlay}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={toggleMute}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <span className="ml-auto text-[10px] tabular-nums text-white/70">
            {formatDuration(current)} / {formatDuration(duration || 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
