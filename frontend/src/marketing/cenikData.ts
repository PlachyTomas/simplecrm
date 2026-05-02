import { useBillingSettings } from "@/components/billing/useBillingSettings";
import type { BillingSettingsPublic } from "@/components/billing/useBillingSettings";
import { usePublicPlans } from "@/components/billing/usePublicPlans";
import type { PublicPlan } from "@/components/billing/usePublicPlans";

export type { PublicPlan };

const PLANS_FALLBACK: PublicPlan[] = [];

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
