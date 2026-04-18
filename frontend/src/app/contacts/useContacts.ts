import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type ContactOut = components["schemas"]["ContactOut"];
export type ContactsPage = components["schemas"]["Page_ContactOut_"];

interface UseContactsOptions {
  limit?: number;
  offset?: number;
}

export function useContacts({ limit = 50, offset = 0 }: UseContactsOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<ContactsPage>({
    queryKey: ["contacts", { limit, offset }],
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiFetch<ContactsPage>(`/api/v1/contacts?limit=${limit}&offset=${offset}`, {
        token: accessToken,
      }),
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
