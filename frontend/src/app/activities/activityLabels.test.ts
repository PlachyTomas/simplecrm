import { describe, expect, it } from "vitest";

import { ACTIVITY_LABEL, activityDetail, activityLabel } from "@/app/activities/activityLabels";

// Mirror of the backend ActivityType enum. `ACTIVITY_LABEL` is typed
// `Record<ActivityType, string>`, so a missing entry already fails the build;
// this list guards against a value silently rendering as its raw enum string.
const ALL_ACTIVITY_TYPES = [
  "note",
  "stage_change",
  "owner_change",
  "deal_won",
  "deal_lost",
  "company_freed",
  "ownership_reassigned",
  "subscription_change",
  "email_sent",
  "deal_created",
  "deal_updated",
  "company_updated",
  "event_created",
] as const;

describe("activityLabels", () => {
  it("maps every ActivityType to a non-raw label", () => {
    for (const t of ALL_ACTIVITY_TYPES) {
      expect(ACTIVITY_LABEL[t]).toBeTruthy();
      expect(activityLabel(t)).not.toBe(t);
    }
  });

  it("derives a readable detail from the payload", () => {
    expect(activityDetail({ activity_type: "deal_created", payload: { name: "Velký obchod" } })).toBe(
      "Velký obchod",
    );
    expect(
      activityDetail({ activity_type: "deal_updated", payload: { changed: ["name", "value"] } }),
    ).toBe("název, hodnota");
    expect(activityDetail({ activity_type: "event_created", payload: { title: "Schůzka" } })).toBe(
      "Schůzka",
    );
    expect(activityDetail({ activity_type: "email_sent", payload: { subject: "Nabídka" } })).toBe(
      "Nabídka",
    );
  });

  it("returns null when there is no extra detail", () => {
    expect(activityDetail({ activity_type: "stage_change", payload: {} })).toBeNull();
    expect(activityDetail({ activity_type: "deal_updated", payload: { changed: [] } })).toBeNull();
  });
});
