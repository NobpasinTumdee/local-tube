import { useMemo, useEffect } from 'react';
import { useStore } from './store/useStore';
import { scanDirectory, getAllFilesRecursively } from './utils/directoryScanner';
import Welcome from './components/Welcome';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import VideoGrid from './components/VideoGrid';
import Player from './components/Player';
import ImageViewer from './components/ImageViewer';

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

  /*
   * Visible list rules:
   * - Searching: global across all files (both modes)
   * - nested: only direct children (parentPath === currentFolderPath)
   * - flat:   all files recursively under currentFolderPath
   */
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const idSet =
      !q && viewMode === 'flat'
        ? new Set(getAllFilesRecursively(videos, currentFolderPath))
        : null;

    return videos.filter((v) => {
      if (q) {
        if (!v.title.toLowerCase().includes(q)) return false;
      } else if (viewMode === 'flat') {
        if (!idSet!.has(v.id)) return false;
      } else {
        // nested: direct children only
        if (v.parentPath !== currentFolderPath) return false;
      }
      if (homeFilter === 'videos' && v.mediaType !== 'video') return false;
      if (homeFilter === 'images' && v.mediaType !== 'image') return false;
      return true;
    });
  }, [videos, currentFolderPath, searchQuery, homeFilter, viewMode]);

  /*
   * Keep the player's playback queue aligned with what the user is browsing,
   * so "next video" = files[currentIndex + 1] within the current folder/filter.
   * Videos only — images never auto-advance.
   */
  useEffect(() => {
    setPlaybackQueue(visible.filter((v) => v.mediaType === 'video').map((v) => v.id));
  }, [visible, setPlaybackQueue]);

  if (videos.length === 0) return <Welcome onPick={pickFolder} />;

  const showHome = view === 'home' || playerMode === 'mini';

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header onPick={pickFolder} />

      {showHome && (
        <div className="flex pt-14">
          {sidebarOpen && <Sidebar />}
          <main className="flex-1 overflow-y-auto p-6">
            <VideoGrid videos={visible} />
          </main>
        </div>
      )}

      {currentVideoId && <Player />}
      {currentImageId && view === 'viewing_image' && <ImageViewer />}
    </div>
  );
}
