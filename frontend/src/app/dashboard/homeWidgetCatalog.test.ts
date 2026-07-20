import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import type { CurrentUser } from "@/auth/useCurrentUser";

import {
  buildHomePickerGroups,
  defaultHomeWidgetSize,
  isHomeWidgetEligible,
} from "@/app/dashboard/homeWidgetCatalog";
import type { HomeWidgetType } from "@/app/dashboard/useHomeDashboard";

const t = ((key: string) => key) as unknown as TFunction<"dashboard">;
const tReports = ((key: string) => key) as unknown as TFunction<"reports">;

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "u1",
    email: "u@ex.cz",
    name: "U",
    role: "salesperson",
    can_invite: false,
    language: "cs",
    is_super_admin: false,
    email_verified: true,
    organization: {
      show_leaderboard_to_salespeople: false,
    } as CurrentUser["organization"],
    ...overrides,
  } as CurrentUser;
}

function pickerTypes(u: CurrentUser, present: HomeWidgetType[] = []): string[] {
  return buildHomePickerGroups({ user: u, presentTypes: new Set(present), t, tReports })
    .flatMap((g) => g.items)
    .map((i) => i.type);
}

describe("isHomeWidgetEligible", () => {
  it("hides invite_teammates from plain salespeople and shows it to admins / can_invite", () => {
    expect(isHomeWidgetEligible("invite_teammates", user())).toBe(false);
    expect(isHomeWidgetEligible("invite_teammates", user({ role: "admin" }))).toBe(true);
    expect(isHomeWidgetEligible("invite_teammates", user({ can_invite: true }))).toBe(true);
  });

  it("gates team-scoped widgets on role or the org leaderboard flag", () => {
    for (const type of ["velocity", "sales_leaderboard", "rep_activity"] as const) {
      expect(isHomeWidgetEligible(type, user())).toBe(false);
      expect(isHomeWidgetEligible(type, user({ role: "manager" }))).toBe(true);
      expect(isHomeWidgetEligible(type, user({ role: "admin" }))).toBe(true);
      expect(
        isHomeWidgetEligible(
          type,
          user({
            organization: {
              show_leaderboard_to_salespeople: true,
            } as CurrentUser["organization"],
          }),
        ),
      ).toBe(true);
    }
  });

  it("keeps KPI tiles, quick actions, and non-team analytics for everyone", () => {
    for (const type of [
      "kpi_open_deals",
      "action_new_deal",
      "pipeline_value",
      "stale_deals",
    ] as const) {
      expect(isHomeWidgetEligible(type, user())).toBe(true);
    }
  });
});

describe("buildHomePickerGroups", () => {
  it("hides ineligible widgets from the picker entirely", () => {
    const types = pickerTypes(user());
    expect(types).not.toContain("invite_teammates");
    expect(types).not.toContain("velocity");
    expect(types).not.toContain("sales_leaderboard");
    expect(types).not.toContain("rep_activity");
    // 8 home types + 15 reports − 2 gated reports types.
    expect(types).toHaveLength(21);
  });

  it("shows the full catalog to admins", () => {
    const types = pickerTypes(user({ role: "admin" }));
    expect(types).toContain("invite_teammates");
    expect(types).toContain("velocity");
    expect(types).toContain("sales_leaderboard");
    expect(types).toHaveLength(25);
  });

  it("marks home-native widgets unique and present types as added", () => {
    const groups = buildHomePickerGroups({
      user: user({ role: "admin" }),
      presentTypes: new Set<HomeWidgetType>(["kpi_open_deals", "stale_deals"]),
      t,
      tReports,
    });
    const items = groups.flatMap((g) => g.items);
    const kpi = items.find((i) => i.type === "kpi_open_deals")!;
    expect(kpi.unique).toBe(true);
    expect(kpi.added).toBe(true);
    const stale = items.find((i) => i.type === "stale_deals")!;
    expect(stale.unique).toBe(false);
    expect(stale.added).toBe(true);
    const velocity = items.find((i) => i.type === "velocity")!;
    expect(velocity.unique).toBe(true);
    expect(velocity.added).toBe(false);
  });

  it("groups: quick actions, overview, then the two reports groups", () => {
    const groups = buildHomePickerGroups({
      user: user({ role: "admin" }),
      presentTypes: new Set(),
      t,
      tReports,
    });
    expect(groups.map((g) => g.title)).toEqual([
      "widgetGroups.quickActions",
      "widgetGroups.overview",
      "widgetPicker.groupKpi",
      "widgetPicker.groupAnalytics",
    ]);
    expect(groups[0]!.items.map((i) => i.type)).toEqual([
      "action_new_deal",
      "action_new_company",
      "action_new_contact",
      "action_new_activity",
    ]);
  });
});

describe("defaultHomeWidgetSize", () => {
  it("sizes home types per spec and delegates reports types", () => {
    expect(defaultHomeWidgetSize("kpi_open_deals")).toEqual({ w: 3, h: 2 });
    expect(defaultHomeWidgetSize("action_new_activity")).toEqual({ w: 3, h: 1 });
    expect(defaultHomeWidgetSize("invite_teammates")).toEqual({ w: 12, h: 3 });
    expect(defaultHomeWidgetSize("velocity")).toEqual({ w: 6, h: 4 });
    expect(defaultHomeWidgetSize("win_rate")).toEqual({ w: 3, h: 2 });
    expect(defaultHomeWidgetSize("companies_at_risk")).toEqual({ w: 6, h: 4 });
  });
});
