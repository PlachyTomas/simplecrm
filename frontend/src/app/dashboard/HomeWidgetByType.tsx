/**
 * Single dispatcher: maps a `HomeWidgetEntry` to its concrete component.
 *
 * Home-native widgets (KPI tiles, quick actions, invite card, velocity)
 * render their own components; the 12 Reports analytics types delegate to
 * the shared `WidgetByType` via `HomeReportWidget`. Bare-card widgets (KPI
 * tiles, quick actions) get their edit affordances from `HomeEditChrome`;
 * the framed widgets (velocity, reports) carry their own `WidgetFrame`.
 */

import { useTranslation } from "react-i18next";

import type { HomeWidgetEntry, HomeWidgetType } from "@/app/dashboard/useHomeDashboard";
import { homeWidgetIcon, homeWidgetLabel, isHomeNativeType } from "@/app/dashboard/homeWidgetCatalog";
import { HomeEditChrome } from "@/app/dashboard/widgets/HomeEditChrome";
import { HomeInviteWidget } from "@/app/dashboard/widgets/HomeInviteWidget";
import { HomeKpiWidget, type HomeKpiType } from "@/app/dashboard/widgets/HomeKpiWidget";
import { HomeReportWidget } from "@/app/dashboard/widgets/HomeReportWidget";
import { HomeVelocityWidget } from "@/app/dashboard/widgets/HomeVelocityWidget";
import { QuickActionTile } from "@/app/dashboard/widgets/QuickActionTile";

const KPI_TYPES = new Set<HomeWidgetType>([
  "kpi_open_deals",
  "kpi_pipeline_value",
  "kpi_won_month",
  "kpi_revenue_month",
]);

const ACTION_TYPES = new Set<HomeWidgetType>([
  "action_new_deal",
  "action_new_company",
  "action_new_contact",
  "action_new_activity",
]);

interface Props {
  entry: HomeWidgetEntry;
  isEditMode: boolean;
  onRemove: () => void;
  /** Open the date-preset config popover for this widget id. */
  onConfigOpen: (id: string) => void;
  /** Fire a quick action (open its create modal). */
  onAction: (type: HomeWidgetType) => void;
}

export function HomeWidgetByType({ entry, isEditMode, onRemove, onConfigOpen, onAction }: Props) {
  const { t } = useTranslation("dashboard");
  const { t: tReports } = useTranslation("reports");
  const type = entry.config.type as HomeWidgetType;
  const label = homeWidgetLabel(type, t, tReports);

  if (KPI_TYPES.has(type)) {
    return (
      <HomeEditChrome isEditMode={isEditMode} widgetId={entry.id} label={label} onRemove={onRemove}>
        <HomeKpiWidget type={type as HomeKpiType} />
      </HomeEditChrome>
    );
  }

  if (ACTION_TYPES.has(type)) {
    return (
      <HomeEditChrome isEditMode={isEditMode} widgetId={entry.id} label={label} onRemove={onRemove}>
        <QuickActionTile
          type={type}
          label={label}
          icon={homeWidgetIcon(type)}
          onActivate={() => onAction(type)}
          isEditMode={isEditMode}
        />
      </HomeEditChrome>
    );
  }

  if (type === "invite_teammates") {
    return <HomeInviteWidget entry={entry} isEditMode={isEditMode} onRemove={onRemove} />;
  }

  if (type === "velocity") {
    return (
      <HomeVelocityWidget
        entry={entry}
        isEditMode={isEditMode}
        onRemove={onRemove}
        onConfigOpen={onConfigOpen}
      />
    );
  }

  // Reports analytics types (guarded by isHomeNativeType === false).
  if (!isHomeNativeType(type)) {
    return (
      <HomeReportWidget
        entry={entry}
        isEditMode={isEditMode}
        onRemove={onRemove}
        onConfigOpen={onConfigOpen}
      />
    );
  }

  return null;
}
