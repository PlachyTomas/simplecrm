import { describe, expect, it } from "vitest";

import { stageColor } from "@/app/pipeline/colors";

describe("stageColor", () => {
  it("returns the admin-configured color when one is set, even at low indices", () => {
    expect(stageColor(0, "#3D5AFE")).toBe("#3D5AFE");
    expect(stageColor(1, "#5470FF")).toBe("#5470FF");
  });

  it("falls back to the position palette when the configured color is null/empty/whitespace", () => {
    expect(stageColor(0, null)).toBe("#A1A1AA");
    expect(stageColor(0, "")).toBe("#A1A1AA");
    expect(stageColor(0, "   ")).toBe("#A1A1AA");
    expect(stageColor(1)).toBe("#0EA5E9");
  });

  it("falls back to zinc-500 for indices beyond the palette when no color is configured", () => {
    expect(stageColor(99, null)).toBe("#71717A");
  });
});
