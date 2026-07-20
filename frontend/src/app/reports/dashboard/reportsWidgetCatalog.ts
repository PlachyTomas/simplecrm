/**
 * Static metadata for the Reports "add widget" picker: per-type icon,
 * description key, default size, and the two catalog groups. Kept next
 * to the Reports domain types (it references `WidgetType`) rather than
 * in the shared widget-dashboard module, which stays domain-agnostic.
 */

import type { ParseKeys } from "i18next";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  CalendarClock,
  Clock,
  Filter,
  Medal,
  Percent,
  PieChart,
  Scale,
  Timer,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { WidgetType } from "@/app/reports/dashboard/types";
import type { WidgetGridPosition } from "@/components/widget-dashboard/WidgetGrid";

/** Report KPI tiles are small (w=3, h=2); charts/lists are large (w=6, h=4). */
const KPI_TYPES = [
  "pipeline_value",
  "weighted_pipeline",
  "new_companies",
  "deals_won",
  "won_vs_paid",
  "win_rate",
  "avg_deal_size",
  "sales_cycle_length",
  "lead_to_deal_conversion",
] as const satisfies readonly WidgetType[];

const ANALYTICS_TYPES = [
  "sales_forecast",
  "sales_leaderboard",
  "rep_activity",
  "lost_reasons_breakdown",
  "stale_deals",
  "companies_at_risk",
] as const satisfies readonly WidgetType[];

export const REPORTS_KPI_TYPES: readonly WidgetType[] = KPI_TYPES;
export const REPORTS_ANALYTICS_TYPES: readonly WidgetType[] = ANALYTICS_TYPES;

const KPI_TYPE_SET = new Set<WidgetType>(KPI_TYPES);

export function isKpiWidget(type: WidgetType): boolean {
  return KPI_TYPE_SET.has(type);
}

/** Default footprint for a freshly added widget of this type. */
export function defaultWidgetSize(type: WidgetType): { w: number; h: number } {
  return isKpiWidget(type) ? { w: 3, h: 2 } : { w: 6, h: 4 };
}

/** The y just below the current layout — where a new widget lands. */
export function nextRowY(positions: readonly WidgetGridPosition[]): number {
  return positions.reduce((max, p) => Math.max(max, p.y + p.h), 0);
}

export const WIDGET_ICONS: Record<WidgetType, LucideIcon> = {
  pipeline_value: TrendingUp,
  weighted_pipeline: Scale,
  new_companies: Building2,
  deals_won: Trophy,
  won_vs_paid: Wallet,
  sales_forecast: CalendarClock,
  win_rate: Percent,
  avg_deal_size: Banknote,
  sales_cycle_length: Timer,
  lead_to_deal_conversion: Filter,
  lost_reasons_breakdown: PieChart,
  sales_leaderboard: Medal,
  rep_activity: Activity,
  stale_deals: Clock,
  companies_at_risk: AlertTriangle,
};

export const WIDGET_DESCRIPTION_KEY: Record<WidgetType, ParseKeys<"reports">> = {
  pipeline_value: "widgetDescriptions.pipeline_value",
  weighted_pipeline: "widgetDescriptions.weighted_pipeline",
  new_companies: "widgetDescriptions.new_companies",
  deals_won: "widgetDescriptions.deals_won",
  won_vs_paid: "widgetDescriptions.won_vs_paid",
  sales_forecast: "widgetDescriptions.sales_forecast",
  win_rate: "widgetDescriptions.win_rate",
  avg_deal_size: "widgetDescriptions.avg_deal_size",
  sales_cycle_length: "widgetDescriptions.sales_cycle_length",
  lead_to_deal_conversion: "widgetDescriptions.lead_to_deal_conversion",
  lost_reasons_breakdown: "widgetDescriptions.lost_reasons_breakdown",
  sales_leaderboard: "widgetDescriptions.sales_leaderboard",
  rep_activity: "widgetDescriptions.rep_activity",
  stale_deals: "widgetDescriptions.stale_deals",
  companies_at_risk: "widgetDescriptions.companies_at_risk",
};
