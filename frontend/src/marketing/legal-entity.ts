/**
 * Statutory identification of the SimpleCRM operator.
 *
 * Required by § 435 OZ (every page reachable via dálkový přístup must show
 * jméno, sídlo, IČO, údaj o zápisu) and by Comgate's onboarding checklist.
 * Edit here to update every legal page, footer, contact page, and DPA at once.
 *
 * Any of the placeholder markers in `PLACEHOLDER_MARKERS` (TODO_, „bude
 * doplněno", TBD, …) flips `isLegalEntityReady()` to false. `runLegalPlaceholderLint`
 * also scans the rendered legal page text at module load in dev builds so a
 * stray "bude doplněno" inside the JSX (not just LEGAL_ENTITY) is caught
 * before the founder ships the site.
 */

export const LEGAL_ENTITY = {
  fullName: "Ing. Tomáš Plachý",
  address: "Lidická 709/55, Veveří, 602 00 Brno",
  ico: "06437541",
  registryClause:
    "Fyzická osoba zapsaná v živnostenském rejstříku, evidenční úřad: Magistrát města Brna.",
  /**
   * Single kontaktní e-mail — slouží zároveň pro obchodní dotazy,
   * technickou podporu i reklamace.
   */
  email: "podpora@simplecrm.cz",
  /** Kontaktní telefon — uvádí se v patičce a na stránce Kontakt. */
  phone: "+420 776 282 696",
  // Číslo bankovního účtu se na veřejných stránkách nezobrazuje — invoice
  // šablony a ComGate onboarding ho čerpají z backend env `BANK_ACCOUNT`.
} as const;

/** Comgate operator block — texts mandated by Comgate's "loga-a-udaje-na-webu" doc. */
export const COMGATE_INFO = {
  legalText:
    "Online platby pro nás zajišťuje platební brána Comgate. Poskytovatel služby, společnost Comgate a.s. je licencovaná Platební instituce působící pod dohledem České národní banky. Platby probíhající skrze platební bránu jsou plně zabezpečeny a veškeré informace jsou šifrovány.",
  /** Odkaz na platební bránu — Comgate vyžaduje uvedení poskytovatele s tímto odkazem. */
  gatewayUrl: "https://www.comgate.eu/cs/platebni-brana",
  /** Nápověda Comgate k jednotlivým platebním metodám (odkazy požaduje Comgate). */
  cardHelpUrl: "https://help.comgate.cz/v1/docs/cs/platby-kartou",
  bankHelpUrl: "https://help.comgate.cz/docs/bankovni-prevody",
  contact: {
    name: "Comgate, a.s.",
    address: "Gočárova třída 1754/48b, 500 02 Hradec Králové",
    // E-mail pro reklamace a dotazy k platbám dle pokynu Comgate (loga-a-udaje-na-webu).
    email: "podpora@comgate.cz",
    phone: "+420 228 224 267",
  },
} as const;

/** Effective date stamped onto VOP / Privacy / DPA / Cookies pages. */
export const LEGAL_EFFECTIVE_DATE = "10.05.2026";

/**
 * Effective date for Reklamační podmínky + Dodací a platební podmínky —
 * added later than the original legal bundle, for Comgate's full-access
 * review (they require both as visible standalone documents).
 */
export const COMMERCE_TERMS_EFFECTIVE_DATE = "06.06.2026";

/**
 * Substrings that flag unreplaced placeholder text. Matched case-insensitively
 * so "TODO_", "todo_", "Bude doplněno", "BUDE DOPLNĚNO" all trip the lint.
 */
export const PLACEHOLDER_MARKERS = [
  "TODO_",
  "bude doplněno",
  "bude doplneno",
  "TBD",
  "[XXX",
  "lorem ipsum",
] as const;

export function containsPlaceholder(text: string): boolean {
  const haystack = text.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()));
}

/**
 * Returns true once every LEGAL_ENTITY value has been replaced. The check is
 * shallow — for stray placeholders inside legal-page JSX use
 * `runLegalPlaceholderLint` (called from the dev entrypoint).
 */
export const isLegalEntityReady = (): boolean => {
  const values = [
    LEGAL_ENTITY.fullName,
    LEGAL_ENTITY.address,
    LEGAL_ENTITY.ico,
    LEGAL_ENTITY.registryClause,
    LEGAL_ENTITY.email,
    LEGAL_ENTITY.phone,
    LEGAL_EFFECTIVE_DATE,
  ];
  return !values.some(containsPlaceholder);
};
