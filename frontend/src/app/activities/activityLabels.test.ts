import { describe, expect, it } from "vitest";

import {
  ACTIVITY_LABEL_KEY,
  activityDetail,
  changeFieldLabelKey,
  fieldLabelKey,
} from "@/app/activities/activityLabels";

// Mirror of the backend ActivityType enum. `ACTIVITY_LABEL_KEY` is typed
// `Record<ActivityType, ParseKeys<"common">>`, so a missing entry already
// fails the build; this list guards against a value silently rendering as
// its raw enum string.
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
  it("maps every ActivityType to a catalog key", () => {
    for (const type of ALL_ACTIVITY_TYPES) {
      expect(ACTIVITY_LABEL_KEY[type]).toBeTruthy();
      expect(ACTIVITY_LABEL_KEY[type]).toMatch(/^activities\.types\./);
    }
  });

  it("derives a readable detail from the payload", () => {
    expect(activityDetail({ activity_type: "deal_created", payload: { name: "Big deal" } })).toEqual(
      { kind: "text", value: "Big deal" },
    );
    expect(
      activityDetail({ activity_type: "deal_updated", payload: { changed: ["name", "value"] } }),
    ).toEqual({ kind: "fieldsChanged", fields: ["name", "value"] });
    expect(
      activityDetail({ activity_type: "event_created", payload: { title: "Meeting" } }),
    ).toEqual({ kind: "text", value: "Meeting" });
    expect(
      activityDetail({ activity_type: "email_sent", payload: { subject: "Offer" } }),
    ).toEqual({ kind: "text", value: "Offer" });
  });

  it("renders a stage change from resolved stage names, never UUIDs", () => {
    expect(
      activityDetail({
        activity_type: "stage_change",
        payload: { from_stage_name: "New", to_stage_name: "Proposal" },
      }),
    ).toEqual({ kind: "stageChangeFromTo", from: "New", to: "Proposal" });
    // Legacy payload with only UUIDs must not leak them into the detail.
    expect(
      activityDetail({
        activity_type: "stage_change",
        payload: { from_stage_id: "a1b2", to_stage_id: "c3d4" },
      }),
    ).toBeNull();
  });

  it("returns null when there is no extra detail", () => {
    expect(activityDetail({ activity_type: "stage_change", payload: {} })).toBeNull();
    expect(activityDetail({ activity_type: "deal_updated", payload: { changed: [] } })).toBeNull();
  });

  it("maps changed field names to a catalog key, falling back to null for unknown fields", () => {
    expect(changeFieldLabelKey("name")).toBe("activities.changeFields.name");
    expect(changeFieldLabelKey("expected_close_date")).toBe(
      "activities.changeFields.expected_close_date",
    );
    expect(changeFieldLabelKey("ico")).toBe("activities.changeFields.ico");
    expect(changeFieldLabelKey("unknown_field")).toBeNull();
  });

  it("maps legacy list field names to a catalog key, falling back to null for unknown fields", () => {
    expect(fieldLabelKey("name")).toBe("activities.fields.name");
    expect(fieldLabelKey("unknown_field")).toBeNull();
  });
});
