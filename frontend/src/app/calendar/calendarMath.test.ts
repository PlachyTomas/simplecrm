import { describe, expect, it } from "vitest";

import { dayKey, gridRange, monthGrid, shiftMonth, shiftWeek, weekGrid } from "./calendarMath";

describe("monthGrid", () => {
  it("trims to exactly 4 weeks when a 28-day month starts on Monday", () => {
    // February 2027 starts on a Monday and has 28 days — a clean 4×7 grid,
    // no padding days at all.
    const days = monthGrid(2027, 1);
    expect(days).toHaveLength(28);
    expect(days[0]!.date.getDay()).toBe(1); // Monday
    expect(days[0]!.key).toBe("2027-02-01");
    expect(days.filter((d) => d.inMonth)).toHaveLength(28);
    expect(days.every((d) => d.inMonth)).toBe(true);
  });

  it("keeps all 6 weeks when the month needs them", () => {
    // August 2026 starts on a Saturday (offset 5) with 31 days → 6 weeks.
    const days = monthGrid(2026, 7);
    expect(days).toHaveLength(42);
    expect(days[0]!.date.getDay()).toBe(1); // Monday
    expect(days[0]!.key).toBe("2026-07-27"); // padding from July
    expect(days.filter((d) => d.inMonth)).toHaveLength(31);
  });

  it("yields 5 weeks for a typical month and Monday-first padding", () => {
    // February 2026 starts on a Sunday (offset 6) with 28 days → 5 weeks.
    const days = monthGrid(2026, 1);
    expect(days).toHaveLength(35);
    expect(days[0]!.date.getDay()).toBe(1); // Monday
    expect(days[0]!.key).toBe("2026-01-26"); // padding from January
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

describe("weekGrid", () => {
  it("returns the 7 Monday-first days containing the anchor, all in-view", () => {
    const days = weekGrid(new Date(2026, 5, 10)); // Wed 2026-06-10
    expect(days).toHaveLength(7);
    expect(days[0]!.date.getDay()).toBe(1); // Monday
    expect(days[0]!.key).toBe("2026-06-08");
    expect(days[6]!.key).toBe("2026-06-14");
    expect(days.every((d) => d.inMonth)).toBe(true);
  });

  it("spans a month boundary within one week", () => {
    const days = weekGrid(new Date(2026, 6, 30)); // Thu 2026-07-30
    expect(days.map((d) => d.key)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
    expect(days.every((d) => d.inMonth)).toBe(true);
  });

  it("spans a year boundary within one week", () => {
    const days = weekGrid(new Date(2026, 11, 31)); // Thu 2026-12-31
    expect(days.map((d) => d.key)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("marks today only for the matching date", () => {
    const today = new Date(2026, 5, 10);
    const days = weekGrid(today, today);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
    expect(days.find((d) => d.isToday)!.key).toBe("2026-06-10");
  });
});

describe("gridRange", () => {
  it("covers a month grid as a half-open interval", () => {
    const days = monthGrid(2026, 5);
    const { from, to } = gridRange(days);
    expect(new Date(from).getTime()).toBe(days[0]!.date.getTime());
    const afterLast = new Date(days[days.length - 1]!.date);
    afterLast.setDate(afterLast.getDate() + 1);
    expect(new Date(to).getTime()).toBe(afterLast.getTime());
  });

  it("covers a week grid as a half-open interval", () => {
    const days = weekGrid(new Date(2026, 11, 31));
    const { from, to } = gridRange(days);
    expect(new Date(from).getTime()).toBe(days[0]!.date.getTime()); // 2026-12-28
    const afterLast = new Date(days[6]!.date);
    afterLast.setDate(afterLast.getDate() + 1);
    expect(new Date(to).getTime()).toBe(afterLast.getTime()); // 2027-01-04
  });
});

describe("shiftMonth", () => {
  it("wraps across year boundaries", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual([2027, 0]);
    expect(shiftMonth(2026, 0, -1)).toEqual([2025, 11]);
    expect(shiftMonth(2026, 5, 0)).toEqual([2026, 5]);
  });
});

describe("shiftWeek", () => {
  it("moves by whole weeks across a year boundary", () => {
    const next = shiftWeek(new Date(2026, 11, 31), 1); // +7 days
    expect(dayKey(next)).toBe("2027-01-07");
    const prev = shiftWeek(new Date(2027, 0, 1), -1); // -7 days
    expect(dayKey(prev)).toBe("2026-12-25");
    expect(dayKey(shiftWeek(new Date(2026, 5, 10), 0))).toBe("2026-06-10");
  });
});

describe("dayKey", () => {
  it("buckets ISO strings in local time", () => {
    const d = new Date(2026, 5, 12, 23, 30);
    expect(dayKey(d)).toBe("2026-06-12");
    expect(dayKey(d.toISOString())).toBe("2026-06-12");
  });
});
