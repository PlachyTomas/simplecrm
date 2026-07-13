import { useTranslation } from "react-i18next";

import { DEFAULT_LANGUAGE, FORMAT_LOCALE, isLanguage } from "@/lib/i18n/languages";

/**
 * Intl locale for the active UI language — on-screen formatting
 * (money, numbers, dates) follows the user's chosen app language, not
 * the organization's locale.
 */
export function useLocale(): string {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  return FORMAT_LOCALE[isLanguage(lang) ? lang : DEFAULT_LANGUAGE];
}
