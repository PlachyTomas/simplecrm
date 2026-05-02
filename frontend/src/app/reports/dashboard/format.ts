/**
 * Number-formatting helpers shared by every Reports widget. Czech
 * locale + the org's currency by default; pass an override only when
 * the widget shows mixed-currency data (none currently do — backend
 * filters to the org's currency).
 */

export function formatMoney(
  value: number | string | null | undefined,
  currency: string,
  locale = "cs-CZ",
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

export function formatPercent(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)} %`;
}

export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(Math.round(value * 10) / 10).toFixed(1)} dní`;
}

export function formatNumber(
  value: number | null | undefined,
  locale = "cs-CZ",
): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(locale);
}
