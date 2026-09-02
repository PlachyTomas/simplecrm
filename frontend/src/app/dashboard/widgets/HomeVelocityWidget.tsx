import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { resolvePreset } from "@/app/reports/dashboard/dateRange";
import { useVelocity } from "@/app/reports/useReports";
import {
  WidgetEmpty,
  WidgetFrame,
  WidgetSkeleton,
} from "@/components/widget-dashboard/WidgetFrame";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";

import type { HomeDatePreset } from "@/app/dashboard/homeLayout";
import { HomeWidgetUnavailable } from "@/app/dashboard/widgets/HomeWidgetUnavailable";

interface HomeVelocityWidgetProps {
  isEditMode: boolean;
  onRemove: () => void;
  /** The dashboard-wide date range (edit toolbar owns changing it). */
  datePreset: HomeDatePreset;
}

/**
 * Pipeline-velocity list (average days in each stage), ported from the old
 * `ManagerWidgets`. Renders the dashboard's global date range.
 */
export function HomeVelocityWidget({ isEditMode, onRemove, datePreset }: HomeVelocityWidgetProps) {
  const { t } = useTranslation("dashboard");
  const locale = useLocale();
  const range = useMemo(
    () => resolvePreset({ preset: datePreset, from: null, to: null }),
    [datePreset],
  );
  const velocity = useVelocity(range);

  return (
    <WidgetFrame label={t("widgetLabels.velocity")} isEditMode={isEditMode} onRemove={onRemove}>
      {velocity.isPending ? (
        <WidgetSkeleton />
      ) : velocity.isError || !velocity.data ? (
        <HomeWidgetUnavailable />
      ) : velocity.data.stages.length === 0 ? (
        <WidgetEmpty message={t("managerWidgets.noClosedDeals")} />
      ) : (
        <ul className="space-y-2">
          {velocity.data.stages.map((stage) => (
            <li key={stage.stage_id} className="flex items-center justify-between text-sm">
              <span className="text-text-primary">{stage.stage_name}</span>
              <span className="tabular-nums text-text-secondary">
                {stage.avg_days_in_stage == null
                  ? "—"
                  : t("managerWidgets.avgDurationDays", {
                      days: formatNumber(Math.round(stage.avg_days_in_stage * 10) / 10, locale, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      }),
                    })}{" "}
                · {stage.deal_count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
