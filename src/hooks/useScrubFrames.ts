import { useEffect, useRef, useState } from 'react';
import {
  extractFrames,
  readCachedStrip,
  signatureFor,
  writeCachedStrip,
  type ScrubFrame,
} from '../utils/frameExtractor';
import type { MediaEntry } from '../utils/directoryScanner';

/* ─────────────────────────────────────────────────────────────
 *  SCRUB FRAME LOADING
 * ─────────────────────────────────────────────────────────────
 *  Cache first, extract second, and never at the expense of playback.
 *
 *  Extraction is deferred behind requestIdleCallback plus a short delay so
 *  it starts only once the player has settled — kicking off ten seeks while
 *  the video is still buffering its first frames is the fastest way to make
 *  a premium feature feel like a bug.
 * ───────────────────────────────────────────────────────────── */

/** How long to let playback settle before spending decoder time on previews. */
const WARMUP_MS = 1500;

interface ScrubFramesState {
  frames: ScrubFrame[];
  /** True while frames are still arriving; the strip is usable throughout. */
  loading: boolean;
}

type IdleHandle = number;
const scheduleIdle = (fn: () => void, timeout: number): IdleHandle => {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  return ric ? ric(fn, { timeout }) : window.setTimeout(fn, timeout);
};
const cancelIdle = (h: IdleHandle) => {
  const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
  if (cic) cic(h);
  else clearTimeout(h);
};

export function useScrubFrames(video: MediaEntry | null | undefined): ScrubFramesState {
  const [frames, setFrames] = useState<ScrubFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    /* Switching videos must drop the previous strip immediately — showing
       the last video's frames under the new one's scrubber is worse than
       showing none. */
    setFrames([]);
    setLoading(false);
    abortRef.current?.abort();
    abortRef.current = null;

    if (!video || video.mediaType !== 'video') return;

    const controller = new AbortController();
    abortRef.current = controller;
    let idle: IdleHandle | undefined;
    let warmup: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      let file: File;
      try {
        file = await video.handle.getFile();
      } catch {
        return; // permission lapsed or file moved — no previews, no error
      }
      if (controller.signal.aborted) return;

      const signature = signatureFor(file);
      const cached = await readCachedStrip(video.id, signature);
      if (controller.signal.aborted) return;
      if (cached) {
        setFrames(cached.frames);
        return;
      }

      warmup = setTimeout(() => {
        idle = scheduleIdle(() => {
          if (controller.signal.aborted) return;
          setLoading(true);
          extractFrames(file, {
            signal: controller.signal,
            /* Publish each frame as it lands so hovering works before the
               whole strip is done. */
            onFrame: (frame) => {
              if (!controller.signal.aborted) setFrames((prev) => [...prev, frame]);
            },
          })
            .then((strip) => {
              if (controller.signal.aborted) return;
              setFrames(strip.frames);
              void writeCachedStrip(video.id, strip);
            })
            .catch(() => {
              /* AbortError on video switch, or an undecodable file. Either
                 way the scrubber just falls back to a timestamp. */
            })
            .finally(() => {
              if (!controller.signal.aborted) setLoading(false);
            });
        }, 2000);
      }, WARMUP_MS);
    })();

    return () => {
      controller.abort();
      if (warmup) clearTimeout(warmup);
      if (idle !== undefined) cancelIdle(idle);
    };
  }, [video]);

  return { frames, loading };
}
