import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '../store/useSettingsStore';
import { formatCombo } from '../utils/shortcutUtils';
/* ─────────────────────────────────────────────────────────────
 *  STEALTH OVERLAY — THE PRIVACY SCREEN
 * ─────────────────────────────────────────────────────────────
 *  Covers everything at z-9999 and, while mounted, also rewrites the tab
 *  title. A blacked-out viewport with "LocalTube" still in the tab strip
 *  and the window title bar is not hidden in any sense that matters.
 *
 *  Portalled to <body> so it escapes every transform/stacking context in
 *  the app — a fixed element nested inside an ancestor with a transform
 *  (the player uses Framer `layout`, which sets one) is positioned against
 *  that ancestor, not the viewport, and would leave the edges of the UI
 *  showing.
 *
 *  The way back out is intentionally quiet. A large "PRESS CTRL+ESC TO
 *  RETURN TO YOUR VIDEOS" banner would defeat the feature in front of the
 *  person you are hiding from, so the hint is dim, delayed, and only
 *  appears once you move the mouse.
 * ───────────────────────────────────────────────────────────── */
const HINT_DELAY_MS = 2500;
export default function StealthOverlay() {
    const isActive = useSettingsStore((s) => s.isStealthActive);
    const style = useSettingsStore((s) => s.stealthStyle);
    const shortcut = useSettingsStore((s) => s.stealthShortcut);
    const [showHint, setShowHint] = useState(false);
    const hintTimer = useRef();
    /* Swap the tab title while hidden, and put the real one back after. */
    useEffect(() => {
        if (!isActive)
            return;
        const original = document.title;
        document.title = 'New Tab';
        return () => {
            document.title = original;
        };
    }, [isActive]);
    /* Fresh overlay, fresh hint timer. */
    useEffect(() => {
        if (!isActive) {
            setShowHint(false);
            clearTimeout(hintTimer.current);
        }
    }, [isActive]);
    if (!isActive)
        return null;
    const revealHint = () => {
        clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(() => setShowHint(true), HINT_DELAY_MS);
    };
    return createPortal(_jsxs("div", { 
        /*
         * Focusable and focused on mount so keystrokes land here rather than
         * in whatever input was focused when the panic key was hit — typing
         * into a search box you cannot see is its own small disaster.
         */
        tabIndex: -1, ref: (el) => el?.focus(), role: "presentation", "aria-label": "Privacy screen", onMouseMove: revealHint, className: `fixed inset-0 z-[9999] select-none outline-none backdrop-blur-3xl ${style === 'terminal' ? 'bg-[#08090b]' : 'bg-black'}`, children: [style === 'terminal' ? _jsx(FakeTerminal, {}) : null, _jsx("p", { className: `pointer-events-none absolute bottom-4 right-5 font-mono text-[11px] tracking-wide transition-opacity duration-700 ${showHint ? 'opacity-25' : 'opacity-0'} ${style === 'terminal' ? 'text-emerald-400' : 'text-white'}`, children: formatCombo(shortcut) })] }), document.body);
}
/* ─────────────────────────────────────────────────────────────
 *  A plausible-looking build log. Deliberately generic: no app name, no
 *  file paths from the user's disk, nothing that hints at what is behind
 *  it. Lines type themselves out so a glance sees a live terminal rather
 *  than a static screenshot.
 * ───────────────────────────────────────────────────────────── */
const LOG_LINES = [
    '$ npm run build',
    '',
    '> app@1.4.2 build',
    '> tsc -b && vite build',
    '',
    'vite v5.4.21 building for production...',
    'transforming...',
    '✓ 1284 modules transformed.',
    'rendering chunks...',
    'computing gzip size...',
    '',
    'dist/index.html                   1.19 kB │ gzip:  0.59 kB',
    'dist/assets/index-8f3a91c2.css   48.20 kB │ gzip:  8.71 kB',
    'dist/assets/vendor-b71e04da.js  142.66 kB │ gzip: 46.02 kB',
    'dist/assets/index-2c9d5e18.js   318.44 kB │ gzip: 97.31 kB',
    '',
    '✓ built in 6.42s',
    '$ ',
];
function FakeTerminal() {
    const [visible, setVisible] = useState(0);
    useEffect(() => {
        if (visible >= LOG_LINES.length)
            return;
        /* Uneven cadence — a perfectly metronomic log reads as an animation. */
        const delay = LOG_LINES[visible] === '' ? 40 : 90 + Math.random() * 120;
        const id = setTimeout(() => setVisible((n) => n + 1), delay);
        return () => clearTimeout(id);
    }, [visible]);
    return (_jsxs("div", { className: "h-full w-full overflow-hidden p-6 font-mono text-[13px] leading-relaxed text-emerald-400/85 sm:p-10", children: [LOG_LINES.slice(0, visible).map((line, i) => (_jsx("div", { className: "whitespace-pre", children: line || ' ' }, i))), visible >= LOG_LINES.length && (_jsx("span", { className: "ml-[1ch] inline-block h-[1.1em] w-[0.6ch] translate-y-[0.2em] animate-pulse bg-emerald-400/85" }))] }));
}
