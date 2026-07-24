import { Handshake, Target, Trophy, Workflow, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useKpiSummary, type KpiSummary } from "@/app/dashboard/useKpi";
import { WidgetFrame, WidgetSkeleton } from "@/components/widget-dashboard/WidgetFrame";
import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";

export type HomeKpiType =
  | "kpi_open_deals"
  | "kpi_pipeline_value"
  | "kpi_won_month"
  | "kpi_revenue_month";

interface Meta {
  hintKey: "openDealsHint" | "pipelineValueHint" | "wonThisMonthHint" | "revenueThisMonthHint";
  icon: LucideIcon;
  accent?: "highlight";
}

const META: Record<HomeKpiType, Meta> = {
  kpi_open_deals: { hintKey: "openDealsHint", icon: Handshake },
  kpi_pipeline_value: { hintKey: "pipelineValueHint", icon: Workflow },
  kpi_won_month: { hintKey: "wonThisMonthHint", icon: Target },
  kpi_revenue_month: { hintKey: "revenueThisMonthHint", icon: Trophy, accent: "highlight" },
};

function kpiValue(type: HomeKpiType, kpi: KpiSummary, locale: string): string {
  switch (type) {
    case "kpi_open_deals":
      return String(kpi.open_deal_count);
    case "kpi_pipeline_value":
      return formatMoney(kpi.open_pipeline_value, kpi.currency, locale);
    case "kpi_won_month":
      return String(kpi.won_this_month_count);
    case "kpi_revenue_month":
      return formatMoney(kpi.won_this_month_value, kpi.currency, locale);
  }
}

interface HomeKpiWidgetProps {
  type: HomeKpiType;
  isEditMode: boolean;
  onRemove: () => void;
}

/**
 * A single home KPI tile, framed with the shared `WidgetFrame` so it matches
 * the Reports widgets. The value + hint sit in the body next to the metric's
 * icon box; the revenue tile keeps the magenta `highlight` accent, the rest
 * are indigo. React Query dedupes the four tiles into one summary request.
 */
export function HomeKpiWidget({ type, isEditMode, onRemove }: HomeKpiWidgetProps) {
  const { t } = useTranslation("dashboard");
  const locale = useLocale();
  const { data: kpi, isPending, isError } = useKpiSummary();
  const meta = META[type];
  const Icon = meta.icon;
  // The revenue tile's magenta box is the screen's celebration moment; every
  // other tile keeps the indigo accent box — same styling KpiCard used.
  const iconBox =
    meta.accent === "highlight"
      ? "bg-brand-accent-subtle text-brand-accent"
      : "bg-accent-subtle text-accent";

  const failed = isError || !kpi;
  const value = kpi ? kpiValue(type, kpi, locale) : "—";
  const hint = failed ? t("widgetUnavailable.short") : t(`dashboardPage.${meta.hintKey}`);

  return (
    <WidgetFrame label={t(`widgetLabels.${type}`)} isEditMode={isEditMode} onRemove={onRemove}>
      {isPending ? (
        <WidgetSkeleton />
      ) : (
        <div className="flex h-full items-start justify-between gap-3">
          <div className="flex h-full min-w-0 flex-1 flex-col justify-between gap-2">
            <p className="text-3xl font-semibold tabular-nums text-text-primary">{value}</p>
            <p className="text-xs text-text-tertiary">{hint}</p>
          </div>
          <span
            aria-hidden
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              iconBox,
            )}
          >
            <Icon size={16} strokeWidth={1.75} />
          </span>
        </div>
      )}
    </WidgetFrame>
  );
}
