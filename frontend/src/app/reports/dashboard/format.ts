/**
 * Number-formatting helpers shared by every Reports widget.
 * `formatMoney`/`formatNumber` delegate to the shared `@/lib/format`
 * (single home for Intl formatting); `formatPercent`/`formatDays`
 * stay here — Task 15 handles their i18n.
 */

export { formatMoney, formatNumber } from "@/lib/format";

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)} %`;
}

export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(Math.round(value * 10) / 10).toFixed(1)} dní`;
}
