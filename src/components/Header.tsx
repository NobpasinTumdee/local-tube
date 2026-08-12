import { useState, useRef, useEffect } from 'react';
import { Layers, Loader2, Settings } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useLibraryStore } from '../store/useLibraryStore';
import ThemeSwitcher from './ThemeSwitcher';
import LayoutSelector from './LayoutSelector';
import SettingsModal from './SettingsModal';
import WebRTCBar from './WebRTCBar';

interface Props {
  onOpenWorkspace: () => void;
}

export default function Header({ onOpenWorkspace }: Props) {
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const rootName = useStore((s) => s.rootName);
  const scanning = useStore((s) => s.scanning);
  const mountCount = useLibraryStore((s) => s.activeHandles.length);
  const pendingCount = useLibraryStore((s) => s.pendingRestore.length);

  const [localQ, setLocalQ] = useState(searchQuery);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-4 border-b border-content/5 bg-base/95 px-4 backdrop-blur-md">
      {/* hamburger */}
      <button
        id="sidebar-toggle"
        onClick={toggleSidebar}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content/80 transition hover:bg-content/10"
        aria-label="Toggle sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* logo — click goes home (video keeps playing in mini-player) */}
      <div className="flex shrink-0 items-center gap-1 select-none cursor-pointer" onClick={() => { useStore.getState().setActivePlaylist(null); useStore.getState().goHome(); }}>
        <svg viewBox="0 0 28 20" className="h-5 w-auto">
          <rect x="0" y="0" width="28" height="20" rx="4" className="fill-primary" />
          <polygon points="11,4 11,16 21,10" className="fill-content" />
        </svg>
        <span className="ml-0.5 text-lg font-bold tracking-tight text-content">
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
            className="h-10 w-full rounded-l-full border border-content/10 bg-surface pl-5 pr-10 text-sm text-content placeholder-content/40 outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          />
          {localQ && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-[3.25rem] top-1/2 -translate-y-1/2 rounded-full p-1 text-content/50 hover:text-content"
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
            className="flex h-10 w-16 shrink-0 items-center justify-center rounded-r-full border border-l-0 border-content/10 bg-content/5 text-content/70 transition hover:bg-content/10"
            aria-label="Search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </form>

      {/*
        Workspace entry point. Replaces the old "change folder" button: with
        several folders mountable at once, the meaningful action is managing
        the set rather than swapping the one root.
      */}
      <button
        onClick={onOpenWorkspace}
        id="change-folder-btn"
        className="relative hidden shrink-0 items-center gap-1.5 rounded-full border border-content/10 bg-content/5 px-4 py-1.5 text-xs text-content/70 transition hover:bg-content/10 sm:flex"
        title="Manage workspace folders & presets"
      >
        {scanning ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-content/50" />
        ) : (
          <Layers className="h-4 w-4 shrink-0" />
        )}
        <span className="max-w-[140px] truncate">{rootName || 'Workspace'}</span>
        {mountCount > 1 && (
          <span className="shrink-0 rounded-full bg-content/10 px-1.5 text-[10px] font-bold tabular-nums text-content/60">
            {mountCount}
          </span>
        )}
        {pendingCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-base"
            title={`${pendingCount} folder(s) need permission again`}
          />
        )}
      </button>

      {/* peer-to-peer sharing (opt-in — nothing runs until it's switched on) */}
      <WebRTCBar />

      {/* multi-video layout */}
      <LayoutSelector />

      {/* theme picker */}
      <ThemeSwitcher />

      {/* settings / backup */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content/80 transition hover:bg-content/10"
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="h-5 w-5" />
      </button>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
