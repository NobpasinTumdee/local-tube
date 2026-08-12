import { useEffect, useRef } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowRight, FolderOpen, Lock } from 'lucide-react';
import WebRTCBar from './WebRTCBar';
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
const VIGNETTE =
  'radial-gradient(ellipse 68% 68% at 50% 50%, transparent 22%, rgba(8, 1, 4, 0.4) 50%, rgba(8, 1, 4, 0.8) 75%, rgba(8, 1, 4, 0.98) 100%)';

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
] as const;

interface Props {
  onSelectFolder: () => void;
}

export default function Welcome({ onSelectFolder }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useDustParticles(canvasRef, !reduceMotion);

  /* Parent only schedules; the children own their own motion. Disabling
   * transforms for reduced-motion still leaves the fade, which reads as
   * intentional rather than as a broken animation. */
  const stagger = (delay: number): Variants => ({
    hidden: {},
    show: { transition: { delayChildren: delay, staggerChildren: 0.09 } },
  });

  const rise: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 28 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <div className="lt-welcome relative isolate min-h-screen w-full overflow-hidden bg-[#080104] text-white">
      {/* ── Atmosphere ─────────────────────────────────────── */}
      <video
        className="absolute inset-0 -z-10 h-full w-full object-cover"
        src={bgRedBall}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: VIGNETTE }}
        aria-hidden="true"
      />
      {/* The vignette alone darkens the *edges*, but the ball drifts under the
          left column and eats the copy's contrast. A one-sided scrim that has
          fully decayed by 45% buys the text a floor while leaving the ball's
          core — and the whole right half — untouched. Stacked layouts get a
          flat scrim instead, since there the copy sits over the core. */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[#080104]/45 lg:hidden"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,1,4,0.88) 0%, rgba(8,1,4,0.6) 24%, rgba(8,1,4,0) 45%)',
        }}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        aria-hidden="true"
      />

      {/* ── Header ─────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: reduceMotion ? 0 : -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-20 flex items-center justify-between gap-3 px-5 py-5 sm:px-8 sm:py-7"
      >
        <div className="flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-xl border-2 border-white/90 bg-black/30 text-sm font-black tracking-tight backdrop-blur-[10px]">
          LT
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 backdrop-blur-[10px] sm:flex">
            <Lock className="h-3.5 w-3.5 text-[#ff1053]" />
            100% Local &amp; Private
          </span>

          {/*
           * Joining a watch party doesn't require a local library — a guest may
           * only want to receive files or watch someone's broadcast. So the P2P
           * entry point (and its kill switch) live here too, not just in the
           * header that appears after a folder is picked.
           *
           * WebRTCBar is built from the theme tokens, and on a light theme its
           * foreground would vanish against this fixed dark backdrop. Pinning
           * --color-text white for the subtree keeps it legible without
           * forking the component. Its portals land on <body> and are
           * unaffected, which is what we want — they belong to the app theme.
           */}
          <div
            className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-1 backdrop-blur-[10px]"
            style={{ ['--color-text' as string]: '255 255 255' }}
          >
            <WebRTCBar />
          </div>
        </div>
      </motion.header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <main className="relative z-10 mx-auto grid w-full max-w-[1500px] grid-cols-1 items-center gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:pb-28 lg:pt-[6vh]">
        {/* Left — pitch + CTA */}
        <motion.div
          variants={stagger(0.15)}
          initial="hidden"
          animate="show"
          className="lg:col-span-5"
        >
          <motion.p
            variants={rise}
            className="text-xs font-bold tracking-[0.3em] text-[#e6004c] sm:text-sm"
          >
            ZERO BACKEND
          </motion.p>

          <motion.h1
            variants={rise}
            className="mt-5 text-5xl font-black uppercase leading-[0.96] text-white sm:text-7xl lg:text-[80px]"
          >
            Your Media
            <br />
            Universe
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-6 max-w-md text-base leading-relaxed text-white/75 sm:text-lg"
          >
            Experience a premium, cinematic interface for your local videos and images. No uploads,
            no servers, absolute privacy.
          </motion.p>

          <motion.div variants={rise} className="mt-10">
            <button
              id="pick-folder-btn"
              onClick={onSelectFolder}
              className="lt-cta group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-white/25 bg-white/[0.06] px-7 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white backdrop-blur-[10px] transition duration-300 hover:border-[#ff1053]/70 hover:bg-[#ff1053]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff1053]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080104] active:scale-[0.98] sm:px-9"
            >
              {/* sheen */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              <FolderOpen className="relative h-[18px] w-[18px] text-[#ff1053] transition-colors duration-300 group-hover:text-white" />
              <span className="relative">Select Media Folder</span>
              <ArrowRight className="relative h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </motion.div>

          <motion.p variants={rise} className="mt-5 max-w-md text-xs leading-relaxed text-white/55">
            Requires Chrome or Edge (File System Access API). Invited to a watch party? Use the share
            button up top to join a room — no folder needed.
          </motion.p>
        </motion.div>

        {/* Center — deliberately empty so the morphing ball stays fully visible */}
        <div className="hidden lg:col-span-3 lg:block" aria-hidden="true" />

        {/* Right — numbered feature stack */}
        <motion.ul
          variants={stagger(0.45)}
          initial="hidden"
          animate="show"
          /* backdrop-brightness knocks the ball down *behind* the glass rather
             than tinting the panel itself — the crimson numerals need a dark
             floor to read against, and a heavier fill would kill the glass. */
          className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md backdrop-brightness-[0.4] lg:col-span-4"
        >
          {FEATURES.map((f) => (
            <motion.li
              key={f.n}
              variants={rise}
              className="group flex gap-5 p-6 transition-colors duration-300 hover:bg-white/[0.04] sm:p-7"
            >
              <span className="shrink-0 pt-0.5 font-mono text-sm font-bold text-[#ff1053] transition-colors duration-300 group-hover:text-white">
                {f.n}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
                  {f.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/75">{f.body}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  DUST PARTICLES
 * ─────────────────────────────────────────────────────────────
 *  Glowing motes drifting over the video. Each mote is drawn from a
 *  pre-rendered radial-gradient sprite rather than a per-frame gradient
 *  or a shadowBlur — one drawImage per particle keeps the loop cheap
 *  enough to stay at 60fps on integrated graphics.
 *
 *  The rAF handle and the ResizeObserver are both torn down on unmount,
 *  so a fast folder pick can't leave a loop painting into a detached
 *  canvas.
 * ───────────────────────────────────────────────────────────── */

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  /** Phase offset so the motes don't all twinkle in lockstep. */
  phase: number;
  sprite: HTMLCanvasElement;
}

function useDustParticles(ref: React.RefObject<HTMLCanvasElement>, enabled: boolean) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !enabled) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sprites = [makeGlowSprite('255, 16, 83'), makeGlowSprite('255, 255, 255')];
    let motes: Mote[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;

    const spawn = (seeded: boolean): Mote => ({
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
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.round(Math.min(150, Math.max(40, (width * height) / 13000)));
      motes = Array.from({ length: count }, () => spawn(true));
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (width === 0 || height === 0) return;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        m.x += m.vx;
        m.y += m.vy;

        if (m.y < -20 || m.x < -20 || m.x > width + 20) motes[i] = spawn(false);

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
function makeGlowSprite(rgb: string): HTMLCanvasElement {
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
