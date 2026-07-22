import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CompanyOut } from "@/app/companies/useCompanies";
import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";

/**
 * Ownership transfers go through the dedicated endpoints, not the generic
 * PUT: `/reassign` resets the ownership window and records the release,
 * `/free` returns the company to the shared pool. Both are manager/admin
 * only server-side — callers gate the UI on the current user's role.
 */
export function useReassignCompany(companyId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<CompanyOut, Error, { new_owner_user_id: string }>({
    mutationFn: (payload) =>
      apiFetch<CompanyOut>(`/api/v1/companies/${companyId}/reassign`, {
        method: "POST",
        token: accessToken,
        body: payload,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["company", companyId] });
    },
  });
}

export function useFreeCompany(companyId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<CompanyOut, Error, void>({
    mutationFn: () =>
      apiFetch<CompanyOut>(`/api/v1/companies/${companyId}/free`, {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["company", companyId] });
    },
  });
}
