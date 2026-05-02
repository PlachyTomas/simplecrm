/**
 * Currency formatting helpers — the single home for `Intl.NumberFormat`
 * for currency in this codebase. `PriceDisplay` reuses these for its
 * card-style rendering; other surfaces (the trial-expired pay gate,
 * super-admin dialogs, in-app billing settings) use `formatCzkMinor`
 * for inline currency text. Acceptance criterion §8.6 hinges on this
 * being the only place currency Intl is instantiated.
 */

const CZK = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

const CZK_WITH_FRACTION = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 2,
});

/** Format a CZK whole-koruna value (no fractional haléře). */
export function formatCzk(czk: number): string {
  return CZK.format(czk);
}

/** Format a CZK amount given in minor units (haléře) as "1 512 Kč". */
export function formatCzkMinor(minor: number): string {
  return CZK.format(minor / 100);
}

/** Format a CZK amount given in minor units, including fractional haléře — used for "(s DPH)" lines. */
export function formatCzkMinorWithFraction(minor: number): string {
  return CZK_WITH_FRACTION.format(minor / 100);
}
