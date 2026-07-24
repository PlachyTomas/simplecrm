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
  hasOpenDeals?: boolean;
  /** Set false to hold the fetch (e.g. a closed modal that only sometimes needs contacts). */
  enabled?: boolean;
}

export function useContacts({
  limit = 50,
  offset = 0,
  companyId,
  hasOpenDeals,
  enabled = true,
}: UseContactsOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<ContactsPage>({
    queryKey: ["contacts", { limit, offset, companyId, hasOpenDeals }],
    enabled: !!accessToken && enabled,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (companyId) params.set("company_id", companyId);
      if (hasOpenDeals) params.set("has_open_deals", "true");
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
        method: "PUT",
        token: accessToken,
        body: patch as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["contact", contactId] });
    },
  });
}

export function useDeleteContact(contactId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () =>
      apiFetch<void>(`/api/v1/contacts/${contactId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      // Refresh the list, but do NOT invalidate the deleted contact's own
      // detail query: its observer is still mounted (the caller navigates away
      // right after this) and invalidating would refetch a now-404 row. The
      // stale cache entry is harmless and gets garbage-collected once inactive.
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
