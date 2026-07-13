import { useLocation } from "react-router-dom";

import type { Language } from "@/lib/i18n/languages";

import { marketingLangFromPath } from "./slugs";

/**
 * Marketing language derived from the current URL — on the public site the
 * URL is authoritative (see MarketingLanguageLayout), so internal links must
 * be built from this, never from the running i18n language.
 */
export function useMarketingLang(): Language {
  return marketingLangFromPath(useLocation().pathname);
}
