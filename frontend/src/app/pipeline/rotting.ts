/**
 * Is this deal "rotting"? Shared by both pipeline card variants and their
 * tests, kept out of the component file so the badge module exports nothing
 * but a component.
 *
 * `days` is the board payload's `days_since_last_move` — null for closed
 * deals, which by construction can never rot. `threshold` is the org's
 * `deal_rotting_days`; 0 switches the indicator off entirely.
 */
export function isRotting(days: number | null | undefined, threshold: number): boolean {
  if (!threshold || threshold <= 0) return false;
  return typeof days === "number" && days >= threshold;
}

/** Past 2× the threshold the badge escalates from warning to danger. */
export function isCriticallyRotting(days: number, threshold: number): boolean {
  return days >= threshold * 2;
}
