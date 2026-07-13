import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/useAuth";
import type { components } from "@/types/api.generated";

export type BillingSummary = components["schemas"]["BillingSummary"];

/**
 * Reads the current org's billing summary — user count plus pre-computed
 * monthly/annual totals and savings. Used by the trial-expired pay gate
 * (F4) to drive the dynamic "with N users you save X/year" caption, and
 * later by the in-app billing settings page (F5).
 *
 * Errors swallow to `null` (React Query disallows undefined return
 * values). Callers treat the data as optional and render a loading
 * state rather than crash.
 */
export function useBillingSummary() {
  const { accessToken } = useAuth();
  return useQuery<BillingSummary | null>({
    queryKey: ["billing-summary", "current"],
    enabled: !!accessToken,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        return await apiFetch<BillingSummary>("/api/v1/organizations/current/billing-summary", {
          token: accessToken,
        });
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}
