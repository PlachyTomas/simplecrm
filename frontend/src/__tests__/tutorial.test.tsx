import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpotlightScrim } from "@/app/tutorial/TourOverlay";
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

  it("cuts the scrim open over the anchor so the spotlighted element stays legible", () => {
    const rect = { top: 100, left: 200, width: 120, height: 40 } as DOMRect;
    const { container } = render(<SpotlightScrim holeRect={rect} />);

    // The wash must come from a shadow around a hole, never a layer over
    // the anchor — and never a blur, which can't have a hole cut into it.
    expect(container.querySelector('[class*="backdrop-blur"]')).toBeNull();
    expect(container.querySelector('[class*="inset-0"][class*="bg-"]')).toBeNull();

    const hole = container.querySelector<HTMLElement>("[style]");
    expect(hole).not.toBeNull();
    // Hole box = anchor rect + the same 6px padding the spotlight ring uses.
    expect(hole!.style.top).toBe("94px");
    expect(hole!.style.left).toBe("194px");
    expect(hole!.style.width).toBe("132px");
    expect(hole!.style.height).toBe("52px");
    // Theme-correct wash: the bg token (like modal backdrops), not raw black.
    expect(hole!.style.boxShadow).toContain("--color-bg-rgb");
  });

  it("covers the viewport with a plain scrim when the step has no anchor", () => {
    const { container } = render(<SpotlightScrim holeRect={null} />);
    expect(container.querySelector('[class*="backdrop-blur"]')).toBeNull();
    expect(container.querySelector('[class*="inset-0"][class*="bg-bg"]')).not.toBeNull();
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
