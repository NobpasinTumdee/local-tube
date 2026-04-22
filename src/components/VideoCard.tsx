import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { generateThumbnail, thumbnailQueue } from '../utils/generateThumbnail';
import { formatDuration, formatSize, formatRelative } from '../utils/format';
import type { VideoEntry } from '../utils/directoryScanner';

interface Props {
  video: VideoEntry;
}

export default function VideoCard({ video }: Props) {
  const meta = useStore((s) => s.videoMeta[video.id]);
  const setVideoMeta = useStore((s) => s.setVideoMeta);
  const playVideo = useStore((s) => s.playVideo);
  const cardRef = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);

  /* lazy thumb via IntersectionObserver */
  const load = useCallback(async () => {
    if (requested || meta?.thumbnailUrl) return;
    setRequested(true);
    try {
      const file = await video.handle.getFile();
      const result = await thumbnailQueue.run(() => generateThumbnail(file));
      setVideoMeta(video.id, {
        thumbnailUrl: result.dataUrl,
        duration: result.duration,
      });
    } catch {
      setFailed(true);
    }
  }, [requested, meta?.thumbnailUrl, video, setVideoMeta]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          load();
          obs.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [load]);

  const thumb = meta?.thumbnailUrl;
  const dur = meta?.duration;

  return (
    <div
      ref={cardRef}
      className="group cursor-pointer"
      onClick={() => playVideo(video.id)}
    >
      {/* thumbnail */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-white/5">
        {thumb ? (
          <img
            src={thumb}
            alt={video.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {failed ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="m10 9 5 3-5 3V9z" />
              </svg>
            ) : (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
            )}
          </div>
        )}

        {/* duration badge */}
        {dur != null && dur > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {formatDuration(dur)}
          </span>
        )}

        {/* hover overlay */}
        <div className="absolute inset-0 rounded-xl ring-1 ring-white/0 transition group-hover:ring-white/10" />
      </div>

      {/* info */}
      <div className="mt-2.5 flex gap-2.5">
        {/* channel avatar */}
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-500 text-[11px] font-bold uppercase text-white">
          {video.playlist.charAt(0)}
        </div>

        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-white/90 group-hover:text-white">
            {video.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-white/40">
            {video.playlist}
          </p>
          <p className="text-xs text-white/40">
            {formatSize(video.size)} • {formatRelative(video.lastModified)}
          </p>
        </div>
      </div>
    </div>
  );
}
