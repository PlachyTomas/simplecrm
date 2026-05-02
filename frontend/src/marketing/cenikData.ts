import { useQuery } from "@tanstack/react-query";

import { useBillingSettings } from "@/components/billing/useBillingSettings";
import type { BillingSettingsPublic } from "@/components/billing/useBillingSettings";
import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type PublicPlan = components["schemas"]["PublicPlanOut"];

const PLANS_FALLBACK: PublicPlan[] = [];

function usePublicPlans() {
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

export interface CenikData {
  settings: BillingSettingsPublic | undefined;
  plans: PublicPlan[];
}

/**
 * Bundles the two public reads the /cenik page needs. The page itself
 * doesn't gate on loading state — prices and copy are static in the
 * brief; the fetched plans are used only to enrich any future dynamic
 * lines (savings %, etc.). is_vat_payer drives the helper-section copy
 * and falls back to false when offline.
 */
export function useCenikData(): CenikData {
  const settings = useBillingSettings();
  const plans = usePublicPlans();
  return {
    settings: settings.data,
    plans: plans.data ?? PLANS_FALLBACK,
  };
}
