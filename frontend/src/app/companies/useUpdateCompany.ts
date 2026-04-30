import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CompanyOut } from "@/app/companies/useCompanies";
import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type CompanyUpdate = components["schemas"]["CompanyUpdate"];

export function useUpdateCompany(companyId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<CompanyOut, Error, CompanyUpdate>({
    mutationFn: (patch) =>
      apiFetch<CompanyOut>(`/api/v1/companies/${companyId}`, {
        method: "PUT",
        token: accessToken,
        body: patch as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["company", companyId] });
    },
  });
}
