import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/useAuth";
import type { components } from "@/types/api.generated";

export type SubscriptionOut = components["schemas"]["SubscriptionOut"];

/**
 * Reads the current org's subscription. Used by the trial countdown
 * (to hide the badge for paid orgs), the pay-gate (F4), and the
 * in-app billing settings (F5).
 *
 * 401/404/5xx swallow to `null` (React Query disallows undefined
 * return values) so callers can fall back to default behavior — we
 * only positively act when we *know* the subscription state, never
 * when we're guessing.
 */
export function useCurrentSubscription() {
  const { accessToken } = useAuth();
  return useQuery<SubscriptionOut | null>({
    queryKey: ["subscription", "current"],
    enabled: !!accessToken,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        return await apiFetch<SubscriptionOut>("/api/v1/organizations/current/subscription", {
          token: accessToken,
        });
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}
