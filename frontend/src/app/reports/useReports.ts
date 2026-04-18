import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type Leaderboard = components["schemas"]["Leaderboard"];
export type LossReasons = components["schemas"]["LossReasons"];
export type Velocity = components["schemas"]["Velocity"];

export interface ReportsRange {
  from?: string | null;
  to?: string | null;
}

function rangeQuery({ from, to }: ReportsRange): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function useLeaderboard(range: ReportsRange) {
  const { accessToken } = useAuth();
  return useQuery<Leaderboard>({
    queryKey: ["reports", "leaderboard", range],
    enabled: !!accessToken,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<Leaderboard>(`/api/v1/reports/leaderboard${rangeQuery(range)}`, {
        token: accessToken,
      }),
  });
}

export function useLossReasons(range: ReportsRange) {
  const { accessToken } = useAuth();
  return useQuery<LossReasons>({
    queryKey: ["reports", "loss-reasons", range],
    enabled: !!accessToken,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<LossReasons>(`/api/v1/reports/loss-reasons${rangeQuery(range)}`, {
        token: accessToken,
      }),
  });
}

export function useVelocity(range: ReportsRange) {
  const { accessToken } = useAuth();
  return useQuery<Velocity>({
    queryKey: ["reports", "pipeline-velocity", range],
    enabled: !!accessToken,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<Velocity>(`/api/v1/reports/pipeline-velocity${rangeQuery(range)}`, {
        token: accessToken,
      }),
  });
}

export function buildExportCsvUrl(range: ReportsRange): string {
  return `${API_BASE_URL}/api/v1/reports/export-csv${rangeQuery(range)}`;
}
