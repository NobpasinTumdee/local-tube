import { useRef, useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, Film, PlaySquare, Volume2, VolumeX, Plus, Play, Clock } from 'lucide-react';
import { useStore } from '../store/useStore';
import { generateThumbnail, thumbnailQueue } from '../utils/generateThumbnail';
import { formatDuration, formatRelative, formatResolution } from '../utils/format';
import { DND_MEDIA_ID } from '../utils/layoutGrid';
import type { MediaEntry } from '../utils/directoryScanner';

interface Props {
  video: MediaEntry;
}

const HOVER_DELAY_MS = 500;

export default function MediaCard({ video }: Props) {
  const meta = useStore((s) => s.videoMeta[video.id]);
  const setVideoMeta = useStore((s) => s.setVideoMeta);
  const playVideo = useStore((s) => s.playVideo);
  const viewImage = useStore((s) => s.viewImage);
  const layoutMode = useStore((s) => s.layoutMode);
  const addToLayout = useStore((s) => s.addToLayout);
  const cardRef = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  /* local dimension capture for images (videos get theirs from extraction) */
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  const isImage = video.mediaType === 'image';

  /* ── hover preview state (videos only) ── */
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMuted, setPreviewMuted] = useState(true);

  /* lazy thumbnail via IntersectionObserver.
     Videos → canvas frame extraction; images → object URL directly (no canvas). */
  const load = useCallback(async () => {
    if (requested || meta?.thumbnailUrl) return;
    setRequested(true);
    try {
      const file = await video.handle.getFile();
      if (isImage) {
        const url = URL.createObjectURL(file);
        setVideoMeta(video.id, { thumbnailUrl: url, duration: undefined });
      } else {
        const result = await thumbnailQueue.run(() => generateThumbnail(file));
        setVideoMeta(video.id, {
          thumbnailUrl: result.dataUrl,
          duration: result.duration,
          width: result.width,
          height: result.height,
        });
      }
    } catch {
      setFailed(true);
    }
  }, [requested, meta?.thumbnailUrl, video, setVideoMeta, isImage]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { load(); obs.disconnect(); }
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [load]);

  /* ── Release preview blob URL on unmount (memory-leak guard) ── */
  useEffect(() => {
    return () => {
      clearTimeout(hoverTimerRef.current);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const startPreview = useCallback(async () => {
    if (previewUrlRef.current) return;
    try {
      const file = await video.handle.getFile();
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch {
      /* silent — fallback to thumbnail */
    }
  }, [video]);

  const stopPreview = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    const el = previewVideoRef.current;
    if (el) { try { el.pause(); } catch { /* noop */ } }
    setPreviewUrl(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const onMouseEnter = () => {
    if (isImage) return; // images: no hover preview
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(startPreview, HOVER_DELAY_MS);
  };
  const onMouseLeave = () => stopPreview();

  const thumb = meta?.thumbnailUrl;
  const dur = meta?.duration;

  /* ── Aspect ratio: detect vertical ("Shorts") vs standard ── */
  const w = meta?.width ?? imgDims?.w;
  const h = meta?.height ?? imgDims?.h;
  const isVertical = !!w && !!h && h > w;
  const resolution = formatResolution(w, h);

  /* In layout mode a click drops the item (video OR image) into a slot. */
  const layoutTarget = layoutMode;

  function handleClick() {
    stopPreview();
    if (layoutMode) { addToLayout(video.id); return; }
    if (isImage) viewImage(video.id);
    else playVideo(video.id);
  }

  return (
    <div
      ref={cardRef}
      className="group cursor-pointer outline-none"
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      /* Videos and images are both draggable onto a specific grid slot */
      draggable={layoutTarget}
      onDragStart={
        layoutTarget
          ? (e) => {
              e.dataTransfer.setData(DND_MEDIA_ID, video.id);
              e.dataTransfer.effectAllowed = 'copy';
            }
          : undefined
      }
    >
      {/* ── Thumbnail: large, rounded, lifts & glows on hover ── */}
      <div
        className="relative overflow-hidden rounded-2xl bg-content/[0.04] shadow-lg shadow-black/20 ring-1 ring-content/[0.06] transition-all duration-300 ease-out will-change-transform group-hover:-translate-y-1 group-hover:scale-[1.03] group-hover:shadow-2xl group-hover:shadow-black/40 group-hover:ring-primary/30"
        style={{ aspectRatio: isVertical ? '9 / 16' : '16 / 9' }}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={video.title}
            onLoad={(e) => {
              if (isImage && !imgDims) {
                const t = e.currentTarget;
                if (t.naturalWidth) setImgDims({ w: t.naturalWidth, h: t.naturalHeight });
              }
            }}
            className={`h-full w-full transition-transform duration-500 ${
              isVertical || isImage ? 'object-contain' : 'object-cover'
            } ${previewUrl ? 'opacity-0' : 'opacity-100'}`}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {failed ? (
              <PlaySquare className="h-10 w-10 text-content/10" strokeWidth={1.5} />
            ) : (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-content/10 border-t-content/40" />
            )}
          </div>
        )}

        {/* ── Hover preview video ── */}
        {previewUrl && (
          <video
            ref={previewVideoRef}
            src={previewUrl}
            autoPlay
            muted={previewMuted}
            loop
            playsInline
            className={`absolute inset-0 h-full w-full bg-black ${isVertical ? 'object-contain' : 'object-cover'}`}
            onCanPlay={() => {
              const el = previewVideoRef.current;
              if (el) el.play().catch(() => {});
            }}
          />
        )}

        {/* ── Type badge (differentiates Video vs Image at a glance) ── */}
        <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
          {isImage ? <ImageIcon className="h-3 w-3" /> : <Film className="h-3 w-3" />}
          {isImage ? 'Photo' : 'Video'}
        </span>

        {/* ── Play glyph that blooms on hover (video only, no preview yet) ── */}
        {!isImage && !previewUrl && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm ring-1 ring-white/20">
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            </span>
          </div>
        )}

        {/* ── Preview mute toggle ── */}
        {previewUrl && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreviewMuted((m) => !m);
            }}
            className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/90"
            aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'}
          >
            {previewMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}

        {/* ── Metadata rail: hidden by default, slides up over the thumbnail on hover ── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-10 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {!isImage && dur != null && dur > 0 && (
              <MetaChip><Clock className="h-3 w-3" />{formatDuration(dur)}</MetaChip>
            )}
            {resolution && <MetaChip>{resolution}</MetaChip>}
            <MetaChip>{formatRelative(video.lastModified)}</MetaChip>
          </div>
        </div>

        {/* ── Layout-mode affordance ── */}
        {layoutTarget && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
              <Plus className="h-3.5 w-3.5" /> Add to layout
            </span>
          </div>
        )}
      </div>

      {/* ── Info row: prominent 2-line title + channel-style playlist ── */}
      <div className="mt-3 flex gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold uppercase text-white shadow-sm ${
            isImage
              ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
              : 'bg-gradient-to-br from-primary to-accent'
          }`}
        >
          {video.playlist.charAt(0)}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-content/95 transition-colors group-hover:text-content">
            {video.title}
          </h3>
          <p className="mt-1 truncate text-[13px] font-medium text-content/45">{video.playlist}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Small pill used in the hover metadata rail ─── */
function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
      {children}
    </span>
  );
}
