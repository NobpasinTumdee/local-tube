import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { generateThumbnail, thumbnailQueue } from '../utils/generateThumbnail';
import { formatDuration, formatSize, formatRelative } from '../utils/format';
import type { MediaEntry } from '../utils/directoryScanner';

interface Props {
  video: MediaEntry;
}

export default function MediaCard({ video }: Props) {
  const meta = useStore((s) => s.videoMeta[video.id]);
  const setVideoMeta = useStore((s) => s.setVideoMeta);
  const playVideo = useStore((s) => s.playVideo);
  const viewImage = useStore((s) => s.viewImage);
  const cardRef = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);

  const isImage = video.mediaType === 'image';

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

  const thumb = meta?.thumbnailUrl;
  const dur = meta?.duration;

  function handleClick() {
    if (isImage) viewImage(video.id);
    else playVideo(video.id);
  }

  return (
    <div
      ref={cardRef}
      className="group cursor-pointer"
      onClick={handleClick}
    >
      {/* thumbnail */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-white/5">
        {thumb ? (
          <img
            src={thumb}
            alt={video.title}
            className={`h-full w-full transition-transform duration-300 group-hover:scale-105 ${
              isImage ? 'object-contain' : 'object-cover'
            }`}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {failed ? (
              /* failed placeholder */
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="m10 9 5 3-5 3V9z" />
              </svg>
            ) : (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
            )}
          </div>
        )}

        {/* ── Video: duration badge (bottom-right) ── */}
        {!isImage && dur != null && dur > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {formatDuration(dur)}
          </span>
        )}

        {/* ── Image: photo icon badge (top-left) ── */}
        {isImage && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
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
