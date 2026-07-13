/**
 * The seven KPI tile widgets — `pipeline_value`, `deals_won`,
 * `win_rate`, `avg_deal_size`, `sales_cycle_length`,
 * `lead_to_deal_conversion`, `new_companies`. They all share the same
 * shape: fetch one widget endpoint via `useWidgetQuery`, render the
 * primary number + optional sparkline through `KPITile`, and the
 * comparison delta in `WidgetFrame.footer`.
 *
 * Empty-denominator cases (no closed deals → `win_rate.value === null`,
 * etc.) render an em-dash and a plain hint per REPORTS_TASK §4.
 */

import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { DeltaBadge } from "@/app/reports/dashboard/DeltaBadge";
import {
  WidgetEmpty,
  WidgetError,
  WidgetFrame,
  WidgetSkeleton,
} from "@/components/widget-dashboard/WidgetFrame";
import {
  type GlobalFilters,
  type WidgetEntry,
  WIDGET_LABEL_KEY,
} from "@/app/reports/dashboard/types";
import { useWidgetQuery } from "@/app/reports/dashboard/useWidgetQuery";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import type { components } from "@/types/api.generated";

import { KPITile } from "@/app/reports/dashboard/widgets/KPITile";

type ApiSchemas = components["schemas"];
type Config = ApiSchemas["WidgetEntry"]["config"];

interface BaseWidgetProps {
  entry: WidgetEntry;
  globalFilters: GlobalFilters;
  isEditMode: boolean;
  onRemove: () => void;
  /** Optional per-widget settings gear (home dashboard's date preset). */
  onConfigClick?: () => void;
}

/**
 * Type-narrowing hook: pull a config of a specific widget type out of
 * the discriminated union without prop-drilling the cast everywhere.
 */
function narrowConfig<T extends Config["type"]>(
  config: Config,
  expected: T,
): Extract<Config, { type: T }> {
  if (config.type !== expected) {
    throw new Error(`widget config type mismatch: expected ${expected}, got ${config.type}`);
  }
  return config as Extract<Config, { type: T }>;
}

/**
 * Renders an average/median day count via the `days_one/_few/_other`
 * (+ `_many` for the fractional averages this widget deals with)
 * catalog key. `value` carries the always-one-decimal display text
 * (locale decimal separator); `count` (the raw, possibly fractional
 * number) drives i18next's plural-category selection.
 */
function formatDaysLabel(
  t: TFunction<"reports">,
  locale: string,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 10) / 10;
  return t("days", {
    count: rounded,
    value: formatNumber(rounded, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  });
}

// --------- pipeline_value ---------

export function PipelineValueWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "pipeline_value");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["PipelineValueResponse"]>({
    type: "pipeline_value",
    endpoint: "pipeline-value",
    config,
    globalFilters: props.globalFilters,
  });
  return (
    <Frame {...props} type="pipeline_value">
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <KPITile
          value={formatMoney(q.data.value, q.data.currency, locale)}
          delta={<DeltaBadge comparison={q.data.comparison} />}
          sparkline={q.data.sparkline}
          sparklineLabel={t("kpi.pipelineValue.sparklineLabel")}
          hint={t("kpi.pipelineValue.hint")}
        />
      )}
    </Frame>
  );
}

// --------- deals_won ---------

export function DealsWonWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "deals_won");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["DealsWonResponse"]>({
    type: "deals_won",
    endpoint: "deals-won",
    config,
    globalFilters: props.globalFilters,
  });
  const display = config.display;
  return (
    <Frame {...props} type="deals_won">
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <KPITile
          value={
            display === "value"
              ? formatMoney(q.data.value, q.data.currency, locale)
              : formatNumber(q.data.count, locale)
          }
          secondary={
            display === "both" ? formatMoney(q.data.value, q.data.currency, locale) : undefined
          }
          delta={<DeltaBadge comparison={q.data.comparison} />}
          sparkline={q.data.sparkline}
          sparklineLabel={t("kpi.dealsWon.sparklineLabel")}
        />
      )}
    </Frame>
  );
}

// --------- win_rate ---------

export function WinRateWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "win_rate");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["WinRateResponse"]>({
    type: "win_rate",
    endpoint: "win-rate",
    config,
    globalFilters: props.globalFilters,
  });
  const totalClosed = (q.data?.won_count ?? 0) + (q.data?.lost_count ?? 0);
  const empty = q.data?.value === null;
  return (
    <Frame {...props} type="win_rate">
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : empty ? (
        <WidgetEmpty message={t("kpi.winRate.emptyNoClosedDeals")} />
      ) : (
        <KPITile
          value={formatPercent(q.data.value, locale, 1)}
          delta={<DeltaBadge comparison={q.data.comparison} />}
          hint={t("kpi.winRate.hint", { count: q.data.won_count, total: totalClosed })}
        />
      )}
    </Frame>
  );
}

// --------- avg_deal_size ---------

export function AvgDealSizeWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "avg_deal_size");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["AvgDealSizeResponse"]>({
    type: "avg_deal_size",
    endpoint: "avg-deal-size",
    config,
    globalFilters: props.globalFilters,
  });
  return (
    <Frame {...props} type="avg_deal_size">
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : q.data.sample_count === 0 ? (
        <WidgetEmpty
          message={
            config.scope === "won"
              ? t("kpi.avgDealSize.emptyNoWonDeals")
              : t("kpi.avgDealSize.emptyNoOpenDeals")
          }
        />
      ) : (
        <KPITile
          value={formatMoney(q.data.value, q.data.currency, locale)}
          delta={<DeltaBadge comparison={q.data.comparison} />}
          hint={t(
            config.scope === "won" ? "kpi.avgDealSize.hintWon" : "kpi.avgDealSize.hintOpen",
            { count: q.data.sample_count },
          )}
        />
      )}
    </Frame>
  );
}

// --------- sales_cycle_length ---------

export function SalesCycleLengthWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "sales_cycle_length");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["SalesCycleLengthResponse"]>({
    type: "sales_cycle_length",
    endpoint: "sales-cycle-length",
    config,
    globalFilters: props.globalFilters,
  });
  // Shorter cycle = good, so the trend arrow logic flips here.
  return (
    <Frame {...props} type="sales_cycle_length">
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : q.data.value === null ? (
        <WidgetEmpty message={t("kpi.salesCycleLength.emptyNoClosedDeals")} />
      ) : (
        <KPITile
          value={formatDaysLabel(t, locale, q.data.value)}
          hint={
            config.metric === "median"
              ? t("kpi.salesCycleLength.hintMean", {
                  days: formatDaysLabel(t, locale, q.data.mean_days),
                  count: q.data.sample_count,
                })
              : t("kpi.salesCycleLength.hintMedian", {
                  days: formatDaysLabel(t, locale, q.data.median_days),
                  count: q.data.sample_count,
                })
          }
        />
      )}
    </Frame>
  );
}

// --------- lead_to_deal_conversion ---------

export function LeadToDealConversionWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "lead_to_deal_conversion");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["LeadToDealConversionResponse"]>({
    type: "lead_to_deal_conversion",
    endpoint: "lead-to-deal-conversion",
    config,
    globalFilters: props.globalFilters,
  });
  return (
    <Frame {...props} type="lead_to_deal_conversion">
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : q.data.value === null ? (
        <WidgetEmpty message={t("kpi.leadToDealConversion.emptyNoNewCompanies")} />
      ) : (
        <KPITile
          value={formatPercent(q.data.value, locale, 1)}
          delta={<DeltaBadge comparison={q.data.comparison} />}
          hint={t("kpi.leadToDealConversion.hint", {
            converted: q.data.converted_count,
            total: q.data.total_count,
          })}
        />
      )}
    </Frame>
  );
}

// --------- new_companies ---------

export function NewCompaniesWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "new_companies");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["NewCompaniesResponse"]>({
    type: "new_companies",
    endpoint: "new-companies",
    config,
    globalFilters: props.globalFilters,
  });
  return (
    <Frame {...props} type="new_companies">
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <KPITile
          value={formatNumber(q.data.value, locale)}
          delta={<DeltaBadge comparison={q.data.comparison} />}
          sparkline={q.data.sparkline}
          sparklineLabel={t("kpi.newCompanies.sparklineLabel")}
          hint={t("kpi.newCompanies.hint")}
        />
      )}
    </Frame>
  );
}

// --------- shared frame wrapper ---------

interface FrameProps extends BaseWidgetProps {
  type: ApiSchemas["WidgetEntry"]["config"]["type"];
  children: React.ReactNode;
}

function Frame({ entry: _entry, isEditMode, onRemove, onConfigClick, type, children }: FrameProps) {
  const { t } = useTranslation("reports");
  return (
    <WidgetFrame
      label={t(WIDGET_LABEL_KEY[type])}
      isEditMode={isEditMode}
      onRemove={onRemove}
      onConfigClick={onConfigClick}
    >
      {children}
    </WidgetFrame>
  );
}
