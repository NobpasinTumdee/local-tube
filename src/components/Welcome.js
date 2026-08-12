import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Bookmark, FolderOpen, Lock } from 'lucide-react';
import WebRTCBar from './WebRTCBar';
import { useLibraryStore } from '../store/useLibraryStore';
/*
 * Imported rather than referenced by path so the bundler fingerprints it and
 * emits it into dist/ — a bare "/bg-red-ball.mp4" resolves in dev (Vite serves
 * the project root) but there is no publicDir here, so it would 404 in a
 * production build. Importing it also keeps the promise the page makes: the
 * landing screen pulls nothing from a third-party CDN.
 */
import bgRedBall from '../../bg-red-ball.mp4';
/* ─────────────────────────────────────────────────────────────
 *  WELCOME / LANDING
 * ─────────────────────────────────────────────────────────────
 *  The only screen the user sees before a folder is picked, so it is
 *  also the only screen that carries the product's first impression.
 *  Unlike the rest of the app it opts *out* of the theme tokens and
 *  commits to one fixed cinematic palette — a landing page that
 *  re-skins itself per theme reads as chrome, not as a front door.
 * ───────────────────────────────────────────────────────────── */
/** Organic falloff so the hero copy always clears the moving ball behind it. */
const VIGNETTE = 'radial-gradient(ellipse 68% 68% at 50% 50%, transparent 22%, rgba(8, 1, 4, 0.4) 50%, rgba(8, 1, 4, 0.8) 75%, rgba(8, 1, 4, 0.98) 100%)';
const FEATURES = [
    {
        n: '01',
        title: 'ABSOLUTE PRIVACY',
        body: 'Your files never leave your computer. Everything renders securely in your browser.',
    },
    {
        n: '02',
        title: 'MULTI-MEDIA LAYOUTS',
        body: 'View videos and images in customizable, unified grids with a premium cinematic glow.',
    },
    {
        n: '03',
        title: 'P2P WATCH PARTY',
        body: 'Sync playback and broadcast live to friends securely via end-to-end encrypted WebRTC.',
    },
];
export default function Welcome({ onSelectFolder, onOpenPresets }) {
    const canvasRef = useRef(null);
    const reduceMotion = useReducedMotion();
    /*
     * A returning user with saved presets lands here, because a workspace whose
     * folders all need re-granting has no active handles. Without this entry
     * point their only route back is to re-pick a folder by hand — which is the
     * exact chore presets exist to remove. Hidden until they have one, so the
     * hero keeps a single call to action for first-time visitors.
     */
    const presetCount = useLibraryStore((s) => s.presets.length);
    useDustParticles(canvasRef, !reduceMotion);
    /* Parent only schedules; the children own their own motion. Disabling
     * transforms for reduced-motion still leaves the fade, which reads as
     * intentional rather than as a broken animation. */
    const stagger = (delay) => ({
        hidden: {},
        show: { transition: { delayChildren: delay, staggerChildren: 0.09 } },
    });
    const rise = {
        hidden: { opacity: 0, y: reduceMotion ? 0 : 28 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
        },
    };
    return (_jsxs("div", { className: "lt-welcome relative isolate min-h-screen w-full overflow-hidden bg-[#080104] text-white", children: [_jsx("video", { className: "absolute inset-0 -z-10 h-full w-full object-cover", src: bgRedBall, autoPlay: true, loop: true, muted: true, playsInline: true, preload: "auto", "aria-hidden": "true", tabIndex: -1 }), _jsx("div", { className: "pointer-events-none absolute inset-0 z-0", style: { background: VIGNETTE }, "aria-hidden": "true" }), _jsx("div", { className: "pointer-events-none absolute inset-0 z-0 bg-[#080104]/45 lg:hidden", "aria-hidden": "true" }), _jsx("div", { className: "pointer-events-none absolute inset-0 z-0 hidden lg:block", style: {
                    background: 'linear-gradient(90deg, rgba(8,1,4,0.88) 0%, rgba(8,1,4,0.6) 24%, rgba(8,1,4,0) 45%)',
                }, "aria-hidden": "true" }), _jsx("canvas", { ref: canvasRef, className: "pointer-events-none absolute inset-0 z-0 h-full w-full", "aria-hidden": "true" }), _jsxs(motion.header, { initial: { opacity: 0, y: reduceMotion ? 0 : -16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }, className: "relative z-20 flex items-center justify-between gap-3 px-5 py-5 sm:px-8 sm:py-7", children: [_jsx("div", { className: "flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-xl border-2 border-white/90 bg-black/30 text-sm font-black tracking-tight backdrop-blur-[10px]", children: "LT" }), _jsxs("div", { className: "flex items-center gap-2 sm:gap-3", children: [_jsxs("span", { className: "hidden items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 backdrop-blur-[10px] sm:flex", children: [_jsx(Lock, { className: "h-3.5 w-3.5 text-[#ff1053]" }), "100% Local & Private"] }), _jsx("div", { className: "flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-1 backdrop-blur-[10px]", style: { ['--color-text']: '255 255 255' }, children: _jsx(WebRTCBar, {}) })] })] }), _jsxs("main", { className: "relative z-10 mx-auto grid w-full max-w-[1500px] grid-cols-1 items-center gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:pb-28 lg:pt-[6vh]", children: [_jsxs(motion.div, { variants: stagger(0.15), initial: "hidden", animate: "show", className: "lg:col-span-5", children: [_jsx(motion.p, { variants: rise, className: "text-xs font-bold tracking-[0.3em] text-[#e6004c] sm:text-sm", children: "ZERO BACKEND" }), _jsxs(motion.h1, { variants: rise, className: "mt-5 text-5xl font-black uppercase leading-[0.96] text-white sm:text-7xl lg:text-[80px]", children: ["Your Media", _jsx("br", {}), "Universe"] }), _jsx(motion.p, { variants: rise, className: "mt-6 max-w-md text-base leading-relaxed text-white/75 sm:text-lg", children: "Experience a premium, cinematic interface for your local videos and images. No uploads, no servers, absolute privacy." }), _jsxs(motion.div, { variants: rise, className: "mt-10 flex flex-wrap items-center gap-3", children: [_jsxs("button", { id: "pick-folder-btn", onClick: onSelectFolder, className: "lt-cta group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-white/25 bg-white/[0.06] px-7 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white backdrop-blur-[10px] transition duration-300 hover:border-[#ff1053]/70 hover:bg-[#ff1053]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff1053]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080104] active:scale-[0.98] sm:px-9", children: [_jsx("span", { "aria-hidden": "true", className: "pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" }), _jsx(FolderOpen, { className: "relative h-[18px] w-[18px] text-[#ff1053] transition-colors duration-300 group-hover:text-white" }), _jsx("span", { className: "relative", children: "Select Media Folder" }), _jsx(ArrowRight, { className: "relative h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" })] }), presetCount > 0 && (_jsxs("button", { id: "open-presets-btn", onClick: onOpenPresets, className: "group inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.04] px-6 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white/70 backdrop-blur-[10px] transition duration-300 hover:border-white/35 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080104] active:scale-[0.98]", children: [_jsx(Bookmark, { className: "h-[18px] w-[18px] transition-colors duration-300 group-hover:text-[#ff1053]" }), _jsx("span", { children: "My Presets" }), _jsx("span", { className: "inline-flex h-[18px] items-center rounded-full bg-white/10 px-2 text-[11px] leading-none tabular-nums text-white/70 transition-colors duration-300 group-hover:bg-white/20 group-hover:text-white", children: presetCount })] }))] }), _jsx(motion.p, { variants: rise, className: "mt-5 max-w-md text-xs leading-relaxed text-white/55", children: "Requires Chrome or Edge (File System Access API). Invited to a watch party? Use the share button up top to join a room \u2014 no folder needed." })] }), _jsx("div", { className: "hidden lg:col-span-3 lg:block", "aria-hidden": "true" }), _jsx(motion.ul, { variants: stagger(0.45), initial: "hidden", animate: "show", 
                        /* backdrop-brightness knocks the ball down *behind* the glass rather
                           than tinting the panel itself — the crimson numerals need a dark
                           floor to read against, and a heavier fill would kill the glass. */
                        className: "divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md backdrop-brightness-[0.4] lg:col-span-4", children: FEATURES.map((f) => (_jsxs(motion.li, { variants: rise, className: "group flex gap-5 p-6 transition-colors duration-300 hover:bg-white/[0.04] sm:p-7", children: [_jsx("span", { className: "shrink-0 pt-0.5 font-mono text-sm font-bold text-[#ff1053] transition-colors duration-300 group-hover:text-white", children: f.n }), _jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-sm font-black uppercase tracking-[0.14em] text-white", children: f.title }), _jsx("p", { className: "mt-2 text-sm leading-relaxed text-white/75", children: f.body })] })] }, f.n))) })] })] }));
}
function useDustParticles(ref, enabled) {
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !enabled)
            return;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        const sprites = [makeGlowSprite('255, 16, 83'), makeGlowSprite('255, 255, 255')];
        let motes = [];
        let width = 0;
        let height = 0;
        let raf = 0;
        const spawn = (seeded) => ({
            x: Math.random() * width,
            /* On a resize the field is rebuilt; seeding below the fold on first
             * mount instead would leave a visible empty band. */
            y: seeded ? Math.random() * height : height + 20,
            r: 0.8 + Math.random() * 2.4,
            vx: (Math.random() - 0.5) * 0.18,
            vy: -(0.12 + Math.random() * 0.35),
            alpha: 0.25 + Math.random() * 0.55,
            phase: Math.random() * Math.PI * 2,
            /* Mostly crimson, with a few white motes for sparkle. */
            sprite: sprites[Math.random() < 0.72 ? 0 : 1],
        });
        const measure = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            if (width === 0 || height === 0)
                return;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const count = Math.round(Math.min(150, Math.max(40, (width * height) / 13000)));
            motes = Array.from({ length: count }, () => spawn(true));
        };
        const frame = (t) => {
            raf = requestAnimationFrame(frame);
            if (width === 0 || height === 0)
                return;
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < motes.length; i++) {
                const m = motes[i];
                m.x += m.vx;
                m.y += m.vy;
                if (m.y < -20 || m.x < -20 || m.x > width + 20)
                    motes[i] = spawn(false);
                const twinkle = 0.65 + 0.35 * Math.sin(t / 900 + m.phase);
                const size = m.r * 8;
                ctx.globalAlpha = m.alpha * twinkle;
                ctx.drawImage(m.sprite, m.x - size / 2, m.y - size / 2, size, size);
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        };
        measure();
        raf = requestAnimationFrame(frame);
        const ro = new ResizeObserver(measure);
        ro.observe(canvas);
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, [ref, enabled]);
}
/** A single soft dot, rendered once and reused by every mote of that color. */
function makeGlowSprite(rgb) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (g) {
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, `rgba(${rgb}, 0.95)`);
        grad.addColorStop(0.35, `rgba(${rgb}, 0.35)`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
    }
    return c;
}
