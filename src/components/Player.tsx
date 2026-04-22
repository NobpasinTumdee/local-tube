import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatDuration, formatSize, formatRelative } from '../utils/format';
import type { VideoEntry } from '../utils/directoryScanner';

/* ───── small icon helpers ───── */
const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const PauseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
  </svg>
);
const VolumeIcon = ({ level }: { level: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {level > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
    {level > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
  </svg>
);
const FullscreenIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);
const PipIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <rect x="11" y="10" width="9" height="6" rx="1" />
  </svg>
);
const TheaterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
  </svg>
);
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/* ─────────── Player component ─────────── */
export default function Player() {
  const currentVideoId = useStore((s) => s.currentVideoId);
  const videos = useStore((s) => s.videos);
  const playVideo = useStore((s) => s.playVideo);
  const theaterMode = useStore((s) => s.theaterMode);
  const setTheaterMode = useStore((s) => s.setTheaterMode);
  const videoMeta = useStore((s) => s.videoMeta);

  const video = useMemo(() => videos.find((v) => v.id === currentVideoId), [videos, currentVideoId]);

  /* up‑next: same playlist first, then the rest */
  const upNext = useMemo(() => {
    if (!video) return [];
    const same = videos.filter((v) => v.id !== video.id && v.playlist === video.playlist);
    const other = videos.filter((v) => v.id !== video.id && v.playlist !== video.playlist);
    return [...same, ...other];
  }, [videos, video]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /* load video blob */
  useEffect(() => {
    if (!video) return;
    let url: string | undefined;
    let cancelled = false;
    (async () => {
      const f = await video.handle.getFile();
      url = URL.createObjectURL(f);
      if (!cancelled) {
        setSrc(url);
        setPlaying(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setSrc(null);
      setCurrent(0);
      setDuration(0);
    };
  }, [video]);

  /* auto‑play */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;
    el.play().catch(() => {});
  }, [src]);

  /* keyboard */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = videoRef.current;
      if (!el) return;
      if (e.key === 'Escape') { playVideo(null); return; }
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          el.paused ? el.play() : el.pause();
          break;
        case 'f':
          containerRef.current?.requestFullscreen?.();
          break;
        case 't':
          setTheaterMode(!theaterMode);
          break;
        case 'ArrowLeft':
          el.currentTime = Math.max(0, el.currentTime - 5);
          break;
        case 'ArrowRight':
          el.currentTime = Math.min(el.duration, el.currentTime + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          el.volume = Math.min(1, el.volume + 0.05);
          setVolume(el.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          el.volume = Math.max(0, el.volume - 0.05);
          setVolume(el.volume);
          break;
        case 'm':
          el.muted = !el.muted;
          setMuted(el.muted);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playVideo, theaterMode, setTheaterMode]);

  /* controls auto‑hide */
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  /* seek via click on progress bar */
  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = videoRef.current;
      const bar = progressRef.current;
      if (!el || !bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      el.currentTime = ratio * el.duration;
    },
    [],
  );

  const togglePip = async () => {
    try {
      const el = videoRef.current;
      if (!el) return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await el.requestPictureInPicture();
      }
    } catch { /* unsupported */ }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen?.();
    }
  };

  if (!video) return null;

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[#0f0f0f] lg:flex-row">
      {/* ─── LEFT: Video player ─── */}
      <div className={`flex flex-col ${theaterMode ? 'w-full' : 'w-full lg:flex-1'}`}>
        <div
          ref={containerRef}
          className="group relative w-full bg-black"
          style={{ aspectRatio: '16/9' }}
          onMouseMove={resetHideTimer}
          onMouseLeave={() => { if (!videoRef.current?.paused) setShowControls(false); }}
        >
          <video
            ref={videoRef}
            src={src || undefined}
            className="h-full w-full"
            onTimeUpdate={() => setCurrent(videoRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { if (upNext[0]) playVideo(upNext[0].id); }}
            onClick={() => { const el = videoRef.current!; el.paused ? el.play() : el.pause(); }}
          />

          {/* controls overlay */}
          <div
            className={`absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-10 transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            {/* progress bar */}
            <div
              ref={progressRef}
              className="group/bar relative flex h-5 cursor-pointer items-center"
              onClick={seek}
            >
              <div className="h-[3px] w-full rounded-full bg-white/20 transition-all group-hover/bar:h-[5px]">
                {/* buffered range (optional placeholder) */}
                <div
                  className="absolute left-0 h-full rounded-full bg-white/20"
                  style={{ width: '0%' }}
                />
                <div
                  className="h-full rounded-full bg-red-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* thumb dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-red-600 opacity-0 shadow transition-opacity group-hover/bar:opacity-100"
                style={{ left: `calc(${progress}% - 7px)` }}
              />
            </div>

            {/* buttons row */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const el = videoRef.current!; el.paused ? el.play() : el.pause(); }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>

              {/* volume */}
              <div className="group/vol flex items-center gap-1">
                <button
                  onClick={() => { const el = videoRef.current!; el.muted = !el.muted; setMuted(el.muted); }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
                  aria-label="Mute"
                >
                  <VolumeIcon level={muted ? 0 : volume} />
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    setMuted(v === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = v;
                      videoRef.current.muted = v === 0;
                    }
                  }}
                  className="w-0 origin-left scale-x-0 opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:scale-x-100 group-hover/vol:opacity-100"
                />
              </div>

              {/* time */}
              <span className="ml-1 text-xs tabular-nums text-white/70">
                {formatDuration(current)} / {formatDuration(duration)}
              </span>

              <div className="flex-1" />

              {/* pip */}
              <button
                onClick={togglePip}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Picture in Picture"
              >
                <PipIcon />
              </button>

              {/* theater */}
              <button
                onClick={() => setTheaterMode(!theaterMode)}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10 ${
                  theaterMode ? 'text-white' : 'text-white/70 hover:text-white'
                }`}
                aria-label="Theater mode"
              >
                <TheaterIcon />
              </button>

              {/* fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Fullscreen"
              >
                <FullscreenIcon />
              </button>
            </div>
          </div>
        </div>

        {/* title bar under video */}
        <div className="flex items-start gap-3 px-4 py-4 lg:px-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold leading-snug text-white lg:text-xl">{video.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-white/50">
              <span>{video.playlist}</span>
              <span>•</span>
              <span>{formatSize(video.size)}</span>
              <span>•</span>
              <span>{formatRelative(video.lastModified)}</span>
            </div>
          </div>
          <button
            onClick={() => playVideo(null)}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close player"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* ─── RIGHT: Up Next sidebar ─── */}
      <aside
        className={`shrink-0 overflow-y-auto border-t border-white/5 bg-[#0f0f0f] px-3 py-4 lg:border-l lg:border-t-0 ${
          theaterMode ? 'w-full lg:w-96' : 'w-full lg:w-96'
        }`}
      >
        <h2 className="mb-3 px-2 text-sm font-semibold text-white/60">Up Next</h2>
        <div className="flex flex-col gap-2">
          {upNext.slice(0, 50).map((v) => (
            <UpNextItem key={v.id} video={v} meta={videoMeta[v.id]} onPlay={() => playVideo(v.id)} />
          ))}
          {upNext.length === 0 && (
            <p className="px-2 py-8 text-center text-sm text-white/30">No more videos</p>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ─── Up‑Next item ─── */
function UpNextItem({ video, meta, onPlay }: { video: VideoEntry; meta?: { thumbnailUrl?: string; duration?: number }; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      className="flex gap-2 rounded-lg p-2 text-left transition hover:bg-white/5"
    >
      {/* thumbnail */}
      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-white/5">
        {meta?.thumbnailUrl ? (
          <img src={meta.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <path d="m10 9 5 3-5 3V9z" />
            </svg>
          </div>
        )}
        {meta?.duration != null && meta.duration > 0 && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
            {formatDuration(meta.duration)}
          </span>
        )}
      </div>

      {/* info */}
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-white/80">{video.title}</p>
        <p className="mt-0.5 truncate text-xs text-white/40">{video.playlist}</p>
        <p className="text-xs text-white/40">{formatSize(video.size)}</p>
      </div>
    </button>
  );
}
