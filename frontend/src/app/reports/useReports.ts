import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type Leaderboard = components["schemas"]["Leaderboard"];
export type LossReasons = components["schemas"]["LossReasons"];
export type Velocity = components["schemas"]["Velocity"];
export type TeamLeaderboard = components["schemas"]["TeamLeaderboard"];
export type TeamLeaderboardRow = components["schemas"]["TeamLeaderboardRow"];
export type TeamMetric = components["schemas"]["TeamMetric"];
export type MySummary = components["schemas"]["MySummary"];

export interface ReportsRange {
  from?: string | null;
  to?: string | null;
}

interface LeaderboardOptions extends ReportsRange {
  teamId?: string | null;
  enabled?: boolean;
}

interface TeamLeaderboardOptions extends ReportsRange {
  metric?: TeamMetric;
  enabled?: boolean;
}

function rangeQuery({ from, to }: ReportsRange): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const s = params.toString();
  return s ? `?${s}` : "";
}

function buildQuery(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export function useLeaderboard(options: LeaderboardOptions) {
  const { accessToken } = useAuth();
  const { from, to, teamId, enabled = true } = options;
  return useQuery<Leaderboard>({
    queryKey: ["reports", "leaderboard", { from, to, teamId }],
    enabled: !!accessToken && enabled,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<Leaderboard>(
        `/api/v1/reports/leaderboard${buildQuery({ from, to, team_id: teamId })}`,
        { token: accessToken },
      ),
    // Salespeople hit a 403 "leaderboard_hidden" when the org has the
    // toggle off — that is an expected, non-recoverable state, so we don't
    // want React Query to bombard the endpoint or surface it as a fatal
    // error in the parent. The page-level component checks the org flag
    // before rendering the section, but defending here keeps a single
    // source of truth for the rule.
    retry: false,
  });
}

export function useTeamLeaderboard(options: TeamLeaderboardOptions) {
  const { accessToken } = useAuth();
  const { from, to, metric, enabled = true } = options;
  return useQuery<TeamLeaderboard>({
    queryKey: ["reports", "team-leaderboard", { from, to, metric }],
    enabled: !!accessToken && enabled,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<TeamLeaderboard>(
        `/api/v1/reports/team-leaderboard${buildQuery({ from, to, metric })}`,
        { token: accessToken },
      ),
    retry: false,
  });
}

export function useMySummary(range: ReportsRange) {
  const { accessToken } = useAuth();
  return useQuery<MySummary>({
    queryKey: ["reports", "my-summary", range],
    enabled: !!accessToken,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<MySummary>(`/api/v1/reports/my-summary${rangeQuery(range)}`, {
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
