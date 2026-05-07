import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type AdminOrgList = components["schemas"]["AdminOrgList"];
export type AdminOrgRow = components["schemas"]["AdminOrgRow"];
export type AdminActivityList = components["schemas"]["AdminActivityList"];
export type AdminSubscriptionOut = components["schemas"]["SubscriptionOut"];
export type BillingSettingsOut = components["schemas"]["BillingSettingsOut"];
export type AdminOrgUserRow = components["schemas"]["AdminOrgUserRow"];
export type AdminOrgUserList = components["schemas"]["AdminOrgUserList"];
export type ImpersonateOut = components["schemas"]["ImpersonateOut"];

const PAGE_SIZE = 50;

/**
 * Paginated org list with optional substring search. The result is keyed
 * on `[q, offset]` so the UI can swap pages without re-fetching the
 * whole list. Errors swallow to `null` (React Query disallows `undefined`
 * returns; the F4/F5 hooks use the same convention).
 */
export function useAdminOrgList(q: string, offset = 0) {
  const { accessToken } = useAuth();
  return useQuery<AdminOrgList | null>({
    queryKey: ["admin", "org-list", q, offset],
    enabled: !!accessToken,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (q) params.set("q", q);
        return await apiFetch<AdminOrgList>(
          `/api/v1/admin/organizations?${params.toString()}`,
          { token: accessToken },
        );
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

/** Subscription detail for a single org (drives the drawer). */
export function useAdminOrgSubscription(orgId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<AdminSubscriptionOut | null>({
    queryKey: ["admin", "org-subscription", orgId],
    enabled: !!accessToken && !!orgId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!orgId) return null;
      try {
        return await apiFetch<AdminSubscriptionOut>(
          `/api/v1/admin/organizations/${orgId}`,
          { token: accessToken },
        );
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

/** Subscription-scoped activity timeline for the org detail drawer. */
export function useAdminOrgActivity(orgId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<AdminActivityList | null>({
    queryKey: ["admin", "org-activity", orgId],
    enabled: !!accessToken && !!orgId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!orgId) return null;
      try {
        return await apiFetch<AdminActivityList>(
          `/api/v1/admin/organizations/${orgId}/activity?limit=50&offset=0`,
          { token: accessToken },
        );
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

/** Singleton billing settings (drives the Nastavení tab). */
export function useAdminBillingSettings() {
  const { accessToken } = useAuth();
  return useQuery<BillingSettingsOut | null>({
    queryKey: ["admin", "billing-settings"],
    enabled: !!accessToken,
    staleTime: 60 * 1000,
    queryFn: async () => {
      try {
        return await apiFetch<BillingSettingsOut>(
          "/api/v1/admin/billing-settings",
          { token: accessToken },
        );
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

/** Members of an org — drives the impersonation picker on the drawer. */
export function useAdminOrgUsers(orgId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<AdminOrgUserList | null>({
    queryKey: ["admin", "org-users", orgId],
    enabled: !!accessToken && !!orgId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!orgId) return null;
      try {
        return await apiFetch<AdminOrgUserList>(
          `/api/v1/admin/organizations/${orgId}/users`,
          { token: accessToken },
        );
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

export const ADMIN_PAGE_SIZE = PAGE_SIZE;
