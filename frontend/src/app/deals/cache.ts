import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate every query that reads deal-derived state.
 *
 * Every deal-write mutation (create, edit, move stage, win, lose, delete)
 * goes through this helper so the dashboard KPIs, all four report cards,
 * the pipeline board, and the per-deal detail all re-fetch on the next
 * render. Without this, soft-navigating from `/app/pipeline` back to
 * `/app` shows a pre-write snapshot until React Query's `staleTime`
 * elapses — see QA-026.
 *
 * The exact list of consumers grows over time; we deliberately rely on
 * React Query's prefix-match semantics to catch every nested key under
 * `["reports", ...]` without having to enumerate them.
 */
export function invalidateDealReadModels(
  queryClient: QueryClient,
  dealId?: string,
): void {
  void queryClient.invalidateQueries({ queryKey: ["deals"] });
  void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
  if (dealId) {
    void queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
  }
}
