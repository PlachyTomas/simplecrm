/**
 * Single dispatcher: maps a `WidgetEntry` to its concrete component.
 *
 * R6.1 covers the seven KPI tiles. R6.2 (`sales_leaderboard`,
 * `rep_activity`, `lost_reasons_breakdown`) and R6.3 (`stale_deals`,
 * `companies_at_risk`) plug in by adding cases here — no change
 * needed in `ReportsPage` or `WidgetGrid`.
 */

import {
  WidgetEmpty,
  WidgetFrame,
} from "@/app/reports/dashboard/WidgetFrame";
import {
  type GlobalFilters,
  type WidgetEntry,
  WIDGET_LABEL,
  type WidgetType,
} from "@/app/reports/dashboard/types";
import {
  AvgDealSizeWidget,
  DealsWonWidget,
  LeadToDealConversionWidget,
  NewCompaniesWidget,
  PipelineValueWidget,
  SalesCycleLengthWidget,
  WinRateWidget,
} from "@/app/reports/dashboard/widgets/kpi-widgets";

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
    case "rep_activity":
    case "lost_reasons_breakdown":
    case "stale_deals":
    case "companies_at_risk":
      return (
        <WidgetFrame
          label={WIDGET_LABEL[type]}
          isEditMode={props.isEditMode}
          onRemove={props.onRemove}
        >
          <WidgetEmpty message="Připravujeme — widget se zobrazí v R6.2 / R6.3." />
        </WidgetFrame>
      );
  }
}
