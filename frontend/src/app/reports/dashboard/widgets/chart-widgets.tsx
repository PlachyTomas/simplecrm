/**
 * The three bar-chart widgets — `lost_reasons_breakdown`,
 * `sales_leaderboard`, `rep_activity`. They all funnel into the
 * shared `BarChartWidget` (Recharts).
 *
 * `sales_leaderboard` paints the leader's bar with the brand magenta
 * accent — the page's only intentional magenta moment per
 * REPORTS_TASK §4 widget #9 / `ui-design.md` §5.7.
 */

import { useTranslation } from "react-i18next";

import { WidgetError, WidgetFrame, WidgetSkeleton } from "@/components/widget-dashboard/WidgetFrame";
import {
  type GlobalFilters,
  type WidgetEntry,
  WIDGET_LABEL_KEY,
} from "@/app/reports/dashboard/types";
import { useWidgetQuery } from "@/app/reports/dashboard/useWidgetQuery";
import { BarChartWidget, type BarRow } from "@/app/reports/dashboard/widgets/BarChartWidget";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import type { components } from "@/types/api.generated";

type ApiSchemas = components["schemas"];
type Config = ApiSchemas["WidgetEntry"]["config"];

interface BaseWidgetProps {
  entry: WidgetEntry;
  globalFilters: GlobalFilters;
  isEditMode: boolean;
  onRemove: () => void;
}

function narrowConfig<T extends Config["type"]>(
  config: Config,
  expected: T,
): Extract<Config, { type: T }> {
  if (config.type !== expected) {
    throw new Error(`widget config type mismatch: expected ${expected}, got ${config.type}`);
  }
  return config as Extract<Config, { type: T }>;
}

// ---------- lost_reasons_breakdown ----------

export function LostReasonsBreakdownWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "lost_reasons_breakdown");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["LostReasonsBreakdownResponse"]>({
    type: "lost_reasons_breakdown",
    endpoint: "lost-reasons-breakdown",
    config,
    globalFilters: props.globalFilters,
  });

  const rows: BarRow[] =
    q.data?.items.map((item) => ({
      label: item.reason,
      value: config.display === "value" ? Number(item.value) : item.count,
      display:
        config.display === "value"
          ? formatMoney(item.value, q.data!.currency, locale)
          : `${item.count}×`,
    })) ?? [];

  return (
    <WidgetFrame
      label={t(WIDGET_LABEL_KEY.lost_reasons_breakdown)}
      isEditMode={props.isEditMode}
      onRemove={props.onRemove}
    >
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <BarChartWidget
          rows={rows}
          ariaLabel={t("chart.lostReasonsAriaLabel")}
          emptyMessage={t("chart.lostReasonsEmpty")}
        />
      )}
    </WidgetFrame>
  );
}

// ---------- sales_leaderboard ----------

export function SalesLeaderboardWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "sales_leaderboard");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["SalesLeaderboardResponse"]>({
    type: "sales_leaderboard",
    endpoint: "sales-leaderboard",
    config,
    globalFilters: props.globalFilters,
  });

  const rows: BarRow[] =
    q.data?.items.map((item, i) => ({
      label: item.name,
      value: Number(item.metric_value),
      display: formatLeaderboardValue(item.metric_value, config.metric, q.data!.currency, locale),
      rank: i + 1,
    })) ?? [];

  // Suppress the magenta if everyone tied at zero (no closed deals).
  const allZero = rows.length > 0 && rows.every((r) => r.value === 0);
  const highlightIndex = !allZero && rows.length > 0 ? 0 : undefined;

  return (
    <WidgetFrame
      label={t(WIDGET_LABEL_KEY.sales_leaderboard)}
      isEditMode={props.isEditMode}
      onRemove={props.onRemove}
    >
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <BarChartWidget
          rows={rows}
          highlightIndex={highlightIndex}
          ariaLabel={t("chart.leaderboardAriaLabel")}
          emptyMessage={t("chart.leaderboardEmpty")}
        />
      )}
    </WidgetFrame>
  );
}

function formatLeaderboardValue(
  raw: string | number,
  metric: string,
  currency: string,
  locale: string,
): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return String(raw);
  switch (metric) {
    case "won_value":
      return formatMoney(n, currency, locale);
    case "win_rate":
      return formatPercent(n, locale, 1);
    case "won_count":
    case "deals_added":
    default:
      return formatNumber(n, locale);
  }
}

// ---------- rep_activity ----------

export function RepActivityWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "rep_activity");
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["RepActivityResponse"]>({
    type: "rep_activity",
    endpoint: "rep-activity",
    config,
    globalFilters: props.globalFilters,
  });

  const rows: BarRow[] =
    q.data?.items.map((item, i) => ({
      label: item.name,
      value: item.deals_added,
      display: formatNumber(item.deals_added, locale),
      rank: i + 1,
    })) ?? [];

  return (
    <WidgetFrame
      label={t(WIDGET_LABEL_KEY.rep_activity)}
      isEditMode={props.isEditMode}
      onRemove={props.onRemove}
    >
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <BarChartWidget
          rows={rows}
          ariaLabel={t("chart.repActivityAriaLabel")}
          emptyMessage={t("chart.repActivityEmpty")}
        />
      )}
    </WidgetFrame>
  );
}
