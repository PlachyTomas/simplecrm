import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";

import { resolvePreset } from "@/app/reports/dashboard/dateRange";
import type {
  GlobalFilters,
  WidgetType,
} from "@/app/reports/dashboard/types";

/**
 * Standardized widget data hook. Per REPORTS_TASK §6.5 the queryKey
 * is `['widget', type, config, globalFilters]` so any filter or
 * config change re-fetches.
 *
 * The hook resolves the date-range preset to absolute `from`/`to` ISO
 * dates before issuing the request — backend widget endpoints take
 * those plus the optional team/owner scope and the per-widget config
 * (already in the `extraParams` arg).
 */
export function useWidgetQuery<TResponse>(opts: {
  type: WidgetType;
  /** URL slug under /reports/widgets/, e.g. "pipeline-value". */
  endpoint: string;
  config: Record<string, unknown>;
  globalFilters: GlobalFilters;
  /** Skip the request — useful when a parent gate is still loading. */
  enabled?: boolean;
}) {
  const { accessToken } = useAuth();
  const { type, endpoint, config, globalFilters, enabled = true } = opts;

  return useQuery<TResponse>({
    queryKey: ["widget", type, config, globalFilters],
    enabled: enabled && !!accessToken && !!globalFilters.dateRange,
    staleTime: 30 * 1000,
    queryFn: () => {
      const range = resolvePreset(globalFilters.dateRange!);
      const params = new URLSearchParams();
      params.set("from", range.from);
      params.set("to", range.to);
      if (globalFilters.teamId) params.set("team_id", globalFilters.teamId);
      if (globalFilters.ownerUserId)
        params.set("owner_user_id", globalFilters.ownerUserId);
      for (const [k, v] of Object.entries(config)) {
        if (k === "type") continue;
        if (v === null || v === undefined) continue;
        params.set(k, String(v));
      }
      return apiFetch<TResponse>(
        `/api/v1/reports/widgets/${endpoint}?${params.toString()}`,
        { token: accessToken },
      );
    },
  });
}
