import { useMemo } from "react";

import type { GlobalFilters, WidgetEntry } from "@/app/reports/dashboard/types";
import { WidgetByType } from "@/app/reports/dashboard/widgets/WidgetByType";

import type { HomeDatePreset } from "@/app/dashboard/homeLayout";
import type { HomeWidgetEntry } from "@/app/dashboard/useHomeDashboard";

interface HomeReportWidgetProps {
  entry: HomeWidgetEntry;
  isEditMode: boolean;
  onRemove: () => void;
  /** The dashboard-wide date range (edit toolbar owns changing it). */
  datePreset: HomeDatePreset;
}

/**
 * Renders a Reports analytics widget on the home dashboard by delegating to
 * the shared `WidgetByType` renderer. Home has no per-widget filters — the
 * dashboard-wide preset synthesizes `globalFilters` with no team/owner
 * scope.
 */
export function HomeReportWidget({
  entry,
  isEditMode,
  onRemove,
  datePreset,
}: HomeReportWidgetProps) {
  const globalFilters = useMemo<GlobalFilters>(
    () => ({
      dateRange: { preset: datePreset, from: null, to: null },
      teamId: null,
      ownerUserId: null,
    }),
    [datePreset],
  );

  return (
    <WidgetByType
      entry={entry as unknown as WidgetEntry}
      globalFilters={globalFilters}
      isEditMode={isEditMode}
      onRemove={onRemove}
    />
  );
}
