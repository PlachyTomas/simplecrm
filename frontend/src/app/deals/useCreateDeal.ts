import { useMutation, useQueryClient } from "@tanstack/react-query";

import { BOARD_QUERY_KEY } from "@/app/pipeline/useBoard";
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
      void queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}
