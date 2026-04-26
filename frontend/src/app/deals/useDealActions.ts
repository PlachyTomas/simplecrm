import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

type DealOut = components["schemas"]["DealOut"];

export function useMarkDealWon(dealId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<DealOut, Error, void>({
    mutationFn: () =>
      apiFetch<DealOut>(`/api/v1/deals/${dealId}/mark-won`, {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

/**
 * Mutation variant that takes the deal id at call-time rather than at
 * hook-creation time — useful for list / kanban surfaces where each
 * card needs to win its own deal without spawning a separate hook
 * instance per card.
 */
export function useMarkAnyDealWon() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<DealOut, Error, { dealId: string }>({
    mutationFn: ({ dealId }) =>
      apiFetch<DealOut>(`/api/v1/deals/${dealId}/mark-won`, {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: (_data, { dealId }) => {
      void queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useMarkDealLost(dealId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<DealOut, Error, { lost_reason: string }>({
    mutationFn: (payload) =>
      apiFetch<DealOut>(`/api/v1/deals/${dealId}/mark-lost`, {
        method: "POST",
        token: accessToken,
        body: payload,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}
