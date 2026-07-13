import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import i18n from "@/lib/i18n";
import type { Language } from "@/lib/i18n/languages";

import { SeoAlternates } from "./SeoAlternates";

/**
 * Wraps a marketing route subtree and makes the URL authoritative over the UI
 * language: on mount (and whenever `lang` changes) it switches the running
 * i18n language and updates `<html lang>`. The Czech tree at the root uses
 * `lang="cs"`; the `/en` tree uses `lang="en"`.
 */
export function MarketingLanguageLayout({ lang }: { lang: Language }) {
  useEffect(() => {
    void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <>
      <SeoAlternates />
      <Outlet />
    </>
  );
}
