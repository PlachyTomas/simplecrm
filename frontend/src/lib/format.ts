/**
 * Single home for `Intl`-based number/date formatting used across the
 * app. Pure functions only — no translated strings live here (that's
 * i18next's job). Every call site supplies its own `locale`, sourced
 * from `useLocale()` in components or threaded through from the
 * calling component in plain helpers.
 */

export function formatMoney(
  value: number | string | null | undefined,
  currency: string,
  locale: string,
): string {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numeric)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, {
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
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: opts?.fraction ? 2 : 0,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toLocaleString(locale)} ${currency}`;
  }
}

export function formatNumber(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(locale);
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value === null || value === undefined) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return String(value);
  }
}
