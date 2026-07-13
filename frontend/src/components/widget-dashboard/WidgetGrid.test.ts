import { describe, expect, it } from "vitest";

import { applyLayoutToWidgets, type WidgetGridItem } from "./WidgetGrid";

// jsdom has no ResizeObserver, so the grid itself can't render in vitest;
// the layout→widgets mapping is exercised as a pure function instead.

interface Entry extends WidgetGridItem {
  label: string;
}

const widgets: Entry[] = [
  { id: "a", label: "A", position: { x: 0, y: 0, w: 3, h: 2 } },
  { id: "b", label: "B", position: { x: 3, y: 0, w: 9, h: 4 } },
];

describe("applyLayoutToWidgets", () => {
  it("lg: takes x/y/w/h verbatim from the lg layout", () => {
    const next = applyLayoutToWidgets(
      widgets,
      [],
      { lg: [{ i: "a", x: 6, y: 4, w: 6, h: 3 }] },
      "lg",
    );
    expect(next[0]?.position).toEqual({ x: 6, y: 4, w: 6, h: 3 });
    // Extra widget fields survive the map.
    expect(next[0]?.label).toBe("A");
    // Items missing from the layout keep their stored position.
    expect(next[1]?.position).toEqual(widgets[1]?.position);
  });

  it("lg: falls back to `current` when all.lg is absent", () => {
    const next = applyLayoutToWidgets(widgets, [{ i: "a", x: 9, y: 2, w: 3, h: 2 }], {}, "lg");
    expect(next[0]?.position).toEqual({ x: 9, y: 2, w: 3, h: 2 });
  });

  it("md: persists row order (y) and height, preserves stored 12-col x/w", () => {
    const next = applyLayoutToWidgets(
      widgets,
      [],
      // 6-col clamped view: widget b is clamped to w=6, dragged above a.
      {
        md: [
          { i: "a", x: 0, y: 5, w: 3, h: 2 },
          { i: "b", x: 0, y: 0, w: 6, h: 5 },
        ],
      },
      "md",
    );
    expect(next[0]?.position).toEqual({ x: 0, y: 5, w: 3, h: 2 });
    // b: y/h from md, but the clamped w=6 must NOT overwrite the stored w=9.
    expect(next[1]?.position).toEqual({ x: 3, y: 0, w: 9, h: 5 });
  });

  it("does not mutate the input widgets", () => {
    applyLayoutToWidgets(widgets, [], { lg: [{ i: "a", x: 6, y: 4, w: 6, h: 3 }] }, "lg");
    expect(widgets[0]?.position).toEqual({ x: 0, y: 0, w: 3, h: 2 });
  });
});
