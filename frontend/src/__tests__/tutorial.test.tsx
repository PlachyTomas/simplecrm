import { describe, expect, it } from "vitest";

import { TUTORIAL_STEPS } from "@/app/tutorial/tutorialSteps";

describe("tutorialSteps data", () => {
  it("has at least 5 steps", () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(5);
  });

  it("starts with an unanchored welcome step", () => {
    const first = TUTORIAL_STEPS[0]!;
    expect(first.anchorTestId).toBeNull();
    expect(first.title.toLowerCase()).toContain("vítejte");
  });

  it("uses magenta exactly once — on the final step", () => {
    const magentaSteps = TUTORIAL_STEPS.filter((s) => s.accent === "magenta");
    expect(magentaSteps).toHaveLength(1);
    expect(magentaSteps[0]).toBe(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]);
  });

  it("each step has Czech copy and a stable id", () => {
    const ids = new Set<string>();
    for (const step of TUTORIAL_STEPS) {
      expect(step.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(ids.has(step.id)).toBe(false);
      ids.add(step.id);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(20);
    }
  });

  it("non-welcome steps anchor to a sidebar nav testid", () => {
    for (const step of TUTORIAL_STEPS.slice(1)) {
      expect(step.anchorTestId).not.toBeNull();
      expect(step.anchorTestId).toMatch(/^nav-/);
    }
  });
});
