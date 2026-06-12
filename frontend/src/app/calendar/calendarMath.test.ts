import { describe, expect, it } from "vitest";

import { dayKey, gridRange, monthGrid, shiftMonth } from "./calendarMath";

describe("monthGrid", () => {
  it("always yields 42 Monday-first cells", () => {
    // February 2026 starts on a Sunday — the worst-case 6-day offset.
    const days = monthGrid(2026, 1);
    expect(days).toHaveLength(42);
    expect(days[0]!.date.getDay()).toBe(1); // Monday
    expect(days[0]!.key).toBe("2026-01-26");
    expect(days.filter((d) => d.inMonth)).toHaveLength(28);
  });

  it("starts on the 1st when the month begins on Monday", () => {
    // June 2026 starts on a Monday — zero offset.
    const days = monthGrid(2026, 5);
    expect(days[0]!.key).toBe("2026-06-01");
    expect(days.filter((d) => d.inMonth)).toHaveLength(30);
  });

  it("marks today only for the matching date", () => {
    const today = new Date(2026, 5, 12);
    const days = monthGrid(2026, 5, today);
    const todays = days.filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]!.key).toBe("2026-06-12");
    expect(monthGrid(2026, 6, today).filter((d) => d.isToday)).toHaveLength(0);
  });
});

describe("gridRange", () => {
  it("covers the whole grid as a half-open interval", () => {
    const days = monthGrid(2026, 5);
    const { from, to } = gridRange(days);
    expect(new Date(from).getTime()).toBe(days[0]!.date.getTime());
    const afterLast = new Date(days[41]!.date);
    afterLast.setDate(afterLast.getDate() + 1);
    expect(new Date(to).getTime()).toBe(afterLast.getTime());
  });
});

describe("shiftMonth", () => {
  it("wraps across year boundaries", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual([2027, 0]);
    expect(shiftMonth(2026, 0, -1)).toEqual([2025, 11]);
    expect(shiftMonth(2026, 5, 0)).toEqual([2026, 5]);
  });
});

describe("dayKey", () => {
  it("buckets ISO strings in local time", () => {
    const d = new Date(2026, 5, 12, 23, 30);
    expect(dayKey(d)).toBe("2026-06-12");
    expect(dayKey(d.toISOString())).toBe("2026-06-12");
  });
});
