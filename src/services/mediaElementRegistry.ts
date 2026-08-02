/* ─────────────────────────────────────────────────────────────
 *  ACTIVE PLAYER REGISTRY
 * ─────────────────────────────────────────────────────────────
 *  Broadcasting needs the *live* <video> DOM node that the user is
 *  watching, because captureStream() only exists on the element itself.
 *  Passing a ref down through the component tree would couple Player to
 *  the P2P feature, so instead Player publishes its element here and the
 *  broadcast UI picks it up.
 *
 *  This registry holds a DOM node and nothing else — no file handles, no
 *  library data. It is also purely local: nothing here is reachable from
 *  the network layer, which can only broadcast an element a *local user*
 *  has explicitly chosen from the UI.
 * ───────────────────────────────────────────────────────────── */

type Listener = (el: HTMLVideoElement | null) => void;

let activeVideo: HTMLVideoElement | null = null;
const listeners = new Set<Listener>();

/**
 * Publishes (or clears, with null) the video element currently on screen.
 * Player calls this from an effect, and again with null on unmount.
 */
export function setActiveVideoElement(el: HTMLVideoElement | null): void {
  if (activeVideo === el) return;
  activeVideo = el;
  for (const fn of listeners) fn(el);
}

export function getActiveVideoElement(): HTMLVideoElement | null {
  /* A node that has been torn out of the document can't be captured. */
  if (activeVideo && !activeVideo.isConnected) return null;
  return activeVideo;
}

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribeActiveVideo(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when the element has enough of a media pipeline to capture. */
export function isCapturable(el: HTMLVideoElement | null): el is HTMLVideoElement {
  if (!el) return false;
  if (typeof el.captureStream !== 'function' && typeof el.mozCaptureStream !== 'function') return false;
  return el.readyState >= 2 /* HAVE_CURRENT_DATA */;
}

/**
 * Cross-browser captureStream. Chromium/Edge expose the standard name;
 * Firefox still only has the prefixed one.
 */
export function captureVideoStream(el: HTMLVideoElement): MediaStream {
  if (typeof el.captureStream === 'function') return el.captureStream();
  if (typeof el.mozCaptureStream === 'function') return el.mozCaptureStream();
  throw new Error('This browser cannot capture a stream from the player (try Chrome, Edge or Firefox).');
}
