import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type CompanyOut = components["schemas"]["CompanyOut"];
export type CompaniesPage = components["schemas"]["Page_CompanyOut_"];
export type CompanyFilterOptions = components["schemas"]["CompanyFilterOptions"];

export type CompanySortKey =
  | "name"
  | "ownership_expires_at"
  | "last_order_at"
  | "last_activity_at"
  | "created_at";

export type CompanyOwnershipFilter = "mine" | "mine_and_unowned" | "unowned";

interface UseCompaniesOptions {
  limit?: number;
  offset?: number;
  search?: string;
  sort?: CompanySortKey;
  order?: "asc" | "desc";
  ownership?: CompanyOwnershipFilter;
  ownerUserId?: string;
  industry?: string;
  city?: string;
}

export function useCompanies({
  limit = 25,
  offset = 0,
  search = "",
  sort = "name",
  order = "asc",
  ownership,
  ownerUserId,
  industry,
  city,
}: UseCompaniesOptions = {}) {
  const { accessToken } = useAuth();
  const trimmed = search.trim();
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  query.set("offset", String(offset));
  if (trimmed) query.set("search", trimmed);
  query.set("sort", sort);
  query.set("order", order);
  if (ownership) query.set("ownership", ownership);
  if (ownerUserId) query.set("owner_user_id", ownerUserId);
  if (industry) query.set("industry", industry);
  if (city) query.set("city", city);

  return useQuery<CompaniesPage>({
    queryKey: [
      "companies",
      { limit, offset, search: trimmed, sort, order, ownership, ownerUserId, industry, city },
    ],
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiFetch<CompaniesPage>(`/api/v1/companies?${query.toString()}`, {
        token: accessToken,
      }),
  });
}

export function useCompanyFilterOptions() {
  const { accessToken } = useAuth();
  return useQuery<CompanyFilterOptions>({
    queryKey: ["companies", "filter-options"],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<CompanyFilterOptions>("/api/v1/companies/filter-options", { token: accessToken }),
  });
}
