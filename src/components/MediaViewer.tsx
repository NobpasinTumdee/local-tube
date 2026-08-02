import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Trash2, X, LayoutGrid, Maximize, Minimize } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getGridConfig } from '../utils/layoutGrid';
import MediaTile from './MediaTile';

/*
 * The multi-media grid. Renders a CSS-Grid whose shape comes from the active
 * layout template, with one <MediaTile> per slot — each tile decides on its own
 * whether to be a video player or an image viewer.
 *
 * A master control bar drives every registered <video> element at once. Image
 * tiles register nothing, so play/pause/mute-all naturally affect videos only.
 *
 * Framer Motion `layout` on the container + each cell gives fluid morphing when
 * the template changes or cells are added/removed.
 */
export default function MediaViewer() {
  const template = useStore((s) => s.currentLayoutTemplate);
  const activeMedia = useStore((s) => s.activeMedia);
  const videos = useStore((s) => s.videos);
  const setLayoutMode = useStore((s) => s.setLayoutMode);
  const clearLayout = useStore((s) => s.clearLayout);

  /* ── Fullscreen for the whole layout view ── */
  const containerRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else containerRef.current?.requestFullscreen?.().catch(() => {});
  };

  /* Registry of live <video> elements keyed by slot, populated by the tiles. */
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const register = useCallback((slot: number, el: HTMLVideoElement | null) => {
    if (el) videoRefs.current.set(slot, el);
    else videoRefs.current.delete(slot);
  }, []);

  const forEachVideo = (fn: (el: HTMLVideoElement) => void) => videoRefs.current.forEach(fn);
  const playAll = () => forEachVideo((v) => v.play().catch(() => {}));
  const pauseAll = () => forEachVideo((v) => v.pause());
  const muteAll = (m: boolean) => forEachVideo((v) => { v.muted = m; });

  const filled = activeMedia.filter(Boolean).length;
  const videoCount = activeMedia.filter(
    (id) => id && videos.find((v) => v.id === id)?.mediaType === 'video',
  ).length;
  const cfg = getGridConfig(template, activeMedia.length);

  return (
    <motion.section
      ref={containerRef}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 300 }}
      className={`overflow-hidden border-content/10 shadow-xl shadow-black/20 ${
        isFullscreen
          ? 'flex h-screen w-screen flex-col bg-base'
          : 'rounded-2xl border bg-surface/50 backdrop-blur-sm'
      }`}
    >
      {/* ── Master control bar ── */}
      <div className="flex items-center gap-2 border-b border-content/10 px-3 py-2">
        <LayoutGrid className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-content">Layout</span>
        <span className="rounded-full bg-content/10 px-2 py-0.5 text-[11px] tabular-nums text-content/60">
          {filled} item{filled === 1 ? '' : 's'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <MasterBtn label="Play all videos" onClick={playAll} disabled={videoCount === 0}><Play className="h-4 w-4" /></MasterBtn>
          <MasterBtn label="Pause all videos" onClick={pauseAll} disabled={videoCount === 0}><Pause className="h-4 w-4" /></MasterBtn>
          <MasterBtn label="Unmute all videos" onClick={() => muteAll(false)} disabled={videoCount === 0}><Volume2 className="h-4 w-4" /></MasterBtn>
          <MasterBtn label="Mute all videos" onClick={() => muteAll(true)} disabled={videoCount === 0}><VolumeX className="h-4 w-4" /></MasterBtn>
          <span className="mx-1 h-5 w-px bg-content/10" />
          <MasterBtn label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </MasterBtn>
          <span className="mx-1 h-5 w-px bg-content/10" />
          <MasterBtn label="Clear layout" onClick={clearLayout} disabled={filled === 0}>
            <Trash2 className="h-4 w-4" />
          </MasterBtn>
          <MasterBtn label="Exit layout mode" onClick={() => setLayoutMode(false)}>
            <X className="h-4 w-4" />
          </MasterBtn>
        </div>
      </div>

      {/* ── The grid ── */}
      <div className={`p-2 sm:p-3 ${isFullscreen ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
        <motion.div
          layout
          className={`grid gap-2 ${isFullscreen ? 'h-full flex-1' : 'h-[46vh] sm:h-[58vh]'} ${cfg.container}`}
        >
          <AnimatePresence initial={false}>
            {activeMedia.map((id, i) => (
              <motion.div
                key={`slot-${i}`}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: 'spring', damping: 28, stiffness: 340, mass: 0.7 }}
                className={`relative min-h-0 min-w-0 ${cfg.spanFor(i)}`}
              >
                <MediaTile slot={i} mediaId={id} onRegister={register} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {filled === 0 && (
          <p className="mt-3 text-center text-xs text-content/40">
            Click any video or image in the library below to drop it into a slot — or drag it onto a specific cell.
          </p>
        )}
      </div>
    </motion.section>
  );
}

function MasterBtn({
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
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-content/70 transition hover:bg-content/10 hover:text-content disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
