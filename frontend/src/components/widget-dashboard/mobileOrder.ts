import type { ReactNode } from "react";

export interface MobileWidgetItem {
  id: string;
  node: ReactNode;
}

/**
 * Derive the render order from `order`, appending any ids present in
 * `items` but missing from `order` (in `items` order) at the end. Ids in
 * `order` with no matching item are skipped and duplicates collapse.
 * Kept in its own module (no component export) so the mobile list stays
 * fast-refresh friendly and the derivation is unit-testable in isolation.
 */
export function deriveMobileOrder(
  items: MobileWidgetItem[],
  order: string[],
): MobileWidgetItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const result: MobileWidgetItem[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      result.push(item);
      seen.add(id);
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) {
      result.push(item);
      seen.add(item.id);
    }
  }
  return result;
}
