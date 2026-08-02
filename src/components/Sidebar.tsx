import { useState, useMemo } from 'react';
import {
  Home,
  Film,
  Image as ImageIcon,
  Library,
  Folder,
  FolderOpen,
  ChevronRight,
  Clock,
  PlayCircle,
  Heart,
  ListMusic,
  Plus,
  Trash2,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { HomeFilter, VirtualPlaylist } from '../store/useStore';
import type { FolderNode } from '../utils/directoryScanner';

export default function Sidebar() {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const setCurrentFolder = useStore((s) => s.setCurrentFolder);
  const homeFilter = useStore((s) => s.homeFilter);
  const setHomeFilter = useStore((s) => s.setHomeFilter);
  const directoryTree = useStore((s) => s.directoryTree);
  const videos = useStore((s) => s.videos);
  const recentVideoIds = useStore((s) => s.recentVideoIds);
  const playVideo = useStore((s) => s.playVideo);
  const videoMeta = useStore((s) => s.videoMeta);
  const currentVideoId = useStore((s) => s.currentVideoId);
  const view = useStore((s) => s.view);

  /* virtual collections */
  const collection = useStore((s) => s.collection);
  const favorites = useStore((s) => s.favorites);
  const virtualPlaylists = useStore((s) => s.virtualPlaylists);
  const setCollection = useStore((s) => s.setCollection);
  const createPlaylist = useStore((s) => s.createPlaylist);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const isHomeView = view !== 'playing';
  const inLibrary = collection.type === 'all';
  const atRoot = currentFolderPath === '' && isHomeView && inLibrary;

  const submitNewPlaylist = () => {
    const name = newName.trim();
    if (!name) return;
    setCollection({ type: 'playlist', playlistId: createPlaylist(name) });
    setNewName('');
    setNewOpen(false);
  };

  const recentItems = useMemo(
    () =>
      recentVideoIds
        .map((id) => videos.find((v) => v.id === id))
        .filter((v): v is NonNullable<typeof v> => !!v)
        .slice(0, 5),
    [recentVideoIds, videos],
  );

  return (
    <aside
      className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col overflow-y-auto border-r border-content/[0.04] bg-base/80 backdrop-blur-2xl scrollbar-hidden"
    >
      {/* subtle top-down gradient for premium feel */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-content/[0.02] via-transparent to-transparent" />

      <div className="relative flex flex-1 flex-col px-3 py-4">
        {/* ── LIBRARY ── */}
        <SectionLabel icon={<Library className="h-3 w-3" />}>Library</SectionLabel>

        <NavItem
          icon={<Home className="h-[18px] w-[18px]" />}
          label="All Media"
          count={directoryTree?.mediaCount ?? 0}
          active={atRoot && homeFilter === 'all'}
          onClick={() => { setCurrentFolder(''); setHomeFilter('all'); }}
        />
        <FilterItem
          icon={<Film className="h-[18px] w-[18px]" />}
          label="Videos"
          value="videos"
          current={homeFilter}
          onClick={setHomeFilter}
          count={videos.filter((v) => v.mediaType === 'video').length}
        />
        <FilterItem
          icon={<ImageIcon className="h-[18px] w-[18px]" />}
          label="Images"
          value="images"
          current={homeFilter}
          onClick={setHomeFilter}
          count={videos.filter((v) => v.mediaType === 'image').length}
        />

        {/* ── COLLECTIONS ── */}
        <Divider />
        <NavItem
          icon={<Heart className={`h-[18px] w-[18px] ${collection.type === 'favorites' ? 'fill-current' : ''}`} />}
          label="Favorites"
          count={favorites.length}
          active={collection.type === 'favorites'}
          onClick={() => setCollection({ type: 'favorites' })}
        />

        <div className="mt-1 flex items-center justify-between pr-1">
          <SectionLabel icon={<ListMusic className="h-3 w-3" />}>Playlists</SectionLabel>
          <button
            onClick={() => setNewOpen((o) => !o)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-content/40 transition hover:bg-content/10 hover:text-content"
            aria-label="New playlist"
            title="New playlist"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {newOpen && (
          <div className="mb-1 flex items-center gap-1 px-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewPlaylist();
                if (e.key === 'Escape') { setNewOpen(false); setNewName(''); }
              }}
              placeholder="Playlist name…"
              className="h-8 min-w-0 flex-1 rounded-lg border border-content/10 bg-content/5 px-2 text-[13px] text-content placeholder-content/40 outline-none focus:border-primary/50"
            />
            <button
              onClick={submitNewPlaylist}
              disabled={!newName.trim()}
              className="flex h-8 shrink-0 items-center rounded-lg bg-primary px-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}

        {virtualPlaylists.length === 0 && !newOpen && (
          <p className="px-3 py-1 text-[11px] text-content/30">No playlists yet.</p>
        )}
        <div className="flex flex-col">
          {virtualPlaylists.map((p) => (
            <PlaylistItem
              key={p.id}
              playlist={p}
              active={collection.type === 'playlist' && collection.playlistId === p.id}
              onOpen={() => setCollection({ type: 'playlist', playlistId: p.id })}
            />
          ))}
        </div>

        {/* ── FOLDERS ── */}
        {directoryTree && directoryTree.children.length > 0 && (
          <>
            <Divider />
            <SectionLabel icon={<Folder className="h-3 w-3" />}>Folders</SectionLabel>
            <div className="flex flex-col">
              {directoryTree.children.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  currentFolderPath={currentFolderPath}
                  onNavigate={setCurrentFolder}
                  depth={0}
                />
              ))}
            </div>
          </>
        )}

        {/* ── RECENT ── */}
        {recentItems.length > 0 && (
          <>
            <Divider />
            <SectionLabel icon={<Clock className="h-3 w-3" />}>Recent</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {recentItems.map((v) => {
                const active = currentVideoId === v.id;
                const thumb = videoMeta[v.id]?.thumbnailUrl;
                return (
                  <button
                    key={v.id}
                    onClick={() => playVideo(v.id)}
                    className={`relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${
                      active
                        ? 'bg-content/[0.07] text-content'
                        : 'text-content/60 hover:bg-content/[0.04] hover:text-content/95'
                    }`}
                  >
                    {active && <ActiveBar />}
                    <div className="relative h-8 w-12 shrink-0 overflow-hidden rounded bg-content/5">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <PlayCircle className="h-4 w-4 text-content/20" />
                        </div>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[12px]">{v.title}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* footer tag */}
        <div className="mt-4 px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-content/20">
          Local Media Hub
        </div>
      </div>
    </aside>
  );
}

/* ─── Section label ─── */
function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-1 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-content/30">
      {icon}
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-3 h-px bg-gradient-to-r from-transparent via-content/[0.06] to-transparent" />;
}

/* ─── Active red vertical bar (Netflix-style indicator) ─── */
function ActiveBar() {
  return (
    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_rgb(var(--color-primary)/0.6)]" />
  );
}

/* ─── Generic nav item (Home / All Media) ─── */
function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
        active
          ? 'bg-primary/[0.12] font-semibold text-content'
          : 'font-medium text-content/65 hover:bg-content/[0.05] hover:text-content'
      }`}
    >
      {active && <ActiveBar />}
      <span className={`shrink-0 transition-transform duration-200 ${active ? 'text-primary' : 'text-content/60 group-hover:scale-110 group-hover:text-content'}`}>
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count != null && (
        <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors ${
          active ? 'bg-primary/20 text-primary' : 'text-content/30 group-hover:text-content/50'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ─── Library filter item (Videos / Images) ─── */
function FilterItem({
  icon,
  label,
  value,
  current,
  onClick,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  value: HomeFilter;
  current: HomeFilter;
  onClick: (v: HomeFilter) => void;
  count: number;
}) {
  const setCurrentFolder = useStore((s) => s.setCurrentFolder);
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const view = useStore((s) => s.view);
  const inLibrary = useStore((s) => s.collection.type === 'all');
  const active = inLibrary && current === value && currentFolderPath === '' && view !== 'playing';
  return (
    <NavItem
      icon={icon}
      label={label}
      count={count}
      active={active}
      onClick={() => { setCurrentFolder(''); onClick(value); }}
    />
  );
}

/* ─── Virtual playlist item (with delete-on-hover) ─── */
function PlaylistItem({
  playlist,
  active,
  onOpen,
}: {
  playlist: VirtualPlaylist;
  active: boolean;
  onOpen: () => void;
}) {
  const deletePlaylist = useStore((s) => s.deletePlaylist);
  return (
    <div
      className={`group relative mb-0.5 flex w-full items-center rounded-xl text-sm transition-all duration-200 ${
        active ? 'bg-primary/[0.12] font-semibold text-content' : 'font-medium text-content/65 hover:bg-content/[0.05] hover:text-content'
      }`}
    >
      {active && <ActiveBar />}
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-1">
        <ListMusic className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-primary' : 'text-content/60'}`} />
        <span className="min-w-0 flex-1 truncate text-left">{playlist.title}</span>
        <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${active ? 'bg-primary/20 text-primary' : 'text-content/30'}`}>
          {playlist.mediaIds.length}
        </span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete playlist “${playlist.title}”?`)) deletePlaylist(playlist.id); }}
        className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content/30 opacity-0 transition hover:bg-content/10 hover:text-primary group-hover:opacity-100"
        aria-label="Delete playlist"
        title="Delete playlist"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─── Recursive tree node ─── */
interface TreeNodeProps {
  node: FolderNode;
  currentFolderPath: string;
  onNavigate: (path: string) => void;
  depth: number;
}

function TreeNode({ node, currentFolderPath, onNavigate, depth }: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isOrContainsCurrent =
    currentFolderPath === node.path ||
    currentFolderPath.startsWith(node.path + '/');
  const [open, setOpen] = useState(isOrContainsCurrent);
  const isActive = currentFolderPath === node.path;

  return (
    <div>
      <div
        className={`group relative mb-0.5 flex w-full items-center rounded-xl text-sm transition-all duration-200 ${
          isActive
            ? 'bg-primary/[0.12] font-semibold text-content'
            : 'font-medium text-content/60 hover:bg-content/[0.05] hover:text-content/95'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {isActive && <ActiveBar />}

        {/* expand/collapse chevron */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-6 shrink-0 items-center justify-center text-content/40 transition hover:text-content/80"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
        </button>

        {/* folder icon + name */}
        <button
          onClick={() => onNavigate(node.path)}
          className="flex flex-1 items-center gap-2 overflow-hidden py-1.5 pr-2"
        >
          {open && hasChildren ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-400/80" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-400/70" />
          )}
          <span className="flex-1 truncate text-left text-[13px]">{node.name}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-content/25">{node.mediaCount}</span>
        </button>
      </div>

      {/* children */}
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              currentFolderPath={currentFolderPath}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
