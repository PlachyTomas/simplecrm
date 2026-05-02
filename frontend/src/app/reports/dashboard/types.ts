/**
 * Local type aliases drawn from the OpenAPI types so the rest of the
 * Reports surface doesn't have to spell out the long
 * `components["schemas"]["…"]` paths.
 */

import type { components } from "@/types/api.generated";

export type DashboardConfig = components["schemas"]["DashboardConfig"];
export type WidgetEntry = components["schemas"]["WidgetEntry"];
export type WidgetPosition = components["schemas"]["WidgetPosition"];
export type GlobalFilters = components["schemas"]["GlobalFilters"];
export type DateRangeFilter = components["schemas"]["DateRangeFilter"];

export type WidgetType =
  | "pipeline_value"
  | "new_companies"
  | "deals_won"
  | "win_rate"
  | "avg_deal_size"
  | "sales_cycle_length"
  | "lead_to_deal_conversion"
  | "lost_reasons_breakdown"
  | "sales_leaderboard"
  | "rep_activity"
  | "stale_deals"
  | "companies_at_risk";

/**
 * Each widget type has its own Czech display label per
 * REPORTS_TASK §4. Centralized so the WidgetFrame header and the
 * "Add widget" picker speak in the same words.
 */
export const WIDGET_LABEL: Record<WidgetType, string> = {
  pipeline_value: "Hodnota pipeline",
  new_companies: "Nové firmy",
  deals_won: "Vyhrané obchody",
  win_rate: "Úspěšnost",
  avg_deal_size: "Průměrná velikost obchodu",
  sales_cycle_length: "Délka prodejního cyklu",
  lead_to_deal_conversion: "Konverze lead → obchod",
  lost_reasons_breakdown: "Důvody prohraných obchodů",
  sales_leaderboard: "Žebříček obchodníků",
  rep_activity: "Aktivita obchodníků",
  stale_deals: "Stagnující obchody",
  companies_at_risk: "Firmy ohrožené uvolněním",
};

export const WIDGET_TYPES: WidgetType[] = Object.keys(WIDGET_LABEL) as WidgetType[];
