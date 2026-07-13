import { describe, expect, it } from "vitest";

import {
  addWidget,
  desktopOrderIds,
  effectiveMobileOrder,
  removeWidget,
  setWidgetDatePreset,
} from "@/app/dashboard/homeLayout";
import type { HomeDashboardConfig, HomeWidgetEntry } from "@/app/dashboard/useHomeDashboard";

function entry(id: string, x: number, y: number, type = "kpi_open_deals"): HomeWidgetEntry {
  return {
    id,
    position: { x, y, w: 3, h: 2 },
    config: { type } as HomeWidgetEntry["config"],
  };
}

function config(widgets: HomeWidgetEntry[], mobileOrder: string[] = []): HomeDashboardConfig {
  return { version: 1, widgets, mobileOrder };
}

describe("desktopOrderIds", () => {
  it("orders by (y, x)", () => {
    const c = [entry("b", 3, 0), entry("c", 0, 2), entry("a", 0, 0)];
    expect(desktopOrderIds(c)).toEqual(["a", "b", "c"]);
  });
});

describe("effectiveMobileOrder", () => {
  it("falls back to desktop (y, x) order when mobileOrder is empty", () => {
    const c = config([entry("b", 3, 0), entry("a", 0, 0)]);
    expect(effectiveMobileOrder(c)).toEqual(["a", "b"]);
  });

  it("keeps the persisted order and appends unknown ids in desktop order", () => {
    const c = config([entry("a", 0, 0), entry("b", 3, 0), entry("c", 0, 2)], ["c", "a"]);
    expect(effectiveMobileOrder(c)).toEqual(["c", "a", "b"]);
  });

  it("drops stale ids that no longer exist", () => {
    const c = config([entry("a", 0, 0)], ["ghost", "a"]);
    expect(effectiveMobileOrder(c)).toEqual(["a"]);
  });
});

describe("addWidget", () => {
  it("appends below the layout and at the end of the mobile order", () => {
    const c = config([entry("a", 0, 0), entry("b", 3, 0)], ["b", "a"]);
    const next = addWidget(c, "velocity");
    expect(next.widgets).toHaveLength(3);
    const added = next.widgets![2]!;
    expect(added.config.type).toBe("velocity");
    // Below the tallest widget (y=0, h=2 → next row y=2), left-aligned.
    expect(added.position).toMatchObject({ x: 0, y: 2, w: 6, h: 4 });
    expect(next.mobileOrder).toEqual(["b", "a", added.id]);
  });

  it("materializes the mobile order from desktop when it was empty", () => {
    const c = config([entry("b", 3, 0), entry("a", 0, 0)]);
    const next = addWidget(c, "action_new_deal");
    const added = next.widgets![2]!;
    // Desktop order first, new widget last — never first.
    expect(next.mobileOrder).toEqual(["a", "b", added.id]);
    expect(added.position).toMatchObject({ w: 3, h: 1 });
  });

  it("uses per-type default sizes", () => {
    const base = config([]);
    expect(addWidget(base, "kpi_won_month").widgets![0]!.position).toMatchObject({ w: 3, h: 2 });
    expect(addWidget(base, "invite_teammates").widgets![0]!.position).toMatchObject({ w: 12, h: 3 });
    expect(addWidget(base, "sales_leaderboard").widgets![0]!.position).toMatchObject({ w: 6, h: 4 });
    expect(addWidget(base, "pipeline_value").widgets![0]!.position).toMatchObject({ w: 3, h: 2 });
  });
});

describe("removeWidget", () => {
  it("drops the widget from both the layout and the mobile order", () => {
    const c = config([entry("a", 0, 0), entry("b", 3, 0)], ["b", "a"]);
    const next = removeWidget(c, "b");
    expect(next.widgets!.map((w) => w.id)).toEqual(["a"]);
    expect(next.mobileOrder).toEqual(["a"]);
  });
});

describe("setWidgetDatePreset", () => {
  it("writes the preset into the target entry only", () => {
    const c = config([entry("a", 0, 0, "velocity"), entry("b", 6, 0, "stale_deals")]);
    const next = setWidgetDatePreset(c, "a", "this_quarter");
    expect(next.widgets![0]!.config.date_preset).toBe("this_quarter");
    expect(next.widgets![1]!.config.date_preset).toBeUndefined();
  });
});
