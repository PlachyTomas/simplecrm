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
 * the Reports widgets. The metric's icon box rides in the frame header beside
 * the label — the same arrangement `KpiCard` uses, and the reason the body is
 * free of it: a formatted money value is a single unbreakable token (Czech
 * `Intl` joins the groups with non-breaking spaces), so sitting the icon next
 * to it meant a wide number ran underneath the glyph instead of wrapping. The
 * revenue tile keeps the magenta `highlight` accent, the rest are indigo.
 * React Query dedupes the four tiles into one summary request.
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
    <WidgetFrame
      label={t(`widgetLabels.${type}`)}
      isEditMode={isEditMode}
      onRemove={onRemove}
      // Edit mode already spends the header on a drag handle and a remove
      // button; keeping the decorative glyph too truncated the label just
      // when the user needs to tell the tiles apart.
      controls={
        isEditMode ? undefined : (
          <span
            aria-hidden
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              iconBox,
            )}
          >
            <Icon size={16} strokeWidth={1.75} />
          </span>
        )
      }
    >
      {isPending ? (
        <WidgetSkeleton />
      ) : (
        <div className="flex h-full flex-col justify-between gap-2">
          <p className="text-3xl font-semibold tabular-nums text-text-primary">{value}</p>
          <p className="text-xs text-text-tertiary">{hint}</p>
        </div>
      )}
    </WidgetFrame>
  );
}
