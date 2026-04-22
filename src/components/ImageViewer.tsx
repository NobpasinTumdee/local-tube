import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { formatSize, formatRelative } from '../utils/format';

export default function ImageViewer() {
  const currentImageId = useStore((s) => s.currentImageId);
  const videos = useStore((s) => s.videos);
  const closeImage = useStore((s) => s.closeImage);
  const viewImage = useStore((s) => s.viewImage);

  const image = useMemo(
    () => videos.find((v) => v.id === currentImageId),
    [videos, currentImageId],
  );

  /* sibling images in same playlist for prev/next */
  const siblings = useMemo(
    () => videos.filter((v) => v.mediaType === 'image' && v.playlist === image?.playlist),
    [videos, image],
  );

  const currentIdx = useMemo(
    () => siblings.findIndex((v) => v.id === currentImageId),
    [siblings, currentImageId],
  );

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* load blob URL whenever image changes */
  useEffect(() => {
    if (!image) return;
    setLoading(true);
    let url: string | undefined;
    let cancelled = false;
    (async () => {
      const f = await image.handle.getFile();
      url = URL.createObjectURL(f);
      if (!cancelled) setObjectUrl(url);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      setObjectUrl(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [image]);

  /* keyboard navigation */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') { closeImage(); return; }
      if (e.key === 'ArrowRight' && siblings[currentIdx + 1]) viewImage(siblings[currentIdx + 1].id);
      if (e.key === 'ArrowLeft'  && siblings[currentIdx - 1]) viewImage(siblings[currentIdx - 1].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeImage, viewImage, siblings, currentIdx]);

  if (!image) return null;

  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < siblings.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0f0f0f]">
      {/* ── Top bar ── */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-[#0f0f0f]/90 px-4 backdrop-blur">
        <button
          onClick={closeImage}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-white/90">{image.title}</p>
          <p className="text-xs text-white/40">
            {image.playlist} • {formatSize(image.size)} • {formatRelative(image.lastModified)}
          </p>
        </div>

        {/* counter */}
        {siblings.length > 1 && (
          <span className="shrink-0 text-xs tabular-nums text-white/40">
            {currentIdx + 1} / {siblings.length}
          </span>
        )}
      </div>

      {/* ── Main image area ── */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {loading ? (
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
        ) : objectUrl ? (
          <img
            key={objectUrl}
            src={objectUrl}
            alt={image.title}
            className="max-h-full max-w-full object-contain select-none"
            style={{ height: 'calc(100vh - 3.5rem)' }}
            draggable={false}
          />
        ) : (
          <p className="text-white/30">Could not load image.</p>
        )}

        {/* Prev button */}
        {hasPrev && (
          <button
            onClick={() => viewImage(siblings[currentIdx - 1].id)}
            className="absolute left-3 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/70 hover:text-white"
            aria-label="Previous image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* Next button */}
        {hasNext && (
          <button
            onClick={() => viewImage(siblings[currentIdx + 1].id)}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/70 hover:text-white"
            aria-label="Next image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
