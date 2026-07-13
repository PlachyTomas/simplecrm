/**
 * Static metadata + gating for the home dashboard "add widget" picker.
 *
 * The home catalog is a superset of the Reports catalog: it adds ten
 * home-native widget types (4 KPI tiles, 4 quick actions, the invite card
 * and the pipeline-velocity list) and re-exposes the 12 Reports analytics
 * widgets (duplicable, labelled from the `reports` namespace). Role gating
 * hides ineligible widgets from the picker entirely.
 */

import type { ParseKeys, TFunction } from "i18next";
import {
  Building2,
  CalendarPlus,
  Gauge,
  HandCoins,
  Handshake,
  Target,
  Trophy,
  UserPlus,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import {
  REPORTS_ANALYTICS_TYPES,
  REPORTS_KPI_TYPES,
  WIDGET_DESCRIPTION_KEY,
  WIDGET_ICONS,
  defaultWidgetSize,
} from "@/app/reports/dashboard/reportsWidgetCatalog";
import { WIDGET_LABEL_KEY, type WidgetType } from "@/app/reports/dashboard/types";
import type { CurrentUser } from "@/auth/useCurrentUser";
import type { WidgetPickerGroup } from "@/components/widget-dashboard/WidgetPicker";
import type { WidgetGridPosition } from "@/components/widget-dashboard/WidgetGrid";

import type { HomeWidgetType } from "@/app/dashboard/useHomeDashboard";

export { nextRowY } from "@/app/reports/dashboard/reportsWidgetCatalog";

/** The four home KPI tiles — bare `KpiCard`s reusing the dashboard summary. */
export const HOME_KPI_TYPES = [
  "kpi_open_deals",
  "kpi_pipeline_value",
  "kpi_won_month",
  "kpi_revenue_month",
] as const satisfies readonly HomeWidgetType[];

/** The four quick-action tiles — each opens a create-modal. */
export const HOME_ACTION_TYPES = [
  "action_new_deal",
  "action_new_company",
  "action_new_contact",
  "action_new_activity",
] as const satisfies readonly HomeWidgetType[];

/** Home-native widget types (everything not owned by the Reports catalog). */
export const HOME_NATIVE_TYPES = [
  ...HOME_KPI_TYPES,
  ...HOME_ACTION_TYPES,
  "invite_teammates",
  "velocity",
] as const satisfies readonly HomeWidgetType[];

export type HomeNativeType = (typeof HOME_NATIVE_TYPES)[number];

const HOME_NATIVE_SET: ReadonlySet<HomeWidgetType> = new Set(HOME_NATIVE_TYPES);

export function isHomeNativeType(type: HomeWidgetType): type is HomeNativeType {
  return HOME_NATIVE_SET.has(type);
}

/** Home-native icons; Reports types fall back to the Reports icon map. */
const HOME_ICONS: Record<HomeNativeType, LucideIcon> = {
  kpi_open_deals: Handshake,
  kpi_pipeline_value: Workflow,
  kpi_won_month: Target,
  kpi_revenue_month: Trophy,
  action_new_deal: HandCoins,
  action_new_company: Building2,
  action_new_contact: UserPlus,
  action_new_activity: CalendarPlus,
  invite_teammates: Users,
  velocity: Gauge,
};

export function homeWidgetIcon(type: HomeWidgetType): LucideIcon {
  if (isHomeNativeType(type)) return HOME_ICONS[type];
  return WIDGET_ICONS[type as WidgetType];
}

const HOME_LABEL_KEY: Record<HomeNativeType, ParseKeys<"dashboard">> = {
  kpi_open_deals: "widgetLabels.kpi_open_deals",
  kpi_pipeline_value: "widgetLabels.kpi_pipeline_value",
  kpi_won_month: "widgetLabels.kpi_won_month",
  kpi_revenue_month: "widgetLabels.kpi_revenue_month",
  action_new_deal: "widgetLabels.action_new_deal",
  action_new_company: "widgetLabels.action_new_company",
  action_new_contact: "widgetLabels.action_new_contact",
  action_new_activity: "widgetLabels.action_new_activity",
  invite_teammates: "widgetLabels.invite_teammates",
  velocity: "widgetLabels.velocity",
};

const HOME_DESCRIPTION_KEY: Record<HomeNativeType, ParseKeys<"dashboard">> = {
  kpi_open_deals: "widgetDescriptions.kpi_open_deals",
  kpi_pipeline_value: "widgetDescriptions.kpi_pipeline_value",
  kpi_won_month: "widgetDescriptions.kpi_won_month",
  kpi_revenue_month: "widgetDescriptions.kpi_revenue_month",
  action_new_deal: "widgetDescriptions.action_new_deal",
  action_new_company: "widgetDescriptions.action_new_company",
  action_new_contact: "widgetDescriptions.action_new_contact",
  action_new_activity: "widgetDescriptions.action_new_activity",
  invite_teammates: "widgetDescriptions.invite_teammates",
  velocity: "widgetDescriptions.velocity",
};

/** Resolved display label for any home widget type. */
export function homeWidgetLabel(
  type: HomeWidgetType,
  t: TFunction<"dashboard">,
  tReports: TFunction<"reports">,
): string {
  if (isHomeNativeType(type)) return t(HOME_LABEL_KEY[type]);
  return tReports(WIDGET_LABEL_KEY[type as WidgetType]);
}

function homeWidgetDescription(
  type: HomeWidgetType,
  t: TFunction<"dashboard">,
  tReports: TFunction<"reports">,
): string {
  if (isHomeNativeType(type)) return t(HOME_DESCRIPTION_KEY[type]);
  return tReports(WIDGET_DESCRIPTION_KEY[type as WidgetType]);
}

/** Default footprint (grid cells) for a freshly added widget of this type. */
export function defaultHomeWidgetSize(type: HomeWidgetType): { w: number; h: number } {
  if ((HOME_KPI_TYPES as readonly string[]).includes(type)) return { w: 3, h: 2 };
  if ((HOME_ACTION_TYPES as readonly string[]).includes(type)) return { w: 3, h: 1 };
  if (type === "invite_teammates") return { w: 12, h: 3 };
  if (type === "velocity") return { w: 6, h: 4 };
  return defaultWidgetSize(type as WidgetType);
}

/**
 * Whether a widget type is available to this user. `invite_teammates` needs
 * invite rights; `velocity`/`sales_leaderboard`/`rep_activity` are team-scoped
 * and need a manager/admin role or the org's salesperson-leaderboard flag.
 * Everything else is always available.
 */
export function isHomeWidgetEligible(type: HomeWidgetType, user: CurrentUser): boolean {
  const canInvite = user.role === "admin" || user.can_invite;
  const teamScoped =
    user.role === "admin" ||
    user.role === "manager" ||
    !!user.organization?.show_leaderboard_to_salespeople;

  if (type === "invite_teammates") return canInvite;
  if (type === "velocity" || type === "sales_leaderboard" || type === "rep_activity")
    return teamScoped;
  return true;
}

/** Types that may appear at most once on the dashboard (locked in the picker). */
function isUnique(type: HomeWidgetType): boolean {
  return isHomeNativeType(type);
}

interface BuildGroupsArgs {
  user: CurrentUser;
  presentTypes: ReadonlySet<HomeWidgetType>;
  t: TFunction<"dashboard">;
  tReports: TFunction<"reports">;
}

/**
 * Build the grouped picker catalog. Ineligible widgets are hidden entirely;
 * unique widgets already on the dashboard render an "added" (locked) state.
 */
export function buildHomePickerGroups({
  user,
  presentTypes,
  t,
  tReports,
}: BuildGroupsArgs): WidgetPickerGroup[] {
  const make = (type: HomeWidgetType) => ({
    type,
    label: homeWidgetLabel(type, t, tReports),
    description: homeWidgetDescription(type, t, tReports),
    icon: homeWidgetIcon(type),
    unique: isUnique(type),
    added: presentTypes.has(type),
  });

  const eligible = (types: readonly HomeWidgetType[]) =>
    types.filter((type) => isHomeWidgetEligible(type, user)).map(make);

  return [
    { title: t("widgetGroups.quickActions"), items: eligible(HOME_ACTION_TYPES) },
    {
      title: t("widgetGroups.overview"),
      items: eligible([...HOME_KPI_TYPES, "invite_teammates", "velocity"]),
    },
    {
      title: tReports("widgetPicker.groupKpi"),
      items: eligible(REPORTS_KPI_TYPES as readonly HomeWidgetType[]),
    },
    {
      title: tReports("widgetPicker.groupAnalytics"),
      items: eligible(REPORTS_ANALYTICS_TYPES as readonly HomeWidgetType[]),
    },
  ];
}

export type { WidgetGridPosition };
