import type { Language } from "@/lib/i18n/languages";

/**
 * Localized URL slugs for the public marketing pages.
 *
 * Czech is served at the site root; English lives under `/en`. Legal pages are
 * intentionally absent — they stay Czech-only at the root (see `App.tsx`).
 */
export const MARKETING_SLUGS = {
  landing: { cs: "/", en: "/en" },
  cenik: { cs: "/cenik", en: "/en/pricing" },
  objednavka: { cs: "/objednavka", en: "/en/order" },
  objednavkaNavrat: { cs: "/objednavka/navrat", en: "/en/order/return" },
  kontakt: { cs: "/kontakt", en: "/en/contact" },
} as const satisfies Record<string, Record<Language, string>>;

export type MarketingKey = keyof typeof MARKETING_SLUGS;

/** Absolute path for a marketing page in the given language. */
export function marketingPath(key: MarketingKey, lang: Language): string {
  return MARKETING_SLUGS[key][lang];
}

/** Which marketing language a pathname belongs to — the URL is authoritative. */
export function marketingLangFromPath(pathname: string): Language {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "cs";
}

/** Drop a single trailing slash (except on the root) so lookups are exact. */
function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/**
 * The equivalent path in the other language, or `null` when the pathname is
 * not a known marketing slug (legal pages, app routes, unknown paths).
 */
export function counterpartPath(pathname: string): string | null {
  const path = normalizePath(pathname);
  for (const value of Object.values(MARKETING_SLUGS)) {
    if (value.cs === path) return value.en;
    if (value.en === path) return value.cs;
  }
  return null;
}

/**
 * The `<Route path>` segment for a page, relative to its language root
 * (site root for `cs`, `/en` for `en`). Returns `""` for the landing page,
 * which is mounted as an index route.
 */
export function marketingRouteSegment(key: MarketingKey, lang: Language): string {
  const full = MARKETING_SLUGS[key][lang];
  if (lang === "cs") return full === "/" ? "" : full.slice(1);
  const rest = full.slice("/en".length); // "" for landing, "/pricing", …
  return rest.startsWith("/") ? rest.slice(1) : rest;
}
