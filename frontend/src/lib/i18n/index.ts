import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

import { cs } from "@/locales/cs";
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "./languages";

export const NAMESPACES = Object.keys(cs) as (keyof typeof cs)[];

// Exposed so callers (notably test-setup) can wait for the detector-driven
// auto language load to fully settle before issuing an explicit
// changeLanguage() — otherwise the two race and whichever's async resource
// load resolves last wins, regardless of call order.
export const i18nInitPromise = i18n
  .use(LanguageDetector)
  .use(resourcesToBackend((lng: string, ns: string) => import(`../../locales/${lng}/${ns}.json`)))
  .use(initReactI18next)
  .init({
    resources: { cs },
    partialBundledLanguages: true,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    load: "languageOnly",
    ns: NAMESPACES,
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      // No detector caching: changeLanguage() must not implicitly persist,
      // or the URL-driven marketing `/en`/`cs` trees would overwrite the
      // stored preference on every visit. Deliberate choices persist via
      // persistLanguagePreference() (switcher, server sync).
      caches: [],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    react: { useSuspense: false },
  });

// partialBundledLanguages caveat: on a cold visit init resolves against the
// bundled cs while the detected language's catalogs are still streaming in,
// leaving `resolvedLanguage` stuck on the fallback (switcher checks the wrong
// radio, useLocale formats with cs). Once the real language's resources land,
// re-run changeLanguage so resolvedLanguage snaps to it. The guard makes the
// recompute run at most once — afterwards base === resolvedLanguage.
i18n.on("loaded", () => {
  const base = i18n.language?.split("-")[0];
  if (base && base !== i18n.resolvedLanguage && i18n.hasResourceBundle(base, "common")) {
    void i18n.changeLanguage(i18n.language);
  }
});

export default i18n;
