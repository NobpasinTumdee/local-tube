import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
function api() {
    const w = window;
    return w.documentPictureInPicture ?? null;
}
export function isDocumentPiPSupported() {
    return !!api();
}
export const usePiPStore = create()((set) => ({
    pipWindow: null,
    content: null,
    error: null,
    set: (w, content = null) => set({ pipWindow: w, content: w ? content : null }),
    setError: (e) => set({ error: e }),
}));
/** True when `what` is the surface currently living in the popout. */
export function useIsPoppedOut(what) {
    return usePiPStore((s) => !!s.pipWindow && s.content === what);
}
/**
 * Non-React accessor. Stealth mode has to reach into the PiP document to
 * mute what is playing there, and it cannot call a hook to find out.
 */
export function getPiPWindow() {
    const w = usePiPStore.getState().pipWindow;
    return w && !w.closed ? w : null;
}
/**
 * Clones every stylesheet into the target document.
 *
 * Two paths, because the two build modes differ: Vite serves CSS as inline
 * <style> in dev (readable via cssRules) and as a <link> in production
 * (cssRules throws SecurityError for any sheet the document can't inspect).
 * Falling back to re-linking the href covers the second case, and is also
 * what saves us if a sheet is ever served cross-origin.
 */
export function copyStyles(target) {
    for (const sheet of Array.from(document.styleSheets)) {
        try {
            const rules = sheet.cssRules; // may throw
            const style = target.createElement('style');
            style.textContent = Array.from(rules)
                .map((r) => r.cssText)
                .join('\n');
            target.head.appendChild(style);
        }
        catch {
            const href = sheet.href;
            if (!href)
                continue;
            const link = target.createElement('link');
            link.rel = 'stylesheet';
            link.type = sheet.type || 'text/css';
            if (sheet.media.length)
                link.media = sheet.media.mediaText;
            link.href = href;
            target.head.appendChild(link);
        }
    }
}
export function useDocumentPiP() {
    const pipWindow = usePiPStore((s) => s.pipWindow);
    const content = usePiPStore((s) => s.content);
    const error = usePiPStore((s) => s.error);
    const setPipWindow = usePiPStore((s) => s.set);
    const setError = usePiPStore((s) => s.setError);
    const supported = isDocumentPiPSupported();
    const close = useCallback(() => {
        const w = usePiPStore.getState().pipWindow;
        setPipWindow(null);
        if (w && !w.closed)
            w.close();
    }, [setPipWindow]);
    const open = useCallback(async (what, opts) => {
        const dpip = api();
        if (!dpip) {
            setError('This browser has no Document Picture-in-Picture. Use Chrome or Edge 116+.');
            return null;
        }
        try {
            /*
             * One popout per document. Closing the previous one first is
             * synchronous, so it does not consume the user gesture that the
             * requestWindow() below still needs.
             */
            const existing = usePiPStore.getState().pipWindow;
            if (existing && !existing.closed)
                existing.close();
            /*
             * requestWindow() consumes a user gesture, so it must be the first
             * await in the click handler that calls this.
             */
            const w = await dpip.requestWindow({
                width: opts?.width ?? 640,
                height: opts?.height ?? 380,
            });
            copyStyles(w.document);
            /* Carry the theme across, and keep it in sync if it changes later. */
            w.document.body.className = document.body.className;
            const themeObserver = new MutationObserver(() => {
                if (!w.closed)
                    w.document.body.className = document.body.className;
            });
            themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            /* The popout is a viewport of its own; without this the app's
               html/body height rules never apply and content collapses. */
            w.document.documentElement.style.height = '100%';
            w.document.body.style.height = '100%';
            w.document.body.style.margin = '0';
            w.document.body.style.overflow = 'hidden';
            const onUnload = () => {
                themeObserver.disconnect();
                setPipWindow(null);
            };
            /* 'pagehide' fires for the user closing it from the OS chrome, which
               'unload' can miss. */
            w.addEventListener('pagehide', onUnload, { once: true });
            setPipWindow(w, what);
            setError(null);
            return w;
        }
        catch (err) {
            /* Thrown when called outside a user gesture, or when the user
               dismisses the window request. */
            setError(err instanceof Error ? err.message : 'Could not open the picture-in-picture window.');
            return null;
        }
    }, [setPipWindow, setError]);
    /*
     * Closing the tab leaves an orphaned always-on-top window with no way to
     * reach it, so make sure it dies with the page.
     */
    useEffect(() => {
        const onPageHide = () => {
            const w = usePiPStore.getState().pipWindow;
            if (w && !w.closed)
                w.close();
        };
        window.addEventListener('pagehide', onPageHide);
        return () => window.removeEventListener('pagehide', onPageHide);
    }, []);
    return { supported, pipWindow, content, open, close, error };
}
