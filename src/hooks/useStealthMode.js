import { useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import { matchesCombo } from '../utils/shortcutUtils';
import { getPiPWindow } from './useDocumentPiP';
/* ─────────────────────────────────────────────────────────────
 *  STEALTH MODE — GLOBAL LISTENER & AUDIO KILL
 * ─────────────────────────────────────────────────────────────
 *  A panic button is only as good as the worst case it survives, so this
 *  makes three choices that ordinary shortcuts would not:
 *
 *  1. CAPTURE PHASE on window. The handler runs before anything downstream
 *     can stopPropagation() — including the player's own key handling and
 *     any focused input.
 *  2. NO INPUT GUARD. Every other shortcut in the app bails when the target
 *     is an <input>. This one must not: mid-search is exactly when you need
 *     it, and a guard there would be a hole rather than a nicety.
 *  3. RESTORE, DON'T UNMUTE. Prior muted state is remembered per element,
 *     so leaving stealth cannot turn audio ON for something the user had
 *     deliberately muted.
 * ───────────────────────────────────────────────────────────── */
/**
 * Remembers what each element's `muted` was before stealth touched it.
 * A WeakMap so elements that get unmounted are collected normally.
 */
const priorMuted = new WeakMap();
/** Every document the app renders into — the main one, plus any PiP window. */
function mediaDocuments() {
    const docs = [document];
    const pip = getPiPWindow();
    if (pip && !pip.closed)
        docs.push(pip.document);
    return docs;
}
function allMediaElements() {
    const out = [];
    for (const doc of mediaDocuments()) {
        out.push(...Array.from(doc.querySelectorAll('video, audio')));
    }
    return out;
}
function silence(el) {
    if (!priorMuted.has(el))
        priorMuted.set(el, el.muted);
    el.muted = true;
}
function restore(el) {
    if (priorMuted.has(el)) {
        el.muted = priorMuted.get(el);
        priorMuted.delete(el);
    }
}
/** Exported so the overlay can re-assert silence if anything slips through. */
export function muteAllMedia() {
    allMediaElements().forEach(silence);
}
export function restoreAllMedia() {
    allMediaElements().forEach(restore);
}
/**
 * Installs the panic shortcut and drives the audio kill.
 * Mount exactly once, at the app root.
 */
export function useStealthMode() {
    const shortcut = useSettingsStore((s) => s.stealthShortcut);
    const stealthOnBlur = useSettingsStore((s) => s.stealthOnBlur);
    const isActive = useSettingsStore((s) => s.isStealthActive);
    const toggleStealth = useSettingsStore((s) => s.toggleStealth);
    const setStealthActive = useSettingsStore((s) => s.setStealthActive);
    /* ── the shortcut itself ── */
    useEffect(() => {
        function onKey(e) {
            if (!matchesCombo(e, shortcut))
                return;
            /*
             * Claim the press outright. stopImmediatePropagation, not merely
             * stopPropagation: the latter stops the event descending to other
             * NODES but not other listeners on this same one — and the player
             * also listens on window for Escape, so a Ctrl+Escape panic would
             * hide the screen AND close the player underneath it. This is a
             * panic key; nothing else may see it.
             */
            e.preventDefault();
            e.stopImmediatePropagation();
            toggleStealth();
        }
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
    }, [shortcut, toggleStealth]);
    /* ── opt-in: hide when the window loses focus ── */
    useEffect(() => {
        if (!stealthOnBlur)
            return;
        const onBlur = () => setStealthActive(true);
        window.addEventListener('blur', onBlur);
        return () => window.removeEventListener('blur', onBlur);
    }, [stealthOnBlur, setStealthActive]);
    /* ── audio kill + keeping it killed ── */
    useEffect(() => {
        if (!isActive) {
            restoreAllMedia();
            return;
        }
        muteAllMedia();
        /*
         * Autoplay-next can mount a fresh <video> while the screen is hidden,
         * and a brand-new element defaults to unmuted — which would broadcast
         * audio from behind a black screen. Watch for them.
         */
        const observers = mediaDocuments().map((doc) => {
            const mo = new MutationObserver((records) => {
                for (const rec of records) {
                    for (const node of Array.from(rec.addedNodes)) {
                        if (!(node instanceof Element))
                            continue;
                        if (node instanceof HTMLMediaElement)
                            silence(node);
                        node.querySelectorAll?.('video, audio').forEach(silence);
                    }
                }
            });
            mo.observe(doc.documentElement, { childList: true, subtree: true });
            return mo;
        });
        return () => {
            observers.forEach((mo) => mo.disconnect());
            restoreAllMedia();
        };
    }, [isActive]);
}
