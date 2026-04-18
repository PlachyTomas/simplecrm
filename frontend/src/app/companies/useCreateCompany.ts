import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type CompanyCreate = components["schemas"]["CompanyCreate"];
export type CompanyOut = components["schemas"]["CompanyOut"];

export function useCreateCompany() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CompanyOut, Error, CompanyCreate>({
    mutationFn: (payload) =>
      apiFetch<CompanyOut>("/api/v1/companies", {
        method: "POST",
        token: accessToken,
        body: payload as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}
