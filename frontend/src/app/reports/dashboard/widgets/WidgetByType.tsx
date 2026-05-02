/**
 * Single dispatcher: maps a `WidgetEntry` to its concrete component.
 *
 * R6.1 covers the seven KPI tiles, R6.2 the three bar charts, R6.3
 * the two list widgets. New widget types plug in by adding a case
 * here — no change needed in `ReportsPage` or `WidgetGrid`.
 */

import {
  type GlobalFilters,
  type WidgetEntry,
  type WidgetType,
} from "@/app/reports/dashboard/types";
import {
  LostReasonsBreakdownWidget,
  RepActivityWidget,
  SalesLeaderboardWidget,
} from "@/app/reports/dashboard/widgets/chart-widgets";
import {
  AvgDealSizeWidget,
  DealsWonWidget,
  LeadToDealConversionWidget,
  NewCompaniesWidget,
  PipelineValueWidget,
  SalesCycleLengthWidget,
  WinRateWidget,
} from "@/app/reports/dashboard/widgets/kpi-widgets";
import {
  CompaniesAtRiskWidget,
  StaleDealsWidget,
} from "@/app/reports/dashboard/widgets/list-widgets";

interface Props {
  entry: WidgetEntry;
  globalFilters: GlobalFilters;
  isEditMode: boolean;
  onRemove: () => void;
}

export function WidgetByType(props: Props) {
  const type = props.entry.config.type as WidgetType;
  switch (type) {
    case "pipeline_value":
      return <PipelineValueWidget {...props} />;
    case "deals_won":
      return <DealsWonWidget {...props} />;
    case "win_rate":
      return <WinRateWidget {...props} />;
    case "avg_deal_size":
      return <AvgDealSizeWidget {...props} />;
    case "sales_cycle_length":
      return <SalesCycleLengthWidget {...props} />;
    case "lead_to_deal_conversion":
      return <LeadToDealConversionWidget {...props} />;
    case "new_companies":
      return <NewCompaniesWidget {...props} />;
    case "sales_leaderboard":
      return <SalesLeaderboardWidget {...props} />;
    case "rep_activity":
      return <RepActivityWidget {...props} />;
    case "lost_reasons_breakdown":
      return <LostReasonsBreakdownWidget {...props} />;
    case "stale_deals":
      return <StaleDealsWidget {...props} />;
    case "companies_at_risk":
      return <CompaniesAtRiskWidget {...props} />;
  }
}
