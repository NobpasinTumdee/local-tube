import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Folder, List, Search } from 'lucide-react';
import MediaCard from './MediaCard';
import Breadcrumb from './Breadcrumb';
import { useStore } from '../store/useStore';
import { getChildFolders, getAllFilesRecursively } from '../utils/directoryScanner';
import type { MediaEntry, FolderNode } from '../utils/directoryScanner';
import type { ViewMode, HomeFilter } from '../store/useStore';

interface Props {
  videos: MediaEntry[];
}

/* Cap the cascade so large libraries don't animate for seconds. */
const entryDelay = (i: number) => Math.min(i * 0.03, 0.4);

const matchesFilter = (v: MediaEntry, f: HomeFilter) =>
  f === 'all' || (f === 'videos' && v.mediaType === 'video') || (f === 'images' && v.mediaType === 'image');

export default function VideoGrid({ videos }: Props) {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const directoryTree = useStore((s) => s.directoryTree);
  const setCurrentFolder = useStore((s) => s.setCurrentFolder);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const allVideos = useStore((s) => s.videos);
  const homeFilter = useStore((s) => s.homeFilter);
  const searchQuery = useStore((s) => s.searchQuery);

  /* subfolders at the current level (only meaningful in nested mode) */
  const subfolders: FolderNode[] =
    viewMode === 'nested' && directoryTree
      ? getChildFolders(directoryTree, currentFolderPath)
      : [];

  /* Netflix-style "shelves" home: root + nested + not searching */
  const useShelves =
    currentFolderPath === '' &&
    viewMode === 'nested' &&
    !searchQuery.trim() &&
    !!directoryTree &&
    directoryTree.children.length > 0;

  const hasContent = subfolders.length > 0 || videos.length > 0;

  return (
    <div>
      {/* ── Top bar: breadcrumbs + view-mode toggle ── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <Breadcrumb />
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-content/[0.06] bg-content/[0.03] p-1">
          <ViewToggleBtn label="Folders" icon={<Folder className="h-3.5 w-3.5" />} value="nested" current={viewMode} onClick={setViewMode} />
          <ViewToggleBtn label="All Files" icon={<List className="h-3.5 w-3.5" />} value="flat" current={viewMode} onClick={setViewMode} />
        </div>
      </div>

      {!hasContent && <EmptyState />}

      {/* ══════════ SHELVES (streaming home) ══════════ */}
      {useShelves ? (
        <div className="flex flex-col gap-9">
          {directoryTree!.children.map((node, i) => {
            const ids = new Set(getAllFilesRecursively(allVideos, node.path));
            const items = allVideos.filter((v) => ids.has(v.id) && matchesFilter(v, homeFilter));
            if (items.length === 0) return null;
            return (
              <Shelf
                key={node.path}
                title={node.name}
                count={items.length}
                items={items.slice(0, 18)}
                index={i}
                onSeeAll={() => setCurrentFolder(node.path)}
              />
            );
          })}

          {/* Loose files sitting directly in the root folder */}
          {(() => {
            const rootFiles = allVideos.filter((v) => v.parentPath === '' && matchesFilter(v, homeFilter));
            if (rootFiles.length === 0) return null;
            return (
              <Shelf
                title="In this folder"
                count={rootFiles.length}
                items={rootFiles.slice(0, 18)}
                index={directoryTree!.children.length}
              />
            );
          })()}
        </div>
      ) : (
        <>
          {/* ── NESTED MODE: subfolder cards ── */}
          {viewMode === 'nested' && subfolders.length > 0 && (
            <div className="mb-9">
              {currentFolderPath === '' && <SectionTitle>Folders</SectionTitle>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {subfolders.map((folder, i) => (
                  <motion.div
                    key={folder.path}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: entryDelay(i), ease: 'easeOut' }}
                  >
                    <FolderCard folder={folder} onClick={() => setCurrentFolder(folder.path)} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* ── Media files grid ── */}
          {videos.length > 0 && (
            <>
              {viewMode === 'nested' && subfolders.length > 0 && <SectionTitle>Files</SectionTitle>}
              {viewMode === 'flat' && (
                <p className="mb-5 text-xs font-medium text-content/35">
                  {videos.length} file{videos.length !== 1 ? 's' : ''} · including subfolders
                </p>
              )}
              <div className="grid grid-cols-1 items-start gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {videos.map((v, i) => (
                  <motion.div
                    key={v.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: entryDelay(i), ease: 'easeOut' }}
                  >
                    <MediaCard video={v} />
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Horizontal shelf (carousel) ─── */
function Shelf({
  title,
  count,
  items,
  index,
  onSeeAll,
}: {
  title: string;
  count: number;
  items: MediaEntry[];
  index: number;
  onSeeAll?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.08, 0.5), ease: 'easeOut' }}
      className="group/shelf"
    >
      {/* header */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <button
          onClick={onSeeAll}
          disabled={!onSeeAll}
          className="flex items-center gap-2 text-left disabled:cursor-default"
        >
          <span className="h-5 w-1 rounded-full bg-primary" />
          <h2 className="text-lg font-bold tracking-tight text-content">{title}</h2>
          <span className="rounded-full bg-content/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-content/50">
            {count}
          </span>
          {onSeeAll && (
            <span className="ml-1 flex items-center text-xs font-medium text-content/40 opacity-0 transition-all group-hover/shelf:translate-x-0.5 group-hover/shelf:opacity-100">
              See all <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </button>

        {/* scroll controls */}
        <div className="hidden shrink-0 gap-1 opacity-0 transition-opacity group-hover/shelf:opacity-100 sm:flex">
          <ArrowBtn onClick={() => scroll(-1)} label="Scroll left"><ChevronLeft className="h-4 w-4" /></ArrowBtn>
          <ArrowBtn onClick={() => scroll(1)} label="Scroll right"><ChevronRight className="h-4 w-4" /></ArrowBtn>
        </div>
      </div>

      {/* rail */}
      <div
        ref={scrollRef}
        className="scrollbar-hidden -mx-1 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto scroll-smooth px-1 pb-2"
      >
        {items.map((v) => (
          <div key={v.id} className="w-[260px] shrink-0 snap-start sm:w-[280px]">
            <MediaCard video={v} />
          </div>
        ))}
      </div>
    </motion.section>
  );
}

function ArrowBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-content/10 bg-content/5 text-content/70 transition hover:bg-content/15 hover:text-content"
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="h-5 w-1 rounded-full bg-primary" />
      <h2 className="text-lg font-bold tracking-tight text-content">{children}</h2>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-content/30">
      <Search className="h-14 w-14" strokeWidth={1} />
      <p className="text-lg font-semibold text-content/50">No media found</p>
      <p className="text-sm">Try a different filter, search term, or select another folder.</p>
    </div>
  );
}

/* ── View mode toggle button ── */
function ViewToggleBtn({
  label, icon, value, current, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  value: ViewMode;
  current: ViewMode;
  onClick: (v: ViewMode) => void;
}) {
  const active = value === current;
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
        active ? 'bg-content/15 text-content shadow-sm' : 'text-content/40 hover:bg-content/5 hover:text-content/70'
      }`}
      title={label}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Folder Card (premium tile) ── */
function FolderCard({ folder, onClick }: { folder: FolderNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group/f flex items-center gap-3 rounded-2xl border border-content/[0.06] bg-content/[0.03] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-content/[0.06] hover:shadow-lg hover:shadow-black/20"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-500/5 ring-1 ring-amber-400/20">
        <Folder className="h-5 w-5 fill-amber-400/70 text-amber-400/80" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-content/90 group-hover/f:text-content">{folder.name}</p>
        <p className="text-xs font-medium text-content/40">
          {folder.mediaCount} item{folder.mediaCount !== 1 ? 's' : ''}
          {folder.children.length > 0 && ` · ${folder.children.length} folder${folder.children.length !== 1 ? 's' : ''}`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-content/20 transition-all group-hover/f:translate-x-0.5 group-hover/f:text-primary" />
    </button>
  );
}
