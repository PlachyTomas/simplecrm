import { useEffect } from "react";

const SUFFIX = "SimpleCRM";

/**
 * Sets `document.title` to "{page} — SimpleCRM" on mount, restores the
 * previous title on unmount. Routes that want a localized title call this
 * once with the Czech page name. P1 a11y requirement: every navigable view
 * has a meaningful <title>.
 */
export function usePageTitle(page: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${page} — ${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [page]);
}
