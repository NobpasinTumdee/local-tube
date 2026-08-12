import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Film, PlaySquare, Volume2, VolumeX, Plus, Play, Clock, Heart, ListPlus, Check, Tag, Hash, X, Lock } from 'lucide-react';
import { useStore, normalizeTag } from '../store/useStore';
import { useVaultStore } from '../store/useVaultStore';
import { generateThumbnail, thumbnailQueue } from '../utils/generateThumbnail';
import { formatDuration, formatRelative, formatResolution } from '../utils/format';
import { DND_MEDIA_ID } from '../utils/layoutGrid';
import type { MediaEntry } from '../utils/directoryScanner';

interface Props {
  video: MediaEntry;
}

const HOVER_DELAY_MS = 500;

/**
 * "Move to Private Vault" row in the card menu.
 *
 * Renders nothing while the vault is locked: offering it would either need
 * the decrypted membership (which we don't have) or would silently queue a
 * change against a list we can't read.
 */
function VaultMenuItem({ mediaId }: { mediaId: string }) {
  const isUnlocked = useVaultStore((s) => s.isVaultUnlocked);
  const inVault = useVaultStore((s) => s.mediaIds.includes(mediaId));
  const addToVault = useVaultStore((s) => s.addToVault);
  const removeFromVault = useVaultStore((s) => s.removeFromVault);

  if (!isUnlocked) return null;

  return (
    <button
      onClick={() => void (inVault ? removeFromVault(mediaId) : addToVault(mediaId))}
      className="flex w-full items-center gap-2 border-t border-content/10 px-3 py-2 text-left text-sm text-content/80 transition hover:bg-content/10"
    >
      <Lock className={`h-3.5 w-3.5 shrink-0 ${inVault ? 'text-primary' : 'text-content/40'}`} />
      <span className="min-w-0 flex-1 truncate">
        {inVault ? 'Remove from Private Vault' : 'Move to Private Vault'}
      </span>
      {inVault && <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={3} />}
    </button>
  );
}

export default function MediaCard({ video }: Props) {
  const meta = useStore((s) => s.videoMeta[video.id]);
  const setVideoMeta = useStore((s) => s.setVideoMeta);
  const playVideo = useStore((s) => s.playVideo);
  const viewImage = useStore((s) => s.viewImage);
  const layoutMode = useStore((s) => s.layoutMode);
  const addToLayout = useStore((s) => s.addToLayout);
  const cardAspectRatio = useStore((s) => s.cardAspectRatio);

  /* favorites & virtual playlists */
  const isFav = useStore((s) => s.favorites.includes(video.id));
  const playlists = useStore((s) => s.virtualPlaylists);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const togglePlaylistItem = useStore((s) => s.togglePlaylistItem);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const addToPlaylist = useStore((s) => s.addToPlaylist);

  /* custom tags for this item */
  const tags = useStore((s) => s.mediaTags[video.id]);
  const addTag = useStore((s) => s.addTag);
  const removeTag = useStore((s) => s.removeTag);

  const cardRef = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  /* local dimension capture for images (videos get theirs from extraction) */
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  /* playlist dropdown (rendered via portal so card/shelf overflow can't clip it) */
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [newName, setNewName] = useState('');
  const plBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* tag editor menu (also a portal) */
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagMenuPos, setTagMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || plBtnRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const openPlaylistMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTagMenuOpen(false);
    const r = plBtnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setMenuOpen((o) => !o);
  };

  const createAndAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addToPlaylist(createPlaylist(name), video.id);
    setNewName('');
  };

  /* ── tag editor ── */
  useEffect(() => {
    if (!tagMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (tagMenuRef.current?.contains(e.target as Node) || tagBtnRef.current?.contains(e.target as Node)) return;
      setTagMenuOpen(false);
    };
    const close = () => setTagMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTagMenuOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [tagMenuOpen]);

  const openTagMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    const r = tagBtnRef.current?.getBoundingClientRect();
    if (r) setTagMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    /* snapshot all previously-used tags across the library (non-reactive) */
    const all = useStore.getState().mediaTags;
    const set = new Set<string>();
    for (const arr of Object.values(all)) for (const t of arr) set.add(t);
    (tags ?? []).forEach((t) => set.delete(t));
    setTagSuggestions([...set].sort((a, b) => a.localeCompare(b)));
    setTagMenuOpen((o) => !o);
  };

  const commitTag = (raw: string) => {
    addTag(video.id, raw);
    setTagInput('');
    const norm = normalizeTag(raw);
    if (norm) setTagSuggestions((s) => s.filter((t) => t !== norm));
  };

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

  /* ── Uniform aspect ratio from display preference (media fills via object-cover) ── */
  const w = meta?.width ?? imgDims?.w;
  const h = meta?.height ?? imgDims?.h;
  const resolution = formatResolution(w, h);
  const aspectClass =
    cardAspectRatio === '9/16' ? 'aspect-[9/16]' : cardAspectRatio === '1/1' ? 'aspect-square' : 'aspect-video';

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
        className={`relative overflow-hidden rounded-2xl bg-content/[0.04] shadow-lg shadow-black/20 ring-1 ring-content/[0.06] transition-all duration-300 ease-out will-change-transform group-hover:-translate-y-1 group-hover:scale-[1.03] group-hover:shadow-2xl group-hover:shadow-black/40 group-hover:ring-primary/30 ${aspectClass}`}
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
            className={`h-full w-full object-cover transition-transform duration-500 ${previewUrl ? 'opacity-0' : 'opacity-100'}`}
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
            className="absolute inset-0 h-full w-full bg-black object-cover"
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

        {/* ── Action cluster: preview-mute + favorite + add-to-playlist ── */}
        <div
          className={`absolute right-2 top-2 z-30 flex items-center gap-1.5 transition-opacity ${
            isFav || menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {previewUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); setPreviewMuted((m) => !m); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/90"
              aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'}
            >
              {previewMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(video.id); }}
            className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition ${
              isFav ? 'bg-black/60 text-primary' : 'bg-black/50 text-white/90 hover:bg-black/80'
            }`}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            title={isFav ? 'Unfavorite' : 'Favorite'}
          >
            <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
          </button>
          <button
            ref={plBtnRef}
            onClick={openPlaylistMenu}
            className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition ${
              menuOpen ? 'bg-black/80 text-white' : 'bg-black/50 text-white/90 hover:bg-black/80'
            }`}
            aria-label="Add to playlist"
            title="Add to playlist"
          >
            <ListPlus className="h-4 w-4" />
          </button>
          <button
            ref={tagBtnRef}
            onClick={openTagMenu}
            className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition ${
              tagMenuOpen ? 'bg-black/80 text-white' : 'bg-black/50 text-white/90 hover:bg-black/80'
            }`}
            aria-label="Edit tags"
            title="Tags"
          >
            <Tag className="h-4 w-4" />
          </button>
        </div>

        {/* ── Playlist dropdown (portal → escapes overflow/transform clipping) ── */}
        {menuOpen && menuPos && createPortal(
          <div
            ref={menuRef}
            className="fixed z-[300] w-60 overflow-hidden rounded-xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
            style={{ top: menuPos.top, right: menuPos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-content/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content/50">
              Add to playlist
            </div>
            <div className="max-h-56 overflow-y-auto py-1 scrollbar-thin">
              {playlists.length === 0 && (
                <p className="px-3 py-2 text-xs text-content/40">No playlists yet — create one below.</p>
              )}
              {playlists.map((p) => {
                const has = p.mediaIds.includes(video.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlaylistItem(p.id, video.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-content/80 transition hover:bg-content/10"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      has ? 'border-primary bg-primary text-white' : 'border-content/30'
                    }`}>
                      {has && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.title}</span>
                    <span className="text-[10px] tabular-nums text-content/30">{p.mediaIds.length}</span>
                  </button>
                );
              })}
            </div>
            {/* Vault membership — only offered while unlocked, since moving
                something in or out requires the decrypted list. */}
            <VaultMenuItem mediaId={video.id} />

            <div className="flex items-center gap-1 border-t border-content/10 p-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createAndAdd(); } }}
                placeholder="New playlist…"
                className="h-8 min-w-0 flex-1 rounded-lg border border-content/10 bg-content/5 px-2 text-sm text-content placeholder-content/40 outline-none focus:border-primary/50"
              />
              <button
                onClick={createAndAdd}
                disabled={!newName.trim()}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>,
          document.body,
        )}

        {/* ── Tag editor (portal → escapes overflow/transform clipping) ── */}
        {tagMenuOpen && tagMenuPos && createPortal(
          <div
            ref={tagMenuRef}
            className="fixed z-[300] w-64 overflow-hidden rounded-xl border border-content/10 bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
            style={{ top: tagMenuPos.top, right: tagMenuPos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-content/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content/50">
              Tags
            </div>

            {/* current tags */}
            {tags && tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                {tags.map((t) => (
                  <span key={t} className="flex items-center gap-1 rounded-full bg-primary/15 py-0.5 pl-2 pr-1 text-xs font-medium text-primary">
                    {t}
                    <button
                      onClick={() => removeTag(video.id, t)}
                      className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/25"
                      aria-label={`Remove tag ${t}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* add input */}
            <div className="flex items-center gap-1 p-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTag(tagInput); } }}
                placeholder="Add a tag…"
                className="h-8 min-w-0 flex-1 rounded-lg border border-content/10 bg-content/5 px-2 text-sm text-content placeholder-content/40 outline-none focus:border-primary/50"
              />
              <button
                onClick={() => commitTag(tagInput)}
                disabled={!tagInput.trim()}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            {/* previously-used suggestions */}
            {tagSuggestions.length > 0 && (
              <div className="border-t border-content/10 px-3 py-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-content/40">Previously used</p>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto scrollbar-thin">
                  {tagSuggestions.map((t) => (
                    <button
                      key={t}
                      onClick={() => commitTag(t)}
                      className="flex items-center gap-1 rounded-full border border-content/10 bg-content/[0.03] px-2 py-0.5 text-xs font-medium text-content/60 transition hover:border-primary/40 hover:text-primary"
                    >
                      <Hash className="h-2.5 w-2.5 opacity-70" />
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}

        {/* ── Tag pills (bottom of thumbnail; fade out on hover for the metadata rail) ── */}
        {tags && tags.length > 0 && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-wrap gap-1 transition-opacity duration-200 group-hover:opacity-0">
            {tags.slice(0, 3).map((t) => (
              <span key={t} className="flex items-center gap-0.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                <Hash className="h-2.5 w-2.5 opacity-70" />
                {t}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white/80 backdrop-blur-sm">
                +{tags.length - 3}
              </span>
            )}
          </div>
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
