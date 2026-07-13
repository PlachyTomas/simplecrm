import { useMemo } from "react";

import type { GlobalFilters, WidgetEntry } from "@/app/reports/dashboard/types";
import { WidgetByType } from "@/app/reports/dashboard/widgets/WidgetByType";

import type { HomeWidgetEntry } from "@/app/dashboard/useHomeDashboard";

interface HomeReportWidgetProps {
  entry: HomeWidgetEntry;
  isEditMode: boolean;
  onRemove: () => void;
  /** Open the date-preset config popover for this widget. */
  onConfigOpen: (id: string) => void;
}

/**
 * Renders a Reports analytics widget on the home dashboard by delegating to
 * the shared `WidgetByType` renderer. Home has no global filter bar, so we
 * synthesize `globalFilters` from the widget's own `date_preset` (default
 * last 30 days) with no team/owner scope. The date-preset gear rides the
 * frame's own `onConfigClick` slot; we pass it only in edit mode.
 */
export function HomeReportWidget({
  entry,
  isEditMode,
  onRemove,
  onConfigOpen,
}: HomeReportWidgetProps) {
  const globalFilters = useMemo<GlobalFilters>(
    () => ({
      dateRange: { preset: entry.config.date_preset ?? "last_30_days", from: null, to: null },
      teamId: null,
      ownerUserId: null,
    }),
    [entry.config.date_preset],
  );

  return (
    <WidgetByType
      entry={entry as unknown as WidgetEntry}
      globalFilters={globalFilters}
      isEditMode={isEditMode}
      onRemove={onRemove}
      onConfigClick={isEditMode ? () => onConfigOpen(entry.id) : undefined}
    />
  );
}
