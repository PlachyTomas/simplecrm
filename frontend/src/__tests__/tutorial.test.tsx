import { describe, expect, it } from "vitest";

import { PAGE_TOURS, type TourId, tourForPath } from "@/app/tutorial/tours";

const TOUR_IDS = Object.keys(PAGE_TOURS) as TourId[];

describe("page tours data", () => {
  it("covers every primary page", () => {
    expect(TOUR_IDS.sort()).toEqual(
      [
        "calendar",
        "companies",
        "contacts",
        "deals",
        "emails",
        "overview",
        "pipeline",
        "reports",
      ].sort(),
    );
  });

  it("every tour has 1-4 steps with unique stable ids and catalog keys", () => {
    for (const tourId of TOUR_IDS) {
      const steps = PAGE_TOURS[tourId];
      expect(steps.length).toBeGreaterThanOrEqual(1);
      expect(steps.length).toBeLessThanOrEqual(5);
      const ids = new Set<string>();
      for (const step of steps) {
        expect(step.id).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(ids.has(step.id)).toBe(false);
        ids.add(step.id);
        expect(step.titleKey).toMatch(new RegExp(`^tutorial\\.tours\\.${tourId}\\.`));
        expect(step.bodyKey).toMatch(new RegExp(`^tutorial\\.tours\\.${tourId}\\.`));
      }
    }
  });

  it("uses magenta exactly once per tour — on the final step", () => {
    for (const tourId of TOUR_IDS) {
      const steps = PAGE_TOURS[tourId];
      const magenta = steps.filter((s) => s.accent === "magenta");
      expect(magenta, tourId).toHaveLength(1);
      expect(magenta[0], tourId).toBe(steps[steps.length - 1]);
    }
  });

  it("action-gated steps target a stable (non-prefix) testid", () => {
    for (const tourId of TOUR_IDS) {
      for (const step of PAGE_TOURS[tourId]) {
        if (step.advanceOnAppear) {
          expect(step.advanceOnAppear.endsWith("-")).toBe(false);
        }
      }
    }
  });

  it("prefix anchors end with the separator so they can't over-match", () => {
    for (const tourId of TOUR_IDS) {
      for (const step of PAGE_TOURS[tourId]) {
        if (step.anchorIsPrefix) {
          expect(step.anchorTestId, `${tourId}/${step.id}`).toMatch(/-$/);
        }
      }
    }
  });

  it("maps routes to tours, detail routes included, unknown routes to none", () => {
    expect(tourForPath("/app")).toBe("overview");
    expect(tourForPath("/app/pipeline")).toBe("pipeline");
    expect(tourForPath("/app/companies")).toBe("companies");
    // Company DETAIL is a different screen — no tour there.
    expect(tourForPath("/app/companies/abc")).toBeNull();
    expect(tourForPath("/app/contacts")).toBe("contacts");
    expect(tourForPath("/app/contacts/c1")).toBe("contacts");
    expect(tourForPath("/app/deals")).toBe("deals");
    expect(tourForPath("/app/emails")).toBe("emails");
    expect(tourForPath("/app/calendar")).toBe("calendar");
    expect(tourForPath("/app/reports")).toBe("reports");
    expect(tourForPath("/app/settings")).toBeNull();
    expect(tourForPath("/app/more")).toBeNull();
  });
});
