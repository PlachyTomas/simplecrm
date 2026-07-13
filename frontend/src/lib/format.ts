/**
 * Single home for `Intl`-based number/date formatting used across the
 * app. Pure functions only — no translated strings live here (that's
 * i18next's job). Every call site supplies its own `locale`, sourced
 * from `useLocale()` in components or threaded through from the
 * calling component in plain helpers.
 *
 * Formatter instances are cached per (locale, options): constructing
 * `Intl.*Format` is expensive relative to `format()`, and tables call
 * these once per cell.
 */

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const relativeTimeFormats = new Map<string, Intl.RelativeTimeFormat>();

function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let fmt = numberFormats.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, fmt);
  }
  return fmt;
}

function dateTimeFormat(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let fmt = dateTimeFormats.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options);
    dateTimeFormats.set(key, fmt);
  }
  return fmt;
}

function relativeTimeFormat(locale: string): Intl.RelativeTimeFormat {
  let fmt = relativeTimeFormats.get(locale);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    relativeTimeFormats.set(locale, fmt);
  }
  return fmt;
}

export function formatMoney(
  value: number | string | null | undefined,
  currency: string,
  locale: string,
): string {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numeric)) return `${value} ${currency}`;
  try {
    return numberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${numeric.toLocaleString(locale)} ${currency}`;
  }
}

export function formatMoneyMinor(
  minor: number | null | undefined,
  currency: string,
  locale: string,
  opts?: { fraction?: boolean },
): string {
  if (minor === null || minor === undefined) return "—";
  try {
    return numberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: opts?.fraction ? 2 : 0,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toLocaleString(locale)} ${currency}`;
  }
}

export function formatNumber(
  value: number | null | undefined,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  if (value === null || value === undefined) return "—";
  return numberFormat(locale, options).format(value);
}

/** `45.3` → `"45,3 %"` (cs) / `"45.3%"` (en-GB). Input is 0–100, not 0–1. */
export function formatPercent(
  value: number | null | undefined,
  locale: string,
  digits = 0,
): string {
  if (value === null || value === undefined) return "—";
  return numberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value === null || value === undefined) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  try {
    return dateTimeFormat(locale, options).format(date);
  } catch {
    return String(value);
  }
}

/** "za 3 dny" / "3 days ago"; sub-day distances switch to hours. */
export function formatRelativeDays(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (Math.abs(days) >= 1) return relativeTimeFormat(locale).format(days, "day");
  const hours = Math.round(ms / (3600 * 1000));
  return relativeTimeFormat(locale).format(hours, "hour");
}
