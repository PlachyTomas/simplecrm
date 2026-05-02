import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";

import type { DashboardConfig } from "@/app/reports/dashboard/types";

const QUERY_KEY = ["reports", "dashboard-config"];

/**
 * Reads the user's persisted Reports widget layout. Empty `{}` (column
 * default) → backend returns the 8-widget starter set. Errors swallow
 * to `null` so the caller can render a placeholder while we sort the
 * problem out.
 */
export function useDashboardConfig() {
  const { accessToken } = useAuth();
  return useQuery<DashboardConfig | null>({
    queryKey: QUERY_KEY,
    enabled: !!accessToken,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        return await apiFetch<DashboardConfig>(
          "/api/v1/reports/dashboard-config",
          { token: accessToken },
        );
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

/** Save the layout. Optimistically replaces the cached value. */
export function useSaveDashboardConfig() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: DashboardConfig) =>
      apiFetch<DashboardConfig>("/api/v1/reports/dashboard-config", {
        method: "PUT",
        token: accessToken,
        body: next,
      }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<DashboardConfig | null>(QUERY_KEY);
      qc.setQueryData(QUERY_KEY, next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Reset to the default 8-widget layout. */
export function useResetDashboardConfig() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<void>("/api/v1/reports/dashboard-config", {
        method: "DELETE",
        token: accessToken,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export const DASHBOARD_CONFIG_QUERY_KEY = QUERY_KEY;
