import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateDealReadModels } from "@/app/deals/cache";
import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type DealOut = components["schemas"]["DealOut"];
export type DealUpdate = components["schemas"]["DealUpdate"];
export type DealsPage = components["schemas"]["Page_DealOut_"];

interface UseDealsOptions {
  limit?: number;
  offset?: number;
  companyId?: string;
}

export function useDeals({ limit = 50, offset = 0, companyId }: UseDealsOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<DealsPage>({
    queryKey: ["deals", { limit, offset, companyId }],
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (companyId) params.set("company_id", companyId);
      return apiFetch<DealsPage>(`/api/v1/deals?${params}`, { token: accessToken });
    },
  });
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
