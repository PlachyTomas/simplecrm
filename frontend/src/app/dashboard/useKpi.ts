import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type KpiSummary = components["schemas"]["KpiSummary"];

export function useKpiSummary() {
  const { accessToken } = useAuth();
  return useQuery<KpiSummary>({
    queryKey: ["reports", "kpi-summary"],
    enabled: !!accessToken,
    staleTime: 30_000,
    queryFn: () => apiFetch<KpiSummary>("/api/v1/reports/kpi-summary", { token: accessToken }),
  });
}
