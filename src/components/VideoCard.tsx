import { useRef, useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, PlaySquare, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store/useStore';
import { generateThumbnail, thumbnailQueue } from '../utils/generateThumbnail';
import { formatDuration, formatSize, formatRelative } from '../utils/format';
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);

  const isImage = video.mediaType === 'image';

  /* ── hover preview state ── */
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMuted, setPreviewMuted] = useState(true);

  /* lazy thumbnail via IntersectionObserver */
  const load = useCallback(async () => {
    if (requested || meta?.thumbnailUrl) return;
    setRequested(true);
    try {
      const file = await video.handle.getFile();
      if (isImage) {
        /* images: use the object URL directly as thumbnail */
        const url = URL.createObjectURL(file);
        setVideoMeta(video.id, { thumbnailUrl: url, duration: undefined });
      } else {
        /* videos: extract frame via canvas */
        const result = await thumbnailQueue.run(() => generateThumbnail(file));
        setVideoMeta(video.id, { thumbnailUrl: result.dataUrl, duration: result.duration });
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
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [load]);

  /* ── Release any preview blob URL on unmount (memory-leak guard) ── */
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

  const onMouseLeave = () => {
    stopPreview();
  };

  const thumb = meta?.thumbnailUrl;
  const dur = meta?.duration;

  function handleClick() {
    stopPreview();
    if (isImage) viewImage(video.id);
    else playVideo(video.id);
  }

  return (
    <div
      ref={cardRef}
      className="group cursor-pointer"
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* thumbnail */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-white/5">
        {thumb ? (
          <img
            src={thumb}
            alt={video.title}
            className={`h-full w-full transition-transform duration-300 group-hover:scale-105 ${
              isImage ? 'object-contain' : 'object-cover'
            } ${previewUrl ? 'opacity-0' : 'opacity-100'}`}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {failed ? (
              /* failed placeholder */
              <PlaySquare className="h-10 w-10 text-white/10" strokeWidth={1.5} />
            ) : (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
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
            className="absolute inset-0 h-full w-full bg-black object-cover"
            onCanPlay={() => {
              const el = previewVideoRef.current;
              if (el) el.play().catch(() => {});
            }}
          />
        )}

        {/* ── Hover preview mute toggle ── */}
        {previewUrl && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreviewMuted((m) => !m);
            }}
            className="absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/90 backdrop-blur-sm transition hover:bg-black/90"
            aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'}
          >
            {previewMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        )}

        {/* ── Video: duration badge (bottom-right) ── */}
        {!isImage && dur != null && dur > 0 && !previewUrl && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {formatDuration(dur)}
          </span>
        )}

        {/* ── Image: photo icon badge (top-left) ── */}
        {isImage && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
            <ImageIcon className="h-3 w-3" />
            IMG
          </span>
        )}

        {/* hover ring */}
        <div className="absolute inset-0 rounded-xl ring-1 ring-white/0 transition group-hover:ring-white/10" />
      </div>

      {/* info row */}
      <div className="mt-2.5 flex gap-2.5">
        {/* avatar */}
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase text-white ${
          isImage
            ? 'bg-gradient-to-br from-emerald-600 to-teal-500'
            : 'bg-gradient-to-br from-purple-600 to-blue-500'
        }`}>
          {video.playlist.charAt(0)}
        </div>

        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-white/90 group-hover:text-white">
            {video.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-white/40">{video.playlist}</p>
          <p className="text-xs text-white/40">
            {formatSize(video.size)} • {formatRelative(video.lastModified)}
          </p>
        </div>
      </div>
    </div>
  );
}
