import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type CompanyOut = components["schemas"]["CompanyOut"];
export type CompaniesPage = components["schemas"]["Page_CompanyOut_"];

interface UseCompaniesOptions {
  limit?: number;
  offset?: number;
}

export function useCompanies({ limit = 50, offset = 0 }: UseCompaniesOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<CompaniesPage>({
    queryKey: ["companies", { limit, offset }],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<CompaniesPage>(`/api/v1/companies?limit=${limit}&offset=${offset}`, {
        token: accessToken,
      }),
  });
}
