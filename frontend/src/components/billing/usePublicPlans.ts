import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type PublicPlan = components["schemas"]["PublicPlanOut"];

const PLANS_FALLBACK: PublicPlan[] = [];

/**
 * Reads the two public plans (monthly + annual) with derived savings.
 * Unauthenticated; backed by GET /api/v1/plans/public. Used by the
 * marketing /cenik page, the trial-expired pay gate, and the in-app
 * billing settings.
 */
export function usePublicPlans() {
  return useQuery<PublicPlan[]>({
    queryKey: ["plans", "public"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      try {
        return await apiFetch<PublicPlan[]>("/api/v1/plans/public");
      } catch (err) {
        if (err instanceof ApiError) return PLANS_FALLBACK;
        throw err;
      }
    },
    placeholderData: PLANS_FALLBACK,
  });
}
