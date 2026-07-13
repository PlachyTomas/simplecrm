import type { ParseKeys } from "i18next";

/**
 * Seed dataset for the landing-page interactive Pipeline demo.
 *
 * This is a self-contained, frontend-only fixture. It is intentionally NOT
 * fetched from the backend — the demo lives behind no auth and resets to
 * this initial state on every page load. Three teams x two salespeople x
 * a mix of stages keeps the team-vs-team comparison meaningful when the
 * visitor drags deals around.
 *
 * Display strings (stage/deal/company/person names) live in the `marketing`
 * catalog under `demo.*` and are resolved at render time; this module stores
 * only the catalog keys.
 */

export interface DemoStage {
  id: string;
  nameKey: ParseKeys<"marketing">;
  color: string;
  /** Identifies the won column for the win quick-action button + stats. */
  type: "open" | "won";
}

export interface DemoTeam {
  id: string;
  name: string;
  color: string;
}

export interface DemoSalesperson {
  id: string;
  nameKey: ParseKeys<"marketing">;
  team_id: string;
}

export interface DemoDeal {
  id: string;
  nameKey: ParseKeys<"marketing">;
  companyKey: ParseKeys<"marketing">;
  value: number; // CZK
  stage_id: string;
  owner_id: string;
}

export const DEMO_STAGES: DemoStage[] = [
  { id: "stg-new", nameKey: "demo.stages.new", color: "#3D5AFE", type: "open" },
  { id: "stg-contact", nameKey: "demo.stages.contacted", color: "#5470FF", type: "open" },
  { id: "stg-negotiation", nameKey: "demo.stages.negotiation", color: "#10B981", type: "open" },
  { id: "stg-won", nameKey: "demo.stages.won", color: "#EC4899", type: "won" },
];

export const DEMO_TEAMS: DemoTeam[] = [
  { id: "team-praha", name: "Praha", color: "#3D5AFE" },
  { id: "team-brno", name: "Brno", color: "#F59E0B" },
  { id: "team-bratislava", name: "Bratislava", color: "#10B981" },
];

export const DEMO_SALES: DemoSalesperson[] = [
  { id: "u-1", nameKey: "demo.sales.u1", team_id: "team-praha" },
  { id: "u-2", nameKey: "demo.sales.u2", team_id: "team-praha" },
  { id: "u-3", nameKey: "demo.sales.u3", team_id: "team-brno" },
  { id: "u-4", nameKey: "demo.sales.u4", team_id: "team-brno" },
  { id: "u-5", nameKey: "demo.sales.u5", team_id: "team-bratislava" },
  { id: "u-6", nameKey: "demo.sales.u6", team_id: "team-bratislava" },
];

// Tuned so the team-leaderboard's default ranking is Praha > Brno >
// Bratislava. The sort is by total won-deal value descending (see
// InteractivePipeline.tsx). Won totals:
//   Praha (u-2):       168 000 CZK
//   Brno  (u-3):        95 000 CZK
//   Bratislava (u-6):   80 000 CZK
export const DEMO_DEALS_INITIAL: DemoDeal[] = [
  // New lead
  {
    id: "d-1",
    nameKey: "demo.deals.d1",
    companyKey: "demo.companies.alza",
    value: 42_500,
    stage_id: "stg-new",
    owner_id: "u-1",
  },
  {
    id: "d-2",
    nameKey: "demo.deals.d2",
    companyKey: "demo.companies.rohlik",
    value: 28_000,
    stage_id: "stg-new",
    owner_id: "u-3",
  },
  // Contacted
  {
    id: "d-3",
    nameKey: "demo.deals.d3",
    companyKey: "demo.companies.notino",
    value: 60_000,
    stage_id: "stg-contact",
    owner_id: "u-2",
  },
  {
    id: "d-4",
    nameKey: "demo.deals.d4",
    companyKey: "demo.companies.lidl",
    value: 95_000,
    stage_id: "stg-contact",
    owner_id: "u-4",
  },
  // Negotiation
  {
    id: "d-5",
    nameKey: "demo.deals.d5",
    companyKey: "demo.companies.asseco",
    value: 210_000,
    stage_id: "stg-negotiation",
    owner_id: "u-2",
  },
  // Won — totals tuned for Praha > Brno > Bratislava ranking.
  {
    id: "d-6",
    nameKey: "demo.deals.d6",
    companyKey: "demo.companies.heureka",
    value: 168_000,
    stage_id: "stg-won",
    owner_id: "u-2",
  },
  {
    id: "d-7",
    nameKey: "demo.deals.d7",
    companyKey: "demo.companies.albert",
    value: 95_000,
    stage_id: "stg-won",
    owner_id: "u-3",
  },
  {
    id: "d-8",
    nameKey: "demo.deals.d8",
    companyKey: "demo.companies.tatra",
    value: 80_000,
    stage_id: "stg-won",
    owner_id: "u-6",
  },
];
