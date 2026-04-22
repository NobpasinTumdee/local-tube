import { useMemo } from 'react';
import { useStore } from './store/useStore';
import { scanDirectory } from './utils/directoryScanner';
import Welcome from './components/Welcome';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import VideoGrid from './components/VideoGrid';
import Player from './components/Player';

export default function App() {
  const videos = useStore((s) => s.videos);
  const playlists = useStore((s) => s.playlists);
  const activePlaylist = useStore((s) => s.activePlaylist);
  const searchQuery = useStore((s) => s.searchQuery);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const currentVideoId = useStore((s) => s.currentVideoId);
  const setLibrary = useStore((s) => s.setLibrary);

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

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videos.filter(
      (v) =>
        (!activePlaylist || v.playlist === activePlaylist) &&
        (!q || v.title.toLowerCase().includes(q)),
    );
  }, [videos, activePlaylist, searchQuery]);

  if (videos.length === 0) return <Welcome onPick={pickFolder} />;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header onPick={pickFolder} />
      <div className="flex pt-14">
        {sidebarOpen && <Sidebar playlists={playlists} />}
        <main className="flex-1 p-6">
          <VideoGrid videos={visible} />
        </main>
      </div>
      {currentVideoId && <Player />}
    </div>
  );
}
