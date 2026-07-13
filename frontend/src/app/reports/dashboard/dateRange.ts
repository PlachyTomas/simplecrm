/**
 * Date-range presets for the global filter bar — catalog keys
 * (`presets.*` in the `reports` namespace) paired with the resolved
 * (from, to) ISO date pair the widget endpoints expect. The `custom`
 * preset opens a date picker (built later).
 */

import type { ParseKeys } from "i18next";

import type { DateRangeFilter } from "@/app/reports/dashboard/types";

export type RangePreset = NonNullable<DateRangeFilter["preset"]>;

export const PRESET_LABEL_KEY: Record<RangePreset, ParseKeys<"reports">> = {
  last_7_days: "presets.last_7_days",
  last_30_days: "presets.last_30_days",
  this_quarter: "presets.this_quarter",
  this_year: "presets.this_year",
  last_12_months: "presets.last_12_months",
  custom: "presets.custom",
};

export const VISIBLE_PRESETS: RangePreset[] = [
  "last_7_days",
  "last_30_days",
  "this_quarter",
  "this_year",
  "last_12_months",
  "custom",
];

function isoDate(d: Date): string {
  // We can't go through `toISOString()` here — it converts to UTC, and
  // a Prague-midnight Date renders as the previous day's date string
  // any time after the local timezone's UTC offset is positive (CET/CEST
  // year-round). Backend `from` / `to` are calendar dates in the user's
  // locale, so format from local components instead.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolve a preset to absolute (from, to) ISO dates. `custom` returns
 * the explicit window stored on the filter object — caller must
 * supply both endpoints.
 */
export function resolvePreset(filter: DateRangeFilter): {
  from: string;
  to: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (filter.preset === "custom" && filter.from && filter.to) {
    return { from: filter.from, to: filter.to };
  }

  const dayMs = 24 * 60 * 60 * 1000;
  switch (filter.preset) {
    case "last_7_days": {
      const from = new Date(today.getTime() - 6 * dayMs);
      return { from: isoDate(from), to: isoDate(today) };
    }
    case "this_quarter": {
      const month = today.getMonth();
      const qStartMonth = month - (month % 3);
      const from = new Date(today.getFullYear(), qStartMonth, 1);
      return { from: isoDate(from), to: isoDate(today) };
    }
    case "this_year": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from: isoDate(from), to: isoDate(today) };
    }
    case "last_12_months": {
      const from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1);
      return { from: isoDate(from), to: isoDate(today) };
    }
    case "last_30_days":
    default: {
      const from = new Date(today.getTime() - 29 * dayMs);
      return { from: isoDate(from), to: isoDate(today) };
    }
  }
}
