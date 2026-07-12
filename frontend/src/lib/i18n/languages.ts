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
