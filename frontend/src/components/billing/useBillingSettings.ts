import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type BillingSettingsPublic = components["schemas"]["BillingSettingsPublic"];

const FALLBACK: BillingSettingsPublic = {
  is_vat_payer: false,
  vat_rate_percent: "21.00",
  contact_email: "podpora@simplecrm.cz",
};

/**
 * Single source of truth for the seller's DPH state. Cached for 5 minutes
 * because the operator only flips this when the SimpleCRM org crosses the
 * 2 M Kč obrat threshold — change is rare, downside of stale cache is one
 * window of slightly-wrong DPH copy on the pricing page.
 *
 * Read-only and unauthenticated — backed by GET /plans/billing-settings/public.
 * If the network or the backend is down, returns the fallback (false, 21 %)
 * so the UI never goes blank waiting on this read.
 */
export function useBillingSettings() {
  return useQuery<BillingSettingsPublic>({
    queryKey: ["billing-settings", "public"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      try {
        return await apiFetch<BillingSettingsPublic>(
          "/api/v1/plans/billing-settings/public",
        );
      } catch (err) {
        if (err instanceof ApiError) return FALLBACK;
        throw err;
      }
    },
    placeholderData: FALLBACK,
  });
}
