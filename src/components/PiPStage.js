import { jsx as _jsx } from "react/jsx-runtime";
import { createPortal } from 'react-dom';
import { usePiPStore } from '../hooks/useDocumentPiP';
import MediaViewer from './MediaViewer';
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
 *  Only ONE MediaViewer may be live at a time. Two would each build their
 *  own <video> elements for the same files: double the decode, double the
 *  memory, and two soundtracks a few frames out of sync. App.tsx therefore
 *  stops rendering the inline grid while `pipWindow` is set, and this takes
 *  over. React unmounts one and mounts the other, so the tiles reload —
 *  a visible but honest cost of moving the grid between documents.
 * ───────────────────────────────────────────────────────────── */
export default function PiPStage() {
    const pipWindow = usePiPStore((s) => s.pipWindow);
    if (!pipWindow || pipWindow.closed)
        return null;
    return createPortal(
    /* bg-base pins the popout to the app's theme background; without it the
       window shows the browser's default white behind transparent areas. */
    _jsx("div", { className: "flex h-full w-full flex-col overflow-hidden bg-base text-content", children: _jsx(MediaViewer, {}) }), pipWindow.document.body);
}
