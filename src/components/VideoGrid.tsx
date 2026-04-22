import MediaCard from './VideoCard';
import Breadcrumb from './Breadcrumb';
import { useStore } from '../store/useStore';
import { getChildFolders } from '../utils/directoryScanner';
import type { MediaEntry, FolderNode } from '../utils/directoryScanner';

interface Props {
  videos: MediaEntry[];
}

export default function VideoGrid({ videos }: Props) {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const directoryTree = useStore((s) => s.directoryTree);
  const setCurrentFolder = useStore((s) => s.setCurrentFolder);

  /* subfolders at the current level */
  const subfolders: FolderNode[] = directoryTree
    ? getChildFolders(directoryTree, currentFolderPath)
    : [];

  const hasContent = subfolders.length > 0 || videos.length > 0;

  return (
    <div>
      <Breadcrumb />

      {!hasContent && (
        <div className="flex flex-col items-center justify-center gap-3 py-32 text-white/30">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p className="text-lg font-medium">No media found</p>
          <p className="text-sm">Try a different filter, search term, or select another folder.</p>
        </div>
      )}

      {/* ── Subfolder cards ── */}
      {subfolders.length > 0 && (
        <div className="mb-8">
          {currentFolderPath === '' && (
            <h2 className="mb-3 text-sm font-semibold text-white/40 uppercase tracking-wider">Folders</h2>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {subfolders.map((folder) => (
              <FolderCard key={folder.path} folder={folder} onClick={() => setCurrentFolder(folder.path)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Media files ── */}
      {videos.length > 0 && (
        <>
          {subfolders.length > 0 && (
            <h2 className="mb-3 text-sm font-semibold text-white/40 uppercase tracking-wider">Files</h2>
          )}
          <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {videos.map((v) => (
              <MediaCard key={v.id} video={v} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Folder Card ── */
function FolderCard({ folder, onClick }: { folder: FolderNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3.5 text-left transition hover:border-white/10 hover:bg-white/[0.07]"
    >
      {/* folder icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400/80" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/85 group-hover:text-white">
          {folder.name}
        </p>
        <p className="text-xs text-white/35">
          {folder.mediaCount} item{folder.mediaCount !== 1 ? 's' : ''}
          {folder.children.length > 0 && ` · ${folder.children.length} folder${folder.children.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-white/20 transition group-hover:text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
