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
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
