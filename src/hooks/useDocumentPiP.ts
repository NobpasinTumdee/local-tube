import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

/* ─────────────────────────────────────────────────────────────
 *  DOCUMENT PICTURE-IN-PICTURE
 * ─────────────────────────────────────────────────────────────
 *  Unlike <video>.requestPictureInPicture(), which pops out a bare video
 *  track, Document PiP gives an always-on-top window with a real DOM — so
 *  the multi-grid, its controls and the chat can all come along.
 *
 *  The window shares this page's JS realm (same scripts, same module
 *  instances), so every Zustand store is literally the same object. State
 *  sharing needs no bridge at all. What it does NOT share is the document:
 *  a fresh, empty one with no stylesheets and no <body> class. Both have to
 *  be carried across by hand, and both are load-bearing here:
 *
 *  - Stylesheets: without them Tailwind classes resolve to nothing and the
 *    popped-out UI renders as unstyled text.
 *  - <body> class: this app's entire palette comes from CSS variables set
 *    on `body.theme-*` (see index.css). Copy the sheets but not the class
 *    and every colour token falls back to the :root default, so a user on
 *    the light theme gets a dark popout.
 * ───────────────────────────────────────────────────────────── */

/* Not in TypeScript's DOM lib yet (Chrome 116+). */
interface DocumentPictureInPictureApi {
  requestWindow: (opts?: { width?: number; height?: number; disallowReturnToOpener?: boolean }) => Promise<Window>;
  window: Window | null;
}

function api(): DocumentPictureInPictureApi | null {
  const w = window as unknown as { documentPictureInPicture?: DocumentPictureInPictureApi };
  return w.documentPictureInPicture ?? null;
}

export function isDocumentPiPSupported(): boolean {
  return !!api();
}

/*
 * The open window lives in a store rather than in the hook's own state
 * because several unrelated places need it: the stage that portals content
 * into it, the home view that must stop rendering the grid it moved out,
 * and the button that reflects open/closed. A hook-local useState would
 * only be visible to whoever called the hook.
 */
interface PiPStore {
  pipWindow: Window | null;
  error: string | null;
  set: (w: Window | null) => void;
  setError: (e: string | null) => void;
}

export const usePiPStore = create<PiPStore>()((set) => ({
  pipWindow: null,
  error: null,
  set: (w) => set({ pipWindow: w }),
  setError: (e) => set({ error: e }),
}));

/**
 * Non-React accessor. Stealth mode has to reach into the PiP document to
 * mute what is playing there, and it cannot call a hook to find out.
 */
export function getPiPWindow(): Window | null {
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
export function copyStyles(target: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules; // may throw
      const style = target.createElement('style');
      style.textContent = Array.from(rules)
        .map((r) => r.cssText)
        .join('\n');
      target.head.appendChild(style);
    } catch {
      const href = sheet.href;
      if (!href) continue;
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.type = sheet.type || 'text/css';
      if (sheet.media.length) link.media = sheet.media.mediaText;
      link.href = href;
      target.head.appendChild(link);
    }
  }
}

export interface DocumentPiPState {
  supported: boolean;
  pipWindow: Window | null;
  open: (opts?: { width?: number; height?: number }) => Promise<Window | null>;
  close: () => void;
  error: string | null;
}

export function useDocumentPiP(): DocumentPiPState {
  const pipWindow = usePiPStore((s) => s.pipWindow);
  const error = usePiPStore((s) => s.error);
  const setPipWindow = usePiPStore((s) => s.set);
  const setError = usePiPStore((s) => s.setError);
  const supported = isDocumentPiPSupported();

  const close = useCallback(() => {
    const w = usePiPStore.getState().pipWindow;
    setPipWindow(null);
    if (w && !w.closed) w.close();
  }, [setPipWindow]);

  const open = useCallback(
    async (opts?: { width?: number; height?: number }) => {
      const dpip = api();
      if (!dpip) {
        setError('This browser has no Document Picture-in-Picture. Use Chrome or Edge 116+.');
        return null;
      }
      try {
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
          if (!w.closed) w.document.body.className = document.body.className;
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

        setPipWindow(w);
        setError(null);
        return w;
      } catch (err) {
        /* Thrown when called outside a user gesture, or when the user
           dismisses the window request. */
        setError(err instanceof Error ? err.message : 'Could not open the picture-in-picture window.');
        return null;
      }
    },
    [setPipWindow, setError],
  );

  /*
   * Closing the tab leaves an orphaned always-on-top window with no way to
   * reach it, so make sure it dies with the page.
   */
  useEffect(() => {
    const onPageHide = () => {
      const w = usePiPStore.getState().pipWindow;
      if (w && !w.closed) w.close();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  return { supported, pipWindow, open, close, error };
}
