import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useEffect } from 'react';
import { useStore } from './store/useStore';
import { scanDirectory, getAllFilesRecursively } from './utils/directoryScanner';
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
        }
        catch (err) {
            if (err.name !== 'AbortError')
                console.error(err);
        }
    }
    /* global 'i' key for mini-player toggle */
    useEffect(() => {
        function onKey(e) {
            if (e.target.tagName === 'INPUT')
                return;
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
        const matchesSearchAndType = (v) => {
            if (q && !v.title.toLowerCase().includes(q))
                return false;
            if (homeFilter === 'videos' && v.mediaType !== 'video')
                return false;
            if (homeFilter === 'images' && v.mediaType !== 'image')
                return false;
            /* tag filter — item must carry ALL active tags (intersection) */
            if (activeFilterTags.length) {
                const t = mediaTags[v.id] ?? [];
                if (!activeFilterTags.every((tag) => t.includes(tag)))
                    return false;
            }
            return true;
        };
        /* Virtual collections resolve mediaIds → entries, preserving their order. */
        if (collection.type !== 'all') {
            const ids = collection.type === 'favorites'
                ? favorites
                : virtualPlaylists.find((p) => p.id === collection.playlistId)?.mediaIds ?? [];
            const byId = new Map(videos.map((v) => [v.id, v]));
            return ids
                .map((id) => byId.get(id))
                .filter((v) => !!v && matchesSearchAndType(v));
        }
        const idSet = !q && viewMode === 'flat'
            ? new Set(getAllFilesRecursively(videos, currentFolderPath))
            : null;
        return videos.filter((v) => {
            if (q) {
                return matchesSearchAndType(v); // global search
            }
            if (viewMode === 'flat') {
                if (!idSet.has(v.id))
                    return false;
            }
            else if (v.parentPath !== currentFolderPath) {
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
        return (_jsxs(_Fragment, { children: [_jsx(Welcome, { onPick: pickFolder }), _jsx(InviteJoinModal, {}), _jsx(WatchPartyLobby, {}), _jsx(BroadcastView, {})] }));
    }
    /* Layout mode keeps the library visible so users can fill slots. */
    const showHome = layoutMode || view === 'home' || playerMode === 'mini';
    return (_jsxs("div", { className: "min-h-screen bg-base text-content", children: [_jsx(Header, { onPick: pickFolder }), showHome && (_jsxs("div", { className: "flex pt-14", children: [sidebarOpen && _jsx(Sidebar, {}), _jsxs("main", { className: "flex-1 overflow-y-auto p-6", children: [layoutMode && (_jsx("div", { className: "mb-6", children: _jsx(MediaViewer, {}) })), _jsxs("div", { className: "mb-6 flex flex-wrap items-center gap-3", children: [_jsx("div", { className: "min-w-0 flex-1", children: _jsx(FilterBar, {}) }), _jsx(GridSettingsBar, {})] }), _jsx(MediaGrid, { videos: visible })] })] })), !layoutMode && currentVideoId && _jsx(Player, {}), currentImageId && view === 'viewing_image' && _jsx(ImageViewer, {}), _jsx(InviteJoinModal, {}), _jsx(WatchPartyLobby, {}), _jsx(BroadcastView, {})] }));
}
