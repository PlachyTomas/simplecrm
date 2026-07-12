/**
 * Local type aliases drawn from the OpenAPI types so the rest of the
 * Reports surface doesn't have to spell out the long
 * `components["schemas"]["…"]` paths.
 */

import type { ParseKeys } from "i18next";

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
 * Each widget type has its own display label per REPORTS_TASK §4,
 * sourced from the `reports` catalog (`widgetLabels.*`). Centralized
 * so the WidgetFrame header and the "Add widget" picker speak in the
 * same words. Callers resolve the key via `t()`.
 */
export const WIDGET_LABEL_KEY: Record<WidgetType, ParseKeys<"reports">> = {
  pipeline_value: "widgetLabels.pipeline_value",
  new_companies: "widgetLabels.new_companies",
  deals_won: "widgetLabels.deals_won",
  win_rate: "widgetLabels.win_rate",
  avg_deal_size: "widgetLabels.avg_deal_size",
  sales_cycle_length: "widgetLabels.sales_cycle_length",
  lead_to_deal_conversion: "widgetLabels.lead_to_deal_conversion",
  lost_reasons_breakdown: "widgetLabels.lost_reasons_breakdown",
  sales_leaderboard: "widgetLabels.sales_leaderboard",
  rep_activity: "widgetLabels.rep_activity",
  stale_deals: "widgetLabels.stale_deals",
  companies_at_risk: "widgetLabels.companies_at_risk",
};

export const WIDGET_TYPES: WidgetType[] = Object.keys(WIDGET_LABEL_KEY) as WidgetType[];
