import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
/* ─────────────────────────────────────────────────────────────
 *  LIBRARY SCROLL MEMORY
 * ─────────────────────────────────────────────────────────────
 *  Two rules, and they pull in opposite directions:
 *
 *  1. Coming BACK from a video returns you to the row you left.
 *  2. Going somewhere NEW (another folder, Favorites, a search) starts at
 *     the top — carrying the old offset into a different list is disorienting
 *     and often lands past the end of it.
 *
 *  WHAT SCROLLS. Not <main>. It carries `overflow-y-auto`, but nothing caps
 *  the height of the flex row it sits in, so it simply grows with its content
 *  and the overflow never engages — measured live: scrollHeight === clientHeight
 *  and scrollTop stays 0 while window.scrollY moves. The document is the
 *  scroller, so that is what this hook reads and writes. Hanging an onScroll
 *  handler on that element instead would compile, run, and do nothing.
 *
 *  NO RE-RENDER LOOP. The position is written through `getState()` and read
 *  the same way. Nothing here subscribes to `savedScrollPosition`, so a scroll
 *  cannot re-render the tree that is being scrolled.
 * ───────────────────────────────────────────────────────────── */
/** Give up re-asserting the offset after this many tries (~0.2s). */
const MAX_RESTORE_ATTEMPTS = 12;
/**
 * @param navKey  Identity of the list being shown. Any change resets to top.
 * @param enabled True while the library is actually on screen.
 */
export function useScrollMemory(navKey, enabled) {
    /* Set while we are putting the offset back, so the scroll events our own
       scrollTo() generates are not mistaken for the user scrolling. */
    const restoringRef = useRef(false);
    const lastNavKey = useRef(navKey);
    /* ── 1. Remember where the user is ── */
    useEffect(() => {
        if (!enabled)
            return;
        const onScroll = () => {
            if (restoringRef.current)
                return;
            /*
             * Ignore a page that cannot scroll. When the player opens, the library
             * unmounts, the document collapses to viewport height and the browser
             * emits a scroll-to-0 — which would otherwise overwrite the very
             * position we are trying to keep, right at the moment it matters.
             */
            if (document.documentElement.scrollHeight <= window.innerHeight + 1)
                return;
            useStore.getState().setSavedScrollPosition(window.scrollY);
        };
        /*
         * Written straight through, with no rAF coalescing. An earlier version
         * batched these into a frame and lost them: requestAnimationFrame does
         * not run in a background tab, so nothing was ever recorded, and the
         * cleanup cancelled any frame still pending when the library unmounted —
         * exactly the moment the position needed to survive. Scroll events are
         * already frame-aligned, and this write has no subscribers, so it costs
         * a store assignment and no re-render.
         */
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [enabled]);
    /* ── 2. Put it back when the library returns ── */
    useLayoutEffect(() => {
        if (!enabled)
            return;
        const target = useStore.getState().savedScrollPosition;
        if (target <= 0)
            return;
        restoringRef.current = true;
        let attempts = 0;
        let timer = 0;
        /*
         * One scrollTo is not enough. On this first frame the grid's cards are
         * mounted but their thumbnails and entry animation have not settled, so
         * the document is still shorter than it will be and the browser clamps
         * the offset. Re-assert until it sticks or we run out of patience —
         * which also stops this spinning forever if the list genuinely got
         * shorter (files removed, a filter applied).
         */
        const settle = () => {
            window.scrollTo(0, target);
            attempts++;
            if (Math.abs(window.scrollY - target) > 1 && attempts < MAX_RESTORE_ATTEMPTS) {
                /* setTimeout, not rAF: a tab in the background stops painting, and a
                   restore stalled mid-flight would leave saving disabled for good. */
                timer = window.setTimeout(settle, 16);
            }
            else {
                restoringRef.current = false;
            }
        };
        settle();
        return () => {
            if (timer)
                clearTimeout(timer);
            restoringRef.current = false;
        };
    }, [enabled]);
    /* ── 3. Start at the top somewhere new ── */
    useEffect(() => {
        if (lastNavKey.current === navKey)
            return;
        lastNavKey.current = navKey;
        /* Abandon any in-flight restore: it belongs to the list we just left. */
        restoringRef.current = false;
        useStore.getState().setSavedScrollPosition(0);
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, [navKey]);
}
