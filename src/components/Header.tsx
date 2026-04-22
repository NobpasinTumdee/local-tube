import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';

interface Props {
  onPick: () => void;
}

export default function Header({ onPick }: Props) {
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const rootName = useStore((s) => s.rootName);

  const [localQ, setLocalQ] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  /* sync external → local */
  useEffect(() => setLocalQ(searchQuery), [searchQuery]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(localQ);
  }

  function clear() {
    setLocalQ('');
    setSearchQuery('');
    inputRef.current?.focus();
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-4 border-b border-white/5 bg-[#0f0f0f]/95 px-4 backdrop-blur-md">
      {/* hamburger */}
      <button
        id="sidebar-toggle"
        onClick={toggleSidebar}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10"
        aria-label="Toggle sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* logo */}
      <div className="flex shrink-0 items-center gap-1 select-none cursor-pointer" onClick={() => { useStore.getState().setActivePlaylist(null); useStore.getState().playVideo(null); }}>
        <svg viewBox="0 0 28 20" className="h-5 w-auto">
          <rect x="0" y="0" width="28" height="20" rx="4" className="fill-red-600" />
          <polygon points="11,4 11,16 21,10" className="fill-white" />
        </svg>
        <span className="ml-0.5 text-lg font-bold tracking-tight text-white">
          LocalTube
        </span>
      </div>

      {/* search bar */}
      <form onSubmit={submit} className="mx-auto flex w-full max-w-xl">
        <div className="relative flex w-full">
          <input
            ref={inputRef}
            id="search-input"
            type="text"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder="Search videos…"
            className="h-10 w-full rounded-l-full border border-white/10 bg-[#121212] pl-5 pr-10 text-sm text-white placeholder-white/40 outline-none transition focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
          />
          {localQ && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-[3.25rem] top-1/2 -translate-y-1/2 rounded-full p-1 text-white/50 hover:text-white"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            id="search-btn"
            className="flex h-10 w-16 shrink-0 items-center justify-center rounded-r-full border border-l-0 border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
            aria-label="Search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </form>

      {/* root folder label + re‑pick */}
      <button
        onClick={onPick}
        id="change-folder-btn"
        className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/70 transition hover:bg-white/10 sm:flex"
        title="Change folder"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span className="max-w-[120px] truncate">{rootName || 'Folder'}</span>
      </button>
    </header>
  );
}
