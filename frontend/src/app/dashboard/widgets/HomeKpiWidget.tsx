import { Handshake, Target, Trophy, Workflow, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useKpiSummary } from "@/app/dashboard/useKpi";
import { KpiCard } from "@/components/ui/KpiCard";
import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";

export type HomeKpiType =
  | "kpi_open_deals"
  | "kpi_pipeline_value"
  | "kpi_won_month"
  | "kpi_revenue_month";

interface Meta {
  labelKey: "openDeals" | "pipelineValue" | "wonThisMonth" | "revenueThisMonth";
  hintKey: "openDealsHint" | "pipelineValueHint" | "wonThisMonthHint" | "revenueThisMonthHint";
  icon: LucideIcon;
  accent?: "highlight";
}

const META: Record<HomeKpiType, Meta> = {
  kpi_open_deals: { labelKey: "openDeals", hintKey: "openDealsHint", icon: Handshake },
  kpi_pipeline_value: { labelKey: "pipelineValue", hintKey: "pipelineValueHint", icon: Workflow },
  kpi_won_month: { labelKey: "wonThisMonth", hintKey: "wonThisMonthHint", icon: Target },
  kpi_revenue_month: {
    labelKey: "revenueThisMonth",
    hintKey: "revenueThisMonthHint",
    icon: Trophy,
    accent: "highlight",
  },
};

/**
 * A single home KPI tile — a bare `KpiCard` reading the shared reports
 * KPI summary (React Query dedupes the four tiles into one request). The
 * revenue tile keeps the magenta `highlight` accent; the rest are indigo.
 */
export function HomeKpiWidget({ type }: { type: HomeKpiType }) {
  const { t } = useTranslation("dashboard");
  const locale = useLocale();
  const { data: kpi, isPending, isError } = useKpiSummary();
  const meta = META[type];
  const label = t(`dashboardPage.${meta.labelKey}`);
  const hint = t(`dashboardPage.${meta.hintKey}`);

  if (isPending) {
    return (
      <article
        role="status"
        aria-label={label}
        className="h-full rounded-lg border border-border bg-surface p-5 shadow-sm"
      >
        <div className="h-3 w-24 animate-pulse rounded bg-surface-overlay" />
        <div className="mt-6 h-8 w-28 animate-pulse rounded bg-surface-overlay" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-surface-overlay" />
      </article>
    );
  }

  if (isError || !kpi) {
    return <KpiCard label={label} value="—" hint={t("widgetUnavailable.short")} icon={meta.icon} />;
  }

  const value = (() => {
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
  })();

  return <KpiCard label={label} value={value} hint={hint} icon={meta.icon} accent={meta.accent} />;
}
