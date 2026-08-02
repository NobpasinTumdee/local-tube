import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, Volume2, VolumeX, X, GripVertical, Plus, Film,
  Image as ImageIcon, ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { formatDuration } from '../utils/format';
import { DND_MEDIA_ID, DND_SLOT } from '../utils/layoutGrid';
import AmbientGlow from './AmbientGlow';

interface Props {
  slot: number;
  mediaId: string | null;
  /** Registers a slot's <video> element with the parent for master controls.
   *  Image slots register `null` so master play/mute simply skip them. */
  onRegister: (slot: number, el: HTMLVideoElement | null) => void;
}

const MAX_ZOOM = 5;

/*
 * A single cell in the multi-media grid. Renders EITHER a custom video player
 * OR an interactive image viewer (zoom / pan), decided by the item's mediaType.
 *
 * Memory: each tile owns exactly one blob URL, created on mount and revoked on
 * unmount or whenever the slot's media changes — so nothing leaks as tiles are
 * added, removed, swapped, or replaced.
 */
export default function MediaTile({ slot, mediaId, onRegister }: Props) {
  const videos = useStore((s) => s.videos);
  const videoMeta = useStore((s) => s.videoMeta);
  const addToLayout = useStore((s) => s.addToLayout);
  const removeFromLayout = useStore((s) => s.removeFromLayout);
  const swapSlots = useStore((s) => s.swapSlots);
  const isAmbientMode = useStore((s) => s.isAmbientMode);
  /* Perf guard: cap the glow to layouts with ≤ 2 media items. */
  const filledCount = useStore((s) => s.activeMedia.filter(Boolean).length);
  const ambientOn = isAmbientMode && filledCount <= 2;

  const item = useMemo(() => videos.find((v) => v.id === mediaId) ?? null, [videos, mediaId]);
  const isImage = item?.mediaType === 'image';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);

  /* video-only state */
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  /* image-only zoom/pan state */
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  /* ── Blob lifecycle: one object URL per tile, revoked on change/unmount ── */
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
        /* unreadable file — leave placeholder */
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url); // ← revoke on replace/remove/unmount
    };
  }, [item]);

  /* reset zoom whenever the image in this slot changes */
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [mediaId]);

  /* register / unregister the <video> element (null for images) */
  useEffect(() => {
    onRegister(slot, videoRef.current);
    return () => onRegister(slot, null);
  }, [slot, src, isImage, onRegister]);

  /* ── shared drop handling: accept a media id (from a card) or a slot (swap) ── */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData(DND_MEDIA_ID);
    const fromSlot = e.dataTransfer.getData(DND_SLOT);
    if (id) addToLayout(id, slot);
    else if (fromSlot !== '') swapSlots(parseInt(fromSlot, 10), slot);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOver) setDragOver(true);
  };

  /* ── video controls ── */
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

  /* ── image zoom / pan ── */
  const zoomIn = () => setScale((s) => Math.min(MAX_ZOOM, +(s * 1.4).toFixed(2)));
  const zoomOut = () =>
    setScale((s) => {
      const n = Math.max(1, +(s / 1.4).toFixed(2));
      if (n === 1) setOffset({ x: 0, y: 0 });
      return n;
    });
  const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  const onWheel = (e: React.WheelEvent) => {
    if (!isImage) return;
    e.preventDefault();
    setScale((s) => {
      const n = Math.min(MAX_ZOOM, Math.max(1, +(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)).toFixed(2)));
      if (n === 1) setOffset({ x: 0, y: 0 });
      return n;
    });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isImage || scale <= 1) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    setOffset({ x: panRef.current.ox + (e.clientX - panRef.current.sx), y: panRef.current.oy + (e.clientY - panRef.current.sy) });
  };
  const endPan = () => { panRef.current = null; setIsPanning(false); };

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const zoomable = scale > 1;

  /* ─────────────── EMPTY SLOT ─────────────── */
  if (!item) {
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
          Click a video or image below, or drop one here
        </span>
      </button>
    );
  }

  /* ─────────────── FILLED SLOT ─────────────── */
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative isolate h-full w-full overflow-hidden rounded-xl bg-black ring-1 transition ${
        dragOver ? 'ring-2 ring-primary/80' : 'ring-content/10'
      }`}
    >
      {/* Ambient glow behind the video (perf-guarded; video tiles only) */}
      {!isImage && <AmbientGlow videoRef={videoRef} active={ambientOn && !!src} className="z-[-1]" />}

      {/* ── BODY: image viewer or video player ── */}
      {isImage ? (
        <div
          className="h-full w-full overflow-hidden"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerLeave={endPan}
          style={{ cursor: zoomable ? (isPanning ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
        >
          {src ? (
            <img
              src={src}
              alt={item.title}
              draggable={false}
              className="h-full w-full select-none object-contain"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transition: isPanning ? 'none' : 'transform 0.15s ease-out',
              }}
            />
          ) : (
            <Loader icon={<ImageIcon className="h-8 w-8 animate-pulse text-content/20" />} />
          )}
        </div>
      ) : src ? (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted={muted}
          loop
          playsInline
          preload="metadata"
          className="relative h-full w-full object-contain"
          poster={videoMeta[item.id]?.thumbnailUrl}
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => setCurrent(videoRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        />
      ) : (
        <Loader icon={<Film className="h-8 w-8 animate-pulse text-content/20" />} />
      )}

      {/* ── Top bar: type badge + drag handle + title + remove ── */}
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
        <span className="flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/90">
          {isImage ? <ImageIcon className="h-3 w-3" /> : <Film className="h-3 w-3" />}
          {isImage ? 'Image' : 'Video'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/85">{item.title}</span>
        <button
          onClick={() => removeFromLayout(slot)}
          className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/80 transition hover:bg-primary hover:text-white"
          aria-label="Remove from layout"
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Bottom controls: image (zoom) vs video (playback) ── */}
      {isImage ? (
        <div
          className={`absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 transition-opacity ${
            hovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <TileBtn onClick={zoomOut} label="Zoom out" disabled={scale <= 1}><ZoomOut className="h-4 w-4" /></TileBtn>
          <span className="min-w-[2.75rem] text-center text-[10px] font-semibold tabular-nums text-white/80">
            {Math.round(scale * 100)}%
          </span>
          <TileBtn onClick={zoomIn} label="Zoom in" disabled={scale >= MAX_ZOOM}><ZoomIn className="h-4 w-4" /></TileBtn>
          <TileBtn onClick={resetZoom} label="Reset zoom" disabled={scale === 1 && offset.x === 0 && offset.y === 0}>
            <RotateCcw className="h-4 w-4" />
          </TileBtn>
          {zoomable && <span className="ml-auto pr-1 text-[10px] text-white/50">drag to pan</span>}
        </div>
      ) : (
        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 transition-opacity ${
            hovered || !playing ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="group/bar relative flex h-3 cursor-pointer items-center" onClick={seek}>
            <div className="h-[3px] w-full rounded-full bg-white/25 transition-all group-hover/bar:h-[5px]">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <TileBtn onClick={togglePlay} label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </TileBtn>
            <TileBtn onClick={toggleMute} label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </TileBtn>
            <span className="ml-auto text-[10px] tabular-nums text-white/70">
              {formatDuration(current)} / {formatDuration(duration || 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Loader({ icon }: { icon: React.ReactNode }) {
  return <div className="flex h-full w-full items-center justify-center">{icon}</div>;
}

function TileBtn({
  onClick, label, disabled, children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
