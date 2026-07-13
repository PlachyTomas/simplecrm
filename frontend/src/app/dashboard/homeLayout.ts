/**
 * Pure helpers for mutating the home dashboard draft config — adding and
 * removing widgets keep the desktop layout and `mobileOrder` in sync.
 * Kept component-free so the add/remove/reorder rules are unit-testable.
 */

import { nextRowY } from "@/app/reports/dashboard/reportsWidgetCatalog";
import { makeWidgetId } from "@/components/widget-dashboard/widgetId";

import { defaultHomeWidgetSize } from "@/app/dashboard/homeWidgetCatalog";
import type {
  HomeDashboardConfig,
  HomeWidgetEntry,
  HomeWidgetType,
} from "@/app/dashboard/useHomeDashboard";

/** Widget ids sorted by desktop position `(y, x)` — the mobile fallback order. */
export function desktopOrderIds(widgets: readonly HomeWidgetEntry[]): string[] {
  return [...widgets]
    .sort((a, b) =>
      a.position.y !== b.position.y ? a.position.y - b.position.y : a.position.x - b.position.x,
    )
    .map((w) => w.id);
}

/**
 * The effective mobile order: the persisted `mobileOrder` when present,
 * otherwise derived from desktop `(y, x)`. Ids missing from the persisted
 * order (added before this fix, or server defaults) append in desktop order.
 */
export function effectiveMobileOrder(config: HomeDashboardConfig): string[] {
  const widgets = config.widgets ?? [];
  const desktop = desktopOrderIds(widgets);
  const persisted = config.mobileOrder ?? [];
  if (persisted.length === 0) return desktop;
  const known = new Set(widgets.map((w) => w.id));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of persisted) {
    if (known.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  for (const id of desktop) {
    if (!seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  return result;
}

/**
 * Append a new widget of `type` below the current layout (desktop) and at
 * the end of the mobile order. The mobile order is materialized on first
 * write so appending doesn't accidentally jump the new widget to the front
 * when `mobileOrder` was still empty (derived).
 */
export function addWidget(config: HomeDashboardConfig, type: HomeWidgetType): HomeDashboardConfig {
  const widgets = config.widgets ?? [];
  const { w, h } = defaultHomeWidgetSize(type);
  const entry: HomeWidgetEntry = {
    id: makeWidgetId(),
    position: { x: 0, y: nextRowY(widgets.map((it) => it.position)), w, h },
    config: { type } as HomeWidgetEntry["config"],
  };
  return {
    ...config,
    widgets: [...widgets, entry],
    mobileOrder: [...effectiveMobileOrder(config), entry.id],
  };
}

/** Drop a widget from both the desktop layout and the mobile order. */
export function removeWidget(config: HomeDashboardConfig, id: string): HomeDashboardConfig {
  return {
    ...config,
    widgets: (config.widgets ?? []).filter((w) => w.id !== id),
    mobileOrder: (config.mobileOrder ?? []).filter((x) => x !== id),
  };
}

/** Write a per-widget date preset into the entry's config. */
export function setWidgetDatePreset(
  config: HomeDashboardConfig,
  id: string,
  preset: NonNullable<HomeWidgetEntry["config"]["date_preset"]>,
): HomeDashboardConfig {
  return {
    ...config,
    widgets: (config.widgets ?? []).map((w) =>
      w.id === id ? { ...w, config: { ...w.config, date_preset: preset } } : w,
    ),
  };
}
