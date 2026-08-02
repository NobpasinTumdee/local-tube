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
let activeVideo = null;
const listeners = new Set();
/**
 * Publishes (or clears, with null) the video element currently on screen.
 * Player calls this from an effect, and again with null on unmount.
 */
export function setActiveVideoElement(el) {
    if (activeVideo === el)
        return;
    activeVideo = el;
    for (const fn of listeners)
        fn(el);
}
export function getActiveVideoElement() {
    /* A node that has been torn out of the document can't be captured. */
    if (activeVideo && !activeVideo.isConnected)
        return null;
    return activeVideo;
}
/** Subscribe to changes; returns an unsubscribe function. */
export function subscribeActiveVideo(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
/** True when the element has enough of a media pipeline to capture. */
export function isCapturable(el) {
    if (!el)
        return false;
    if (typeof el.captureStream !== 'function' && typeof el.mozCaptureStream !== 'function')
        return false;
    return el.readyState >= 2 /* HAVE_CURRENT_DATA */;
}
/**
 * Cross-browser captureStream. Chromium/Edge expose the standard name;
 * Firefox still only has the prefixed one.
 *
 * IMPORTANT: capturing a *paused* element is the classic way to end up
 * with a stream that has tracks but never delivers frames — and capturing
 * one that hasn't decoded anything yields no tracks at all. Both look
 * identical to the broadcaster and produce a viewer that never opens, so
 * the caller should use {@link captureLiveStream} rather than this.
 */
export function captureVideoStream(el) {
    if (typeof el.captureStream === 'function')
        return el.captureStream();
    if (typeof el.mozCaptureStream === 'function')
        return el.mozCaptureStream();
    throw new Error('This browser cannot capture a stream from the player (try Chrome, Edge or Firefox).');
}
/**
 * Captures the element, guaranteeing a stream that is actually live:
 * playback is resumed if paused, and the result is verified to carry at
 * least one track. Throws with an actionable message otherwise.
 */
export async function captureLiveStream(el) {
    if (el.readyState < 2) {
        throw new Error('The player has not loaded any video yet — start playback, then go live.');
    }
    /* Frames only flow from a playing element. */
    if (el.paused) {
        try {
            await el.play();
        }
        catch {
            throw new Error('Could not resume playback. Press play in the player, then go live.');
        }
    }
    const stream = captureVideoStream(el);
    /*
     * Chrome can hand back a stream whose tracks attach a tick later. Give
     * it a few frames' grace before declaring it empty, rather than failing
     * a broadcast that would have worked.
     */
    if (stream.getTracks().length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (stream.getTracks().length === 0) {
        throw new Error('The player produced no media tracks. This usually means the video is not decoding — try seeking or pressing play, then go live again.');
    }
    return stream;
}
