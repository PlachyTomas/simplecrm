/**
 * The one inheritance rule of the todo feature, in one place.
 *
 * A todo may carry its own deal link, and so may its list. The list wins:
 * "this whole list is about deal X" is a single switch instead of tagging
 * every item, and the per-todo link is overridden rather than erased, so
 * unlinking the list brings it back.
 *
 * Both sides come straight off the API rows (`TodoListOut` / `TodoOut`),
 * which is why this takes the two link pairs rather than the full shapes.
 */

export interface DealLink {
  deal_id?: string | null;
  deal_name?: string | null;
}

export interface ResolvedDeal {
  id: string;
  name: string;
}

/**
 * The deal a todo actually belongs to. `list` is optional because the
 * deal-detail section mixes todos from several lists and doesn't hold
 * their list rows — there, the server has already resolved the scope and
 * each row carries whatever link applies.
 */
export function effectiveDeal(list: DealLink | undefined, todo: DealLink): ResolvedDeal | null {
  const source = list?.deal_id ? list : todo;
  return source.deal_id ? { id: source.deal_id, name: source.deal_name ?? "" } : null;
}

/** Whether the per-todo deal control should be disabled (list link wins). */
export function isDealLinkLocked(list: DealLink | undefined): boolean {
  return Boolean(list?.deal_id);
}
