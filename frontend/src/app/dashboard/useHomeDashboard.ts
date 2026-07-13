import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type HomeDashboardConfig = components["schemas"]["HomeDashboardConfig"];
export type HomeWidgetEntry = components["schemas"]["HomeWidgetEntry"];
export type HomeWidgetConfig = HomeWidgetEntry["config"];
export type HomeWidgetType = HomeWidgetConfig["type"];

const QUERY_KEY = ["home", "dashboard-config"];

/**
 * Reads the user's persisted home widget layout. Empty `{}` (column
 * default) → backend returns the role-aware default set. Errors swallow
 * to `null` so the caller can render a placeholder while we sort the
 * problem out — mirrors `useDashboardConfig` (Reports).
 */
export function useHomeDashboardConfig() {
  const { accessToken } = useAuth();
  return useQuery<HomeDashboardConfig | null>({
    queryKey: QUERY_KEY,
    enabled: !!accessToken,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        return await apiFetch<HomeDashboardConfig>("/api/v1/users/me/home-dashboard", {
          token: accessToken,
        });
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

/** Save the layout. Optimistically replaces the cached value. */
export function useSaveHomeDashboardConfig() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: HomeDashboardConfig) =>
      apiFetch<HomeDashboardConfig>("/api/v1/users/me/home-dashboard", {
        method: "PUT",
        token: accessToken,
        body: next,
      }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<HomeDashboardConfig | null>(QUERY_KEY);
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

/** Reset to the role-aware default layout (DELETE → 204). */
export function useResetHomeDashboardConfig() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<void>("/api/v1/users/me/home-dashboard", {
        method: "DELETE",
        token: accessToken,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export const HOME_DASHBOARD_CONFIG_QUERY_KEY = QUERY_KEY;
