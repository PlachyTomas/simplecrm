export const SUPPORTED_LANGUAGES = ["cs", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "cs";
/** Intl formatting locale per UI language. */
export const FORMAT_LOCALE: Record<Language, string> = { cs: "cs-CZ", en: "en-GB" };
/** Native-name labels for switchers (proper nouns — not translated). */
export const LANGUAGE_LABEL: Record<Language, string> = { cs: "Čeština", en: "English" };

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * localStorage key the i18next detector reads at boot. Detector *caching* is
 * off (see lib/i18n/index.ts): transient, URL-driven switches — the marketing
 * `/en` tree — must not overwrite the user's stored preference. Deliberate
 * choices persist through this helper instead.
 */
export const LANGUAGE_STORAGE_KEY = "simplecrm.lang";

export function persistLanguagePreference(lang: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Storage unavailable (private mode, blocked cookies) — the choice
    // just doesn't survive a reload.
  }
}
