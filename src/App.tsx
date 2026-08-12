import { useMemo, useEffect } from 'react';
import { useStore } from './store/useStore';
import { scanDirectory, getAllFilesRecursively } from './utils/directoryScanner';
import type { MediaEntry } from './utils/directoryScanner';
import Welcome from './components/Welcome';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MediaGrid from './components/MediaGrid';
import Player from './components/Player';
import ImageViewer from './components/ImageViewer';
import MediaViewer from './components/MediaViewer';
import FilterBar from './components/FilterBar';
import GridSettingsBar from './components/GridSettingsBar';
import BroadcastView from './components/BroadcastView';
import WatchPartyLobby from './components/WatchPartyLobby';
import InviteJoinModal from './components/InviteJoinModal';

export default function App() {
  const videos = useStore((s) => s.videos);
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const searchQuery = useStore((s) => s.searchQuery);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const view = useStore((s) => s.view);
  const playerMode = useStore((s) => s.playerMode);
  const homeFilter = useStore((s) => s.homeFilter);
  const setLibrary = useStore((s) => s.setLibrary);
  const toggleMiniPlayer = useStore((s) => s.toggleMiniPlayer);
  const currentVideoId = useStore((s) => s.currentVideoId);
  const currentImageId = useStore((s) => s.currentImageId);
  const layoutMode = useStore((s) => s.layoutMode);

  async function pickFolder() {
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support the File System Access API. Use Chrome or Edge.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker();
      const result = await scanDirectory(handle);
      setLibrary(result);
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') console.error(err);
    }
  }

  /* global 'i' key for mini-player toggle */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'i' && currentVideoId) {
        e.preventDefault();
        toggleMiniPlayer();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentVideoId, toggleMiniPlayer]);

  const viewMode = useStore((s) => s.viewMode);
  const setPlaybackQueue = useStore((s) => s.setPlaybackQueue);
  const collection = useStore((s) => s.collection);
  const favorites = useStore((s) => s.favorites);
  const virtualPlaylists = useStore((s) => s.virtualPlaylists);
  const mediaTags = useStore((s) => s.mediaTags);
  const activeFilterTags = useStore((s) => s.activeFilterTags);

  /*
   * Visible list rules:
   * - Virtual collection (favorites / playlist): flat across the whole library,
   *   matched + ordered by the stored mediaId list, still honoring search + type.
   * - Searching: global across all files (both modes)
   * - nested: only direct children (parentPath === currentFolderPath)
   * - flat:   all files recursively under currentFolderPath
   */
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearchAndType = (v: MediaEntry) => {
      if (q && !v.title.toLowerCase().includes(q)) return false;
      if (homeFilter === 'videos' && v.mediaType !== 'video') return false;
      if (homeFilter === 'images' && v.mediaType !== 'image') return false;
      /* tag filter — item must carry ALL active tags (intersection) */
      if (activeFilterTags.length) {
        const t = mediaTags[v.id] ?? [];
        if (!activeFilterTags.every((tag) => t.includes(tag))) return false;
      }
      return true;
    };

    /* Virtual collections resolve mediaIds → entries, preserving their order. */
    if (collection.type !== 'all') {
      const ids =
        collection.type === 'favorites'
          ? favorites
          : virtualPlaylists.find((p) => p.id === collection.playlistId)?.mediaIds ?? [];
      const byId = new Map(videos.map((v) => [v.id, v] as const));
      return ids
        .map((id) => byId.get(id))
        .filter((v): v is MediaEntry => !!v && matchesSearchAndType(v));
    }

    const idSet =
      !q && viewMode === 'flat'
        ? new Set(getAllFilesRecursively(videos, currentFolderPath))
        : null;

    return videos.filter((v) => {
      if (q) {
        return matchesSearchAndType(v); // global search
      }
      if (viewMode === 'flat') {
        if (!idSet!.has(v.id)) return false;
      } else if (v.parentPath !== currentFolderPath) {
        return false; // nested: direct children only
      }
      return matchesSearchAndType(v);
    });
  }, [videos, currentFolderPath, searchQuery, homeFilter, viewMode, collection, favorites, virtualPlaylists, mediaTags, activeFilterTags]);

  /*
   * Keep the player's playback queue aligned with what the user is browsing,
   * so "next video" = files[currentIndex + 1] within the current folder/filter.
   * Videos only — images never auto-advance.
   */
  useEffect(() => {
    setPlaybackQueue(visible.filter((v) => v.mediaType === 'video').map((v) => v.id));
  }, [visible, setPlaybackQueue]);

  /* No library yet — but a guest with no folder can still be watching a
   * peer's broadcast, so the viewer is mounted on this branch too. */
  if (videos.length === 0) {
    return (
      <>
        <Welcome onSelectFolder={pickFolder} />
        {/* An invited guest usually arrives with no folder at all, so the
            invite prompt has to live on this branch too. */}
        <InviteJoinModal />
        <WatchPartyLobby />
        <BroadcastView />
      </>
    );
  }

  /* Layout mode keeps the library visible so users can fill slots. */
  const showHome = layoutMode || view === 'home' || playerMode === 'mini';

  return (
    <div className="min-h-screen bg-base text-content">
      <Header onPick={pickFolder} />

      {showHome && (
        <div className="flex pt-14">
          {sidebarOpen && <Sidebar />}
          <main className="flex-1 overflow-y-auto p-6">
            {layoutMode && (
              <div className="mb-6">
                <MediaViewer />
              </div>
            )}
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <FilterBar />
              </div>
              <GridSettingsBar />
            </div>
            <MediaGrid videos={visible} />
          </main>
        </div>
      )}

      {/* Single-video player is suppressed while the multi-grid is active */}
      {!layoutMode && currentVideoId && <Player />}
      {currentImageId && view === 'viewing_image' && <ImageViewer />}

      {/* Watch-party room + the fullscreen viewer it hands off to.
          Both render null unless a P2P session is live. */}
      <InviteJoinModal />
      <WatchPartyLobby />
      <BroadcastView />
    </div>
  );
}
