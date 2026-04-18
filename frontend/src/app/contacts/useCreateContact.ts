import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type ContactCreate = components["schemas"]["ContactCreate"];
export type ContactOut = components["schemas"]["ContactOut"];

export function useCreateContact() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<ContactOut, Error, ContactCreate>({
    mutationFn: (payload) =>
      apiFetch<ContactOut>("/api/v1/contacts", {
        method: "POST",
        token: accessToken,
        body: payload as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
