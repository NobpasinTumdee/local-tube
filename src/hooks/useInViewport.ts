import { useEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────────────────────
 *  SHARED VIEWPORT OBSERVER
 * ─────────────────────────────────────────────────────────────
 *  Every card used to construct its own IntersectionObserver. One observer
 *  per element is the expensive way to use the API: the browser keeps a
 *  separate observation record and callback queue for each, and a few
 *  thousand of them cost real memory and intersection work on every scroll.
 *
 *  One observer per rootMargin, shared by every element that wants that
 *  margin, is the cheap way. Callbacks are kept in a WeakMap so an element
 *  that gets collected takes its entry with it.
 *
 *  This reports BOTH directions, unlike the old one-shot observers: leaving
 *  the viewport is what lets a card drop its decoded image and cancel work.
 * ───────────────────────────────────────────────────────────── */

type Callback = (inView: boolean) => void;

interface SharedObserver {
  observer: IntersectionObserver;
  callbacks: WeakMap<Element, Callback>;
}

const observers = new Map<string, SharedObserver>();

function getObserver(rootMargin: string): SharedObserver {
  const existing = observers.get(rootMargin);
  if (existing) return existing;

  const callbacks = new WeakMap<Element, Callback>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
    },
    { rootMargin },
  );
  const shared: SharedObserver = { observer, callbacks };
  observers.set(rootMargin, shared);
  return shared;
}

/**
 * Tracks whether the referenced element is within `rootMargin` of the
 * viewport.
 *
 * @param rootMargin Buffer around the viewport. The default keeps roughly a
 *                   screen of cards live either side of what is visible, so
 *                   normal scrolling never shows a placeholder.
 */
export function useInViewport<T extends Element>(
  rootMargin = '600px',
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* No IntersectionObserver (old browser, some test environments): show
       everything rather than nothing. */
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const shared = getObserver(rootMargin);
    shared.callbacks.set(el, setInView);
    shared.observer.observe(el);

    /*
     * Unobserve this element, but never disconnect the shared observer.
     * Refcounting it looked tidier and was wrong: StrictMode mounts, cleans
     * up and remounts every effect, so the count hit zero while hundreds of
     * other cards were still registered — the observer was torn down under
     * them and nothing ever reported visible again. An idle observer with no
     * targets costs nothing; there is one per distinct margin.
     */
    return () => {
      shared.observer.unobserve(el);
      shared.callbacks.delete(el);
    };
  }, [rootMargin]);

  return [ref, inView];
}
