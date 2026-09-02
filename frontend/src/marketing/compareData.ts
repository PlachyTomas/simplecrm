/**
 * Competitor comparison data for the landing page.
 *
 * Legal frame (§ 2980 obč. zák., comparative advertising): every figure and
 * tier placement below was read from the vendor's own public pricing pages on
 * `PRICES_CHECKED_ON` and must stay objectively verifiable. Anything the
 * research pass could not confirm from a vendor page renders as "neuvádí"
 * (`notListed`) — never as a guessed cross. Prices stay in the currency the
 * vendor lists (no FX conversion) and follow annual per-seat billing.
 * When refreshing: re-read the sources, update figures + PRICES_CHECKED_ON.
 */

export const PRICES_CHECKED_ON = "2026-08-22";

export type CompareCurrency = "CZK" | "EUR" | "USD";

/** Qualifier notes rendered from the `marketing` catalog (compare.notes.*). */
export type CellNote =
  | "addon"
  | "integrationsOnly"
  | "notListed"
  | "none"
  | "branded"
  | "capped"
  | "sequences";

/** A matrix cell: the first tier carrying the feature, an optional
 * qualifier, or a qualifier alone (no tier / nothing published). */
export interface CompareCell {
  tier?: string;
  note?: CellNote;
}

export interface CompareVendor {
  /** Word mark, rendered as-is (nominative use; no logos by design). */
  name: string;
  /** Tier that first covers SimpleCRM's bundled feature set. */
  matchingTier: string;
  perSeatMonthly: number;
  fiveSeatsMonthly: number;
  currency: CompareCurrency;
  /** Vendor states prices exclude VAT. */
  vatExclusiveStated: boolean;
  /** Extra pricing caveat key under compare.vendorNotes.* (or none). */
  noteKey?: "pipedrive" | "raynet" | "hubspot" | "freshsales";
  sourceUrl: string;
}

export const COMPARE_VENDORS: CompareVendor[] = [
  {
    name: "Pipedrive",
    matchingTier: "Growth",
    perSeatMonthly: 39,
    fiveSeatsMonthly: 195,
    currency: "EUR",
    vatExclusiveStated: true,
    noteKey: "pipedrive",
    sourceUrl: "https://www.pipedrive.com/en/pricing",
  },
  {
    name: "RAYNET CRM",
    matchingTier: "Professional",
    perSeatMonthly: 799,
    fiveSeatsMonthly: 3995,
    currency: "CZK",
    vatExclusiveStated: true,
    noteKey: "raynet",
    sourceUrl: "https://raynet.cz/cena/",
  },
  {
    name: "HubSpot Sales Hub",
    matchingTier: "Professional",
    perSeatMonthly: 90,
    fiveSeatsMonthly: 450,
    currency: "EUR",
    vatExclusiveStated: false,
    noteKey: "hubspot",
    sourceUrl: "https://www.hubspot.com/pricing/sales",
  },
  {
    name: "Freshsales",
    matchingTier: "Pro",
    perSeatMonthly: 39,
    fiveSeatsMonthly: 195,
    currency: "USD",
    vatExclusiveStated: false,
    noteKey: "freshsales",
    sourceUrl: "https://www.freshworks.com/crm/pricing/",
  },
];

/** Axis label keys live under compare.axes.* in the marketing catalog.
 * Cell order matches COMPARE_VENDORS. */
export interface CompareRow {
  axisKey:
    | "pipeline"
    | "companiesContacts"
    | "emailFromCrm"
    | "emailTemplates"
    | "emailTracking"
    | "bulkEmail"
    | "googleCalendar"
    | "customReports"
    | "goalsForecasting"
    | "dealRotting"
    | "importMigration"
    | "rolesTeams"
    | "api";
  cells: [CompareCell, CompareCell, CompareCell, CompareCell];
}

export const COMPARE_ROWS: CompareRow[] = [
  {
    axisKey: "pipeline",
    cells: [{ tier: "Lite" }, { tier: "Start" }, { tier: "Free" }, { tier: "Free" }],
  },
  {
    axisKey: "companiesContacts",
    cells: [{ tier: "Lite" }, { tier: "Start" }, { tier: "Free" }, { tier: "Free" }],
  },
  {
    axisKey: "emailFromCrm",
    cells: [
      { tier: "Growth" },
      { tier: "Professional" },
      { tier: "Free", note: "branded" },
      { tier: "Free" },
    ],
  },
  {
    axisKey: "emailTemplates",
    cells: [
      { tier: "Growth" },
      { note: "notListed" },
      { tier: "Free", note: "capped" },
      { tier: "Free" },
    ],
  },
  {
    axisKey: "emailTracking",
    cells: [
      { tier: "Growth" },
      { note: "notListed" },
      { tier: "Free", note: "capped" },
      { note: "notListed" },
    ],
  },
  {
    axisKey: "bulkEmail",
    cells: [
      { tier: "Growth", note: "addon" },
      { note: "integrationsOnly" },
      { tier: "Professional", note: "sequences" },
      { tier: "Growth", note: "capped" },
    ],
  },
  {
    axisKey: "googleCalendar",
    cells: [{ tier: "Lite" }, { tier: "Start" }, { note: "notListed" }, { note: "notListed" }],
  },
  {
    axisKey: "customReports",
    cells: [{ tier: "Premium" }, { tier: "Start" }, { tier: "Professional" }, { tier: "Pro" }],
  },
  {
    axisKey: "goalsForecasting",
    cells: [{ tier: "Growth" }, { tier: "Start" }, { tier: "Professional" }, { tier: "Pro" }],
  },
  {
    axisKey: "dealRotting",
    cells: [{ tier: "Lite" }, { note: "none" }, { note: "none" }, { tier: "Growth" }],
  },
  {
    axisKey: "importMigration",
    cells: [{ tier: "Lite" }, { tier: "Start" }, { note: "notListed" }, { tier: "Free" }],
  },
  {
    axisKey: "rolesTeams",
    cells: [{ tier: "Premium" }, { tier: "Professional" }, { note: "notListed" }, { tier: "Pro" }],
  },
  {
    axisKey: "api",
    cells: [{ tier: "Lite" }, { tier: "Professional" }, { note: "notListed" }, { tier: "Growth" }],
  },
];
