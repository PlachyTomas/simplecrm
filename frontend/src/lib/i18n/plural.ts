/**
 * Czech ICU plural rules:
 *  - one    → exactly 1
 *  - few    → 2, 3, 4 (integer)
 *  - other  → 0, 5+, decimals — uses genitive plural
 *
 * The helper exists so callers can write
 *   csPlural(n, 'obchod', 'obchody', 'obchodů')
 * instead of inlining ternaries that always get one form wrong (most often
 * the `n === 0` case, which Czech treats as `other`, not as `few`).
 */
export function csPlural(n: number, one: string, few: string, other: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4 && Number.isInteger(n)) return few;
  return other;
}
