import { describe, expect, it } from "vitest";

import { formatDate, formatMoney, formatMoneyMinor, formatNumber } from "@/lib/format";

describe("formatMoney", () => {
  it("formats CZK with 0 fraction digits, NBSP-separated thousands", () => {
    expect(formatMoney(1500, "CZK", "cs-CZ")).toBe("1 500 Kč");
  });

  it("returns an em-dash for nullish values", () => {
    expect(formatMoney(null, "CZK", "cs-CZ")).toBe("—");
    expect(formatMoney(undefined, "CZK", "cs-CZ")).toBe("—");
  });

  it("formats EUR under en-GB", () => {
    expect(formatMoney(1500, "EUR", "en-GB")).toBe("€1,500");
  });

  it("accepts a numeric string", () => {
    expect(formatMoney("1500", "CZK", "cs-CZ")).toBe("1 500 Kč");
  });
});

describe("formatMoneyMinor", () => {
  it("divides minor units by 100 and formats with 0 fraction digits", () => {
    expect(formatMoneyMinor(151200, "CZK", "cs-CZ")).toBe("1 512 Kč");
  });

  it("returns an em-dash for nullish values", () => {
    expect(formatMoneyMinor(null, "CZK", "cs-CZ")).toBe("—");
    expect(formatMoneyMinor(undefined, "CZK", "cs-CZ")).toBe("—");
  });

  it("keeps fractional digits when opts.fraction is set", () => {
    expect(formatMoneyMinor(151234, "CZK", "cs-CZ", { fraction: true })).toBe("1 512,34 Kč");
  });
});

describe("formatNumber", () => {
  it("formats with locale thousands separator", () => {
    expect(formatNumber(12345, "cs-CZ")).toBe("12 345");
  });

  it("returns an em-dash for nullish values", () => {
    expect(formatNumber(null, "cs-CZ")).toBe("—");
    expect(formatNumber(undefined, "cs-CZ")).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string under cs-CZ", () => {
    expect(formatDate("2026-07-12", "cs-CZ")).toBe("12. 7. 2026");
  });

  it("returns an em-dash for nullish values", () => {
    expect(formatDate(null, "cs-CZ")).toBe("—");
    expect(formatDate(undefined, "cs-CZ")).toBe("—");
  });

  it("accepts a Date instance and DateTimeFormatOptions", () => {
    expect(formatDate(new Date(2026, 0, 15), "cs-CZ", { dateStyle: "long" })).toBe("15. ledna 2026");
  });
});
