import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateDealReadModels } from "@/app/deals/cache";
import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import { useCsvExport } from "@/lib/csvExport";
import type { components } from "@/types/api.generated";

/** One deal by id. Carries `note` (the standing description); the list
 * and board schemas deliberately do not — see `DealDetailOut` on the API. */
export type DealOut = components["schemas"]["DealDetailOut"];
export type DealListItem = components["schemas"]["DealListItemOut"];
export type DealUpdate = components["schemas"]["DealUpdate"];
export type DealsPage = components["schemas"]["Page_DealListItemOut_"];

export type DealSortKey =
  | "name"
  | "value"
  | "created_at"
  | "expected_close_date"
  | "company_name"
  | "stage";

/** Lifecycle filter. A lost deal sits in an open-type stage with `closed_at`
 * set, so "open" is narrower than "not won" — the server owns that rule. */
export type DealStatusFilter = "open" | "won" | "lost";

export interface DealListFilters {
  companyId?: string;
  search?: string;
  stageId?: string;
  ownerUserId?: string;
  status?: DealStatusFilter;
  sort?: DealSortKey;
  order?: "asc" | "desc";
}

interface UseDealsOptions extends DealListFilters {
  limit?: number;
  offset?: number;
}

/**
 * Serialize the list filters. Shared by the list query and the CSV export so
 * the download can never drift from the table the user is looking at.
 */
export function dealListParams(filters: DealListFilters): URLSearchParams {
  const params = new URLSearchParams();
  const search = filters.search?.trim();
  if (filters.companyId) params.set("company_id", filters.companyId);
  if (search) params.set("search", search);
  if (filters.stageId) params.set("stage_id", filters.stageId);
  if (filters.ownerUserId) params.set("owner_user_id", filters.ownerUserId);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  return params;
}

export function useDeals({ limit = 50, offset = 0, ...filters }: UseDealsOptions = {}) {
  const { accessToken } = useAuth();
  const params = dealListParams(filters);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return useQuery<DealsPage>({
    queryKey: ["deals", { limit, offset, ...filters }],
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
    queryFn: () => apiFetch<DealsPage>(`/api/v1/deals?${params}`, { token: accessToken }),
  });
}

/** "Stáhnout CSV" on the deals list — same filters, no pagination. */
export function useExportDealsCsv() {
  return useCsvExport({ path: "/api/v1/deals/export.csv", fallbackName: "simplecrm-deals.csv" });
}

export function useDeal(dealId: string | undefined) {
  const { accessToken } = useAuth();
  return useQuery<DealOut>({
    queryKey: ["deal", dealId],
    enabled: !!accessToken && !!dealId,
    queryFn: () => apiFetch<DealOut>(`/api/v1/deals/${dealId}`, { token: accessToken }),
  });
}

export function useUpdateDeal(dealId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<DealOut, Error, DealUpdate>({
    mutationFn: (patch) =>
      apiFetch<DealOut>(`/api/v1/deals/${dealId}`, {
        method: "PUT",
        token: accessToken,
        body: patch as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      invalidateDealReadModels(qc, dealId);
    },
  });
}

export function useDeleteDeal(dealId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () =>
      apiFetch<void>(`/api/v1/deals/${dealId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      invalidateDealReadModels(qc, dealId);
    },
  });
}

export function useDeleteAnyDeal() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, { dealId: string }>({
    mutationFn: ({ dealId }) =>
      apiFetch<void>(`/api/v1/deals/${dealId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: (_data, { dealId }) => {
      invalidateDealReadModels(qc, dealId);
    },
  });
}
