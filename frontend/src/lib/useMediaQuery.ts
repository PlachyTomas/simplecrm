import { useEffect, useState } from "react";

/**
 * SSR-safe media-query subscription. Returns the current match value and
 * re-renders when the query starts/stops matching.
 *
 * The initial state is read synchronously so consumers don't render a
 * desktop-mode flash on a mobile viewport.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    // jsdom and some older WebViews return a MediaQueryList that's
    // missing `matches`; treat that as "no match" instead of crashing.
    return window.matchMedia(query)?.matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    if (!mql) return;
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches ?? false);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, [query]);

  return matches;
}
