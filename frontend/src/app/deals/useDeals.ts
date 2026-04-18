import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type DealOut = components["schemas"]["DealOut"];
export type DealsPage = components["schemas"]["Page_DealOut_"];

export function useDeals({ limit = 50, offset = 0 } = {}) {
  const { accessToken } = useAuth();
  return useQuery<DealsPage>({
    queryKey: ["deals", { limit, offset }],
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiFetch<DealsPage>(`/api/v1/deals?limit=${limit}&offset=${offset}`, {
        token: accessToken,
      }),
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
