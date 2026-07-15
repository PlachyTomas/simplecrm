import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { counterpartPath, marketingLangFromPath, marketingPath } from "./slugs";

/**
 * Injects `<link rel="alternate" hreflang>` tags for the current marketing
 * page so search engines can pair the Czech (root) and English (`/en`)
 * variants. `x-default` points at Czech, matching the site's default.
 *
 * Rendered by `MarketingLanguageLayout`; renders nothing itself.
 */
export function SeoAlternates() {
  const { pathname } = useLocation();

  useEffect(() => {
    const currentLang = marketingLangFromPath(pathname);
    const counterpart = counterpartPath(pathname);
    const csPath =
      currentLang === "cs" ? pathname : (counterpart ?? marketingPath("landing", "cs"));
    const enPath =
      currentLang === "en" ? pathname : (counterpart ?? marketingPath("landing", "en"));
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const alternates: ReadonlyArray<readonly [string, string]> = [
      ["cs", origin + csPath],
      ["en", origin + enPath],
      ["x-default", origin + csPath],
    ];

    const created = alternates.map(([hreflang, href]) => {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.setAttribute("hreflang", hreflang);
      link.setAttribute("href", href);
      link.setAttribute("data-seo-alternate", "");
      document.head.appendChild(link);
      return link;
    });

    return () => {
      for (const link of created) link.remove();
    };
  }, [pathname]);

  return null;
}
