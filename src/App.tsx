import { useMemo, useEffect, useRef, useState } from 'react';
import { useStore } from './store/useStore';
import { useLibraryStore } from './store/useLibraryStore';
import {
  scanMultipleDirectories,
  getAllFilesRecursively,
  emptyScanResult,
} from './utils/directoryScanner';
import type { MediaEntry } from './utils/directoryScanner';
import LibraryManager from './components/LibraryManager';
import StealthOverlay from './components/StealthOverlay';
import PiPStage from './components/PiPStage';
import VaultModal from './components/VaultModal';
import { useStealthMode } from './hooks/useStealthMode';
import { useVaultHiddenIds, useVaultSession } from './hooks/useVaultGuard';
import { useVaultStore } from './store/useVaultStore';
import { usePiPStore } from './hooks/useDocumentPiP';
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

  /* ── workspace ───────────────────────────────────────────── */
  const activeHandles = useLibraryStore((s) => s.activeHandles);
  const pendingRestore = useLibraryStore((s) => s.pendingRestore);
  const workspaceHydrated = useLibraryStore((s) => s.hydrated);
  const hydrateWorkspace = useLibraryStore((s) => s.hydrate);
  const addHandleToActive = useLibraryStore((s) => s.addHandleToActive);
  const setScanning = useStore((s) => s.setScanning);

  const [managerOpen, setManagerOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);

  /* ── privacy & vault (mounted once, at the root) ────────── */
  useStealthMode();
  useVaultSession();
  const vaultHiddenIds = useVaultHiddenIds();
  const vaultMediaIds = useVaultStore((s) => s.mediaIds);
  const isVaultUnlocked = useVaultStore((s) => s.isVaultUnlocked);
  const pipWindow = usePiPStore((s) => s.pipWindow);

  useEffect(() => {
    void hydrateWorkspace();
  }, [hydrateWorkspace]);

  /*
   * Folders restored from IndexedDB come back without their permission grant,
   * and re-granting needs a click. Opening the manager once makes that the
   * obvious next action instead of leaving the user with an empty library and
   * no explanation.
   */
  const promptedForRestore = useRef(false);
  useEffect(() => {
    if (!workspaceHydrated || promptedForRestore.current) return;
    if (pendingRestore.length > 0) {
      promptedForRestore.current = true;
      setManagerOpen(true);
    }
  }, [workspaceHydrated, pendingRestore.length]);

  /*
   * The mounted set is the single source of truth for the library: any change
   * (add, remove, preset load) re-scans and re-merges. The generation guard
   * drops results from a scan that a newer one has already superseded, so a
   * quick add→remove can't land stale files in the grid.
   */
  const scanGeneration = useRef(0);
  useEffect(() => {
    if (!workspaceHydrated) return;
    const generation = ++scanGeneration.current;

    if (activeHandles.length === 0) {
      setLibrary(emptyScanResult());
      setScanning(false);
      return;
    }

    setScanning(true, 0);
    scanMultipleDirectories(activeHandles, (count) => {
      if (generation === scanGeneration.current) setScanning(true, count);
    })
      .then((result) => {
        if (generation !== scanGeneration.current) return;
        setLibrary(result);
        const failed = result.roots.filter((r) => r.error);
        if (failed.length) {
          useLibraryStore
            .getState()
            .setError(`Could not read: ${failed.map((r) => r.name).join(', ')}`);
        }
      })
      .catch((err) => {
        console.error('[workspace] scan failed', err);
        if (generation === scanGeneration.current) {
          useLibraryStore.getState().setError('Scanning the workspace failed.');
        }
      })
      .finally(() => {
        if (generation === scanGeneration.current) setScanning(false);
      });
  }, [activeHandles, workspaceHydrated, setLibrary, setScanning]);

  /* Adds one folder to the workspace; the effect above re-scans and merges. */
  async function pickFolder() {
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support the File System Access API. Use Chrome or Edge.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      await addHandleToActive(handle);
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

    /*
     * The vault hides its members from every OTHER view while locked. It can
     * do that without knowing which files they are: useVaultHiddenIds
     * resolves the stored salted digests against the current library, so
     * this stays a plain Set lookup. Unlocked, the set is empty and the
     * items reappear normally.
     */
    const isHidden = (v: MediaEntry) => vaultHiddenIds.has(v.id);

    /* Virtual collections resolve mediaIds → entries, preserving their order. */
    if (collection.type !== 'all') {
      const ids =
        collection.type === 'favorites'
          ? favorites
          : collection.type === 'vault'
            ? vaultMediaIds
            : virtualPlaylists.find((p) => p.id === collection.playlistId)?.mediaIds ?? [];
      const byId = new Map(videos.map((v) => [v.id, v] as const));
      return ids
        .map((id) => byId.get(id))
        .filter((v): v is MediaEntry => {
          if (!v || !matchesSearchAndType(v)) return false;
          /* The vault's own view is the one place hidden items belong. */
          return collection.type === 'vault' || !isHidden(v);
        });
    }

    const idSet =
      !q && viewMode === 'flat'
        ? new Set(getAllFilesRecursively(videos, currentFolderPath))
        : null;

    return videos.filter((v) => {
      if (isHidden(v)) return false;
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
  }, [videos, currentFolderPath, searchQuery, homeFilter, viewMode, collection, favorites, virtualPlaylists, mediaTags, activeFilterTags, vaultHiddenIds, vaultMediaIds]);

  /* A locked vault must not leave its items selected in the grid or queued
     for autoplay — that would leak them right past the filter above. */
  useEffect(() => {
    if (isVaultUnlocked) return;
    const s = useStore.getState();
    if (s.currentVideoId && vaultHiddenIds.has(s.currentVideoId)) s.closePlayer();
    if (s.collection.type === 'vault') s.setCollection({ type: 'all' });
  }, [isVaultUnlocked, vaultHiddenIds]);

  /*
   * Keep the player's playback queue aligned with what the user is browsing,
   * so "next video" = files[currentIndex + 1] within the current folder/filter.
   * Videos only — images never auto-advance.
   */
  useEffect(() => {
    setPlaybackQueue(visible.filter((v) => v.mediaType === 'video').map((v) => v.id));
  }, [visible, setPlaybackQueue]);

  /* Wait for the saved workspace before deciding what to render — otherwise a
     returning user sees the landing page flash before their library loads. */
  if (!workspaceHydrated) return <div className="min-h-screen bg-base" />;

  /*
   * The workspace, not the file count, decides whether the app is "empty":
   * a mounted folder that happens to contain no media should still land the
   * user in the library (with an empty grid), not back on the landing page.
   * Folders awaiting a permission re-grant count as mounted for the same
   * reason — the manager opens over the top to explain the one click needed.
   *
   * A guest with no folder at all can still be watching a peer's broadcast,
   * so the P2P viewers are mounted on this branch too.
   */
  if (activeHandles.length === 0 && pendingRestore.length === 0) {
    return (
      <>
        <Welcome onSelectFolder={pickFolder} onOpenPresets={() => setManagerOpen(true)} />
        <LibraryManager open={managerOpen} onClose={() => setManagerOpen(false)} />
        {/* The panic screen has to cover the landing page too — it is still
            the user's screen, and the P2P viewers below can be showing a
            peer's broadcast on this branch. */}
        <StealthOverlay />
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
      <Header onOpenWorkspace={() => setManagerOpen(true)} />
      <LibraryManager open={managerOpen} onClose={() => setManagerOpen(false)} />

      {showHome && (
        <div className="flex pt-14">
          {sidebarOpen && <Sidebar onOpenVault={() => setVaultOpen(true)} />}
          <main className="flex-1 overflow-y-auto p-6">
            {/* While the grid is popped out, PiPStage owns it. Rendering both
                would build two <video> elements per file — double decode,
                double audio, slightly out of sync. */}
            {layoutMode && !pipWindow && (
              <div className="mb-6">
                <MediaViewer />
              </div>
            )}
            {layoutMode && pipWindow && (
              <div className="mb-6 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-content/10 bg-content/[0.02] py-10 text-sm text-content/40">
                Playing in the pop-out window.
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

      {/* Document PiP host — mounted at the root so the popout survives
          navigation between the library and the player. */}
      <PiPStage />

      <VaultModal open={vaultOpen} onClose={() => setVaultOpen(false)} />

      {/* Last child, so nothing can paint over the privacy screen. */}
      <StealthOverlay />
    </div>
  );
}
