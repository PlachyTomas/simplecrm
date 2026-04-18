import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type CompanyOut = components["schemas"]["CompanyOut"];
export type CompaniesPage = components["schemas"]["Page_CompanyOut_"];

interface UseCompaniesOptions {
  limit?: number;
  offset?: number;
  search?: string;
}

export function useCompanies({ limit = 25, offset = 0, search = "" }: UseCompaniesOptions = {}) {
  const { accessToken } = useAuth();
  const trimmed = search.trim();
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  query.set("offset", String(offset));
  if (trimmed) query.set("search", trimmed);

  return useQuery<CompaniesPage>({
    queryKey: ["companies", { limit, offset, search: trimmed }],
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiFetch<CompaniesPage>(`/api/v1/companies?${query.toString()}`, {
        token: accessToken,
      }),
  });
}
