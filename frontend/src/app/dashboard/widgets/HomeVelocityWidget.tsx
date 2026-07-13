import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { resolvePreset } from "@/app/reports/dashboard/dateRange";
import { useVelocity } from "@/app/reports/useReports";
import { WidgetEmpty, WidgetFrame, WidgetSkeleton } from "@/components/widget-dashboard/WidgetFrame";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";

import type { HomeWidgetEntry } from "@/app/dashboard/useHomeDashboard";
import { HomeWidgetUnavailable } from "@/app/dashboard/widgets/HomeWidgetUnavailable";

interface HomeVelocityWidgetProps {
  entry: HomeWidgetEntry;
  isEditMode: boolean;
  onRemove: () => void;
  /** Open the date-preset config popover for this widget. */
  onConfigOpen: (id: string) => void;
}

/**
 * Pipeline-velocity list (average days in each stage), ported from the old
 * `ManagerWidgets`. Respects the widget's `date_preset` (default last 30
 * days) and exposes the config gear so the range can be changed per widget.
 */
export function HomeVelocityWidget({ entry, isEditMode, onRemove, onConfigOpen }: HomeVelocityWidgetProps) {
  const { t } = useTranslation("dashboard");
  const locale = useLocale();
  const preset = entry.config.date_preset ?? "last_30_days";
  const range = useMemo(() => resolvePreset({ preset, from: null, to: null }), [preset]);
  const velocity = useVelocity(range);

  return (
    <WidgetFrame
      label={t("widgetLabels.velocity")}
      isEditMode={isEditMode}
      onRemove={onRemove}
      // The preset writes into the edit draft, so the gear only shows in
      // edit mode — matching the analytics widgets' overlay gear.
      onConfigClick={isEditMode ? () => onConfigOpen(entry.id) : undefined}
    >
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
