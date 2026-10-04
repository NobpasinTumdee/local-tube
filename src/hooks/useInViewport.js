import { useEffect, useRef, useState } from 'react';
const observers = new Map();
function getObserver(rootMargin) {
    const existing = observers.get(rootMargin);
    if (existing)
        return existing;
    const callbacks = new WeakMap();
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries)
            callbacks.get(entry.target)?.(entry.isIntersecting);
    }, { rootMargin });
    const shared = { observer, callbacks };
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
export function useInViewport(rootMargin = '600px') {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el)
            return;
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
