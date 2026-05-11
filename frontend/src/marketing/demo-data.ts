/**
 * Seed dataset for the landing-page interactive Pipeline demo.
 *
 * This is a self-contained, frontend-only fixture. It is intentionally NOT
 * fetched from the backend — the demo lives behind no auth and resets to
 * this initial state on every page load. Three teams × two salespeople ×
 * a mix of stages keeps the team-vs-team comparison meaningful when the
 * visitor drags deals around.
 */

export interface DemoStage {
  id: string;
  name: string;
  color: string;
  /** Identifies the won column for the "Vyhráno" quick-win button + stats. */
  type: "open" | "won";
}

export interface DemoTeam {
  id: string;
  name: string;
  color: string;
}

export interface DemoSalesperson {
  id: string;
  name: string;
  team_id: string;
}

export interface DemoDeal {
  id: string;
  name: string;
  company: string;
  value: number; // CZK
  stage_id: string;
  owner_id: string;
}

export const DEMO_STAGES: DemoStage[] = [
  { id: "stg-new", name: "Nový lead", color: "#3D5AFE", type: "open" },
  { id: "stg-contact", name: "Osloveno", color: "#5470FF", type: "open" },
  { id: "stg-negotiation", name: "Jednání", color: "#10B981", type: "open" },
  { id: "stg-won", name: "Vyhráno", color: "#EC4899", type: "won" },
];

export const DEMO_TEAMS: DemoTeam[] = [
  { id: "team-praha", name: "Praha", color: "#3D5AFE" },
  { id: "team-brno", name: "Brno", color: "#F59E0B" },
  { id: "team-bratislava", name: "Bratislava", color: "#10B981" },
];

export const DEMO_SALES: DemoSalesperson[] = [
  { id: "u-1", name: "Petra Nováková", team_id: "team-praha" },
  { id: "u-2", name: "Jakub Černý", team_id: "team-praha" },
  { id: "u-3", name: "Lucie Dvořáková", team_id: "team-brno" },
  { id: "u-4", name: "Tomáš Procházka", team_id: "team-brno" },
  { id: "u-5", name: "Martin Kováč", team_id: "team-bratislava" },
  { id: "u-6", name: "Eva Horváthová", team_id: "team-bratislava" },
];

// Tuned so the team-leaderboard's default ranking is Praha > Brno >
// Bratislava. The sort is by total won-deal value descending (see
// InteractivePipeline.tsx). Won totals:
//   Praha (u-2):       168 000 Kč
//   Brno  (u-3):        95 000 Kč
//   Bratislava (u-6):   80 000 Kč
export const DEMO_DEALS_INITIAL: DemoDeal[] = [
  // Nový lead
  {
    id: "d-1",
    name: "Audit pipeline",
    company: "Alza.cz",
    value: 42_500,
    stage_id: "stg-new",
    owner_id: "u-1",
  },
  {
    id: "d-2",
    name: "Onboarding tým",
    company: "Rohlík",
    value: 28_000,
    stage_id: "stg-new",
    owner_id: "u-3",
  },
  // Osloveno
  {
    id: "d-3",
    name: "Konzultace",
    company: "Notino",
    value: 60_000,
    stage_id: "stg-contact",
    owner_id: "u-2",
  },
  {
    id: "d-4",
    name: "Demo CRM",
    company: "Lidl ČR",
    value: 95_000,
    stage_id: "stg-contact",
    owner_id: "u-4",
  },
  // Jednání
  {
    id: "d-5",
    name: "Integrace ERP",
    company: "Asseco",
    value: 210_000,
    stage_id: "stg-negotiation",
    owner_id: "u-2",
  },
  // Vyhráno — totals tuned for Praha > Brno > Bratislava ranking.
  {
    id: "d-6",
    name: "Roční podpora Heureka",
    company: "Heureka.cz",
    value: 168_000,
    stage_id: "stg-won",
    owner_id: "u-2",
  },
  {
    id: "d-7",
    name: "Audit Brno",
    company: "Albert ČR",
    value: 95_000,
    stage_id: "stg-won",
    owner_id: "u-3",
  },
  {
    id: "d-8",
    name: "Konzultace SK",
    company: "Tatra banka",
    value: 80_000,
    stage_id: "stg-won",
    owner_id: "u-6",
  },
];
