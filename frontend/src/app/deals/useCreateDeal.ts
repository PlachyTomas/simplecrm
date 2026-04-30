import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateDealReadModels } from "@/app/deals/cache";
import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type DealCreate = components["schemas"]["DealCreate"];
export type DealOut = components["schemas"]["DealOut"];

export function useCreateDeal() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<DealOut, Error, DealCreate>({
    mutationFn: (payload) =>
      apiFetch<DealOut>("/api/v1/deals", {
        method: "POST",
        token: accessToken,
        body: payload as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      invalidateDealReadModels(queryClient);
    },
  });
}
