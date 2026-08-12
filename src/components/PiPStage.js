import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePiPStore } from '../hooks/useDocumentPiP';
import { useChatStore } from '../store/useChatStore';
import { useWebRTCStore } from '../store/useWebRTCStore';
import MediaViewer from './MediaViewer';
import WatchPartyLobby from './WatchPartyLobby';
import { ChatPanelBody } from './ChatPanel';
/* ─────────────────────────────────────────────────────────────
 *  PiP STAGE
 * ─────────────────────────────────────────────────────────────
 *  Portals the multi-media grid into the Document PiP window.
 *
 *  Mounted once at the app root rather than inside the home view, because
 *  the popout has to survive navigation — the whole point is to keep
 *  watching while you browse somewhere else, and a stage nested in the
 *  home route would unmount the moment the user opened the player.
 *
 *  Whatever is popped out must be live in exactly ONE place. Two copies of
 *  the grid would each build their own <video> elements for the same files
 *  (double decode, two soundtracks slightly out of sync); two copies of the
 *  room would fight over one MediaStream; two chats would fight over scroll
 *  position and composer focus. So each host checks `useIsPoppedOut(...)`
 *  and stands down while this owns it. React unmounts one and mounts the
 *  other, so media reloads — the honest cost of moving a live subtree
 *  between documents.
 * ───────────────────────────────────────────────────────────── */
export default function PiPStage() {
    const pipWindow = usePiPStore((s) => s.pipWindow);
    const content = usePiPStore((s) => s.content);
    const setPiP = usePiPStore((s) => s.set);
    /* P2P surfaces can disappear out from under the popout — the session ends,
       the kill switch fires, the drawer is closed from the header. Leaving an
       always-on-top window showing a dead panel is worse than closing it. */
    const chatOpen = useChatStore((s) => s.open);
    const lobbyOpen = useWebRTCStore((s) => s.lobbyOpen);
    const p2pLive = useWebRTCStore((s) => s.status) !== 'disconnected';
    const stale = (content === 'chat' && (!chatOpen || !p2pLive)) ||
        (content === 'party' && (!lobbyOpen || !p2pLive));
    useEffect(() => {
        if (!stale)
            return;
        const w = usePiPStore.getState().pipWindow;
        setPiP(null);
        if (w && !w.closed)
            w.close();
    }, [stale, setPiP]);
    if (!pipWindow || pipWindow.closed || !content || stale)
        return null;
    return createPortal(
    /* bg-base pins the popout to the app's theme background; without it the
       window shows the browser's default white behind transparent areas. */
    _jsxs("div", { className: "flex h-full w-full flex-col overflow-hidden bg-base text-content", children: [content === 'grid' && _jsx(MediaViewer, {}), content === 'party' && _jsx(WatchPartyLobby, { embedded: true }), content === 'chat' && _jsx(ChatPanelBody, { embedded: true })] }), pipWindow.document.body);
}
