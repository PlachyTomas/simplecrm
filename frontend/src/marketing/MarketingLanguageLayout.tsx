import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import i18n, { i18nInitPromise } from "@/lib/i18n";
import type { Language } from "@/lib/i18n/languages";

import { SeoAlternates } from "./SeoAlternates";

/**
 * Wraps a marketing route subtree and makes the URL authoritative over the UI
 * language: on mount (and whenever `lang` changes) it switches the running
 * i18n language and updates `<html lang>`. The Czech tree at the root uses
 * `lang="cs"`; the `/en` tree uses `lang="en"`. The switch is transient by
 * design — it must NOT persist into the stored preference (see the detector
 * `caches: []` note in lib/i18n/index.ts).
 */
export function MarketingLanguageLayout({ lang }: { lang: Language }) {
  useEffect(() => {
    // Wait out the detector-driven initial load: on a cold visit its async
    // resource fetch would otherwise resolve AFTER this changeLanguage and
    // win, leaving e.g. an en-browser visitor with English copy on the cs
    // tree (the race documented on i18nInitPromise).
    let cancelled = false;
    void i18nInitPromise.then(() => {
      if (!cancelled) void i18n.changeLanguage(lang);
    });
    document.documentElement.lang = lang;
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return (
    <>
      <SeoAlternates />
      <Outlet />
    </>
  );
}
