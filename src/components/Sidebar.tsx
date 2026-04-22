import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { HomeFilter } from '../store/useStore';
import type { FolderNode } from '../utils/directoryScanner';

export default function Sidebar() {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const setCurrentFolder = useStore((s) => s.setCurrentFolder);
  const homeFilter = useStore((s) => s.homeFilter);
  const setHomeFilter = useStore((s) => s.setHomeFilter);
  const directoryTree = useStore((s) => s.directoryTree);

  /* filter pill */
  const filterBtn = (label: string, val: HomeFilter) => (
    <button
      key={val}
      onClick={() => setHomeFilter(val)}
      className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition ${
        homeFilter === val
          ? 'bg-white/15 text-white'
          : 'text-white/40 hover:bg-white/5 hover:text-white/70'
      }`}
    >
      {label}
    </button>
  );

  return (
    <aside className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[#0f0f0f] px-3 py-4">

      {/* ── Show filter ── */}
      <div className="mb-3">
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/25">Show</div>
        <div className="flex gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-1">
          {filterBtn('All', 'all')}
          {filterBtn('Videos', 'videos')}
          {filterBtn('Images', 'images')}
        </div>
      </div>

      <div className="mb-2 h-px bg-white/5" />

      {/* ── Home (root) ── */}
      <button
        onClick={() => setCurrentFolder('')}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
          currentFolderPath === ''
            ? 'bg-white/10 font-medium text-white'
            : 'text-white/60 hover:bg-white/5 hover:text-white/90'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m3 12 2-2m0 0 7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11 2 2m-2-2v10a1 1 0 0 1-1 1h-3m-4 0v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4" />
        </svg>
        <span className="flex-1 truncate text-left">Home</span>
        <span className="text-[11px] tabular-nums text-white/30">{directoryTree?.mediaCount ?? 0}</span>
      </button>

      {/* ── Collapsible folder tree ── */}
      {directoryTree && directoryTree.children.length > 0 && (
        <>
          <div className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/25">Folders</div>
          {directoryTree.children.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              currentFolderPath={currentFolderPath}
              onNavigate={setCurrentFolder}
              depth={0}
            />
          ))}
        </>
      )}
    </aside>
  );
}

/* ── Recursive tree node ── */
interface TreeNodeProps {
  node: FolderNode;
  currentFolderPath: string;
  onNavigate: (path: string) => void;
  depth: number;
}

function TreeNode({ node, currentFolderPath, onNavigate, depth }: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  /* auto-expand if any descendant is the current path */
  const isOrContainsCurrent =
    currentFolderPath === node.path ||
    currentFolderPath.startsWith(node.path + '/');
  const [open, setOpen] = useState(isOrContainsCurrent);
  const isActive = currentFolderPath === node.path;

  return (
    <div>
      <div
        className={`flex w-full items-center rounded-lg text-sm transition ${
          isActive
            ? 'bg-white/10 font-medium text-white'
            : 'text-white/55 hover:bg-white/5 hover:text-white/90'
        }`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        {/* expand/collapse chevron */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-6 shrink-0 items-center justify-center"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
        </button>

        {/* folder icon + name */}
        <button
          onClick={() => onNavigate(node.path)}
          className="flex flex-1 items-center gap-2 overflow-hidden py-1.5 pr-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-yellow-400/70" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
          </svg>
          <span className="flex-1 truncate text-left text-[13px]">{node.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-white/25">{node.mediaCount}</span>
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
