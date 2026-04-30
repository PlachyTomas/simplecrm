import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type ContactOut = components["schemas"]["ContactOut"];
export type ContactUpdate = components["schemas"]["ContactUpdate"];
export type ContactsPage = components["schemas"]["Page_ContactOut_"];

interface UseContactsOptions {
  limit?: number;
  offset?: number;
  companyId?: string;
}

export function useContacts({ limit = 50, offset = 0, companyId }: UseContactsOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<ContactsPage>({
    queryKey: ["contacts", { limit, offset, companyId }],
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (companyId) params.set("company_id", companyId);
      return apiFetch<ContactsPage>(`/api/v1/contacts?${params}`, { token: accessToken });
    },
  });
}

export function useContact(contactId: string | undefined) {
  const { accessToken } = useAuth();
  return useQuery<ContactOut>({
    queryKey: ["contact", contactId],
    enabled: !!accessToken && !!contactId,
    queryFn: () => apiFetch<ContactOut>(`/api/v1/contacts/${contactId}`, { token: accessToken }),
  });
}

export function useUpdateContact(contactId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<ContactOut, Error, ContactUpdate>({
    mutationFn: (patch) =>
      apiFetch<ContactOut>(`/api/v1/contacts/${contactId}`, {
        method: "PATCH",
        token: accessToken,
        body: patch as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["contact", contactId] });
    },
  });
}
