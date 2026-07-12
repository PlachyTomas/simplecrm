import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

import { cs } from "@/locales/cs";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./languages";

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
      caches: ["localStorage"],
      lookupLocalStorage: "simplecrm.lang",
    },
    react: { useSuspense: false },
  });

export default i18n;
