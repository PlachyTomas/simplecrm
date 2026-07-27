import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type EmailTemplateOut = components["schemas"]["EmailTemplateOut"];
export type EmailTemplateIn = components["schemas"]["EmailTemplateIn"];
export type MergeFieldsOut = components["schemas"]["MergeFieldsOut"];

const BASE = "/api/v1/email-templates";
const TEMPLATES_KEY = ["email-templates"] as const;
// Deliberately NOT nested under TEMPLATES_KEY: the vocabulary is static, and a
// prefix match would refetch it on every template mutation.
const MERGE_FIELDS_KEY = ["email-merge-fields"] as const;

/** Org-shared templates, alphabetical (the server orders them). */
export function useEmailTemplates(enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<EmailTemplateOut[]>({
    queryKey: TEMPLATES_KEY,
    enabled: !!accessToken && enabled,
    queryFn: () => apiFetch<EmailTemplateOut[]>(BASE, { token: accessToken }),
  });
}

/** The `{token}` vocabulary the backend substitutes at send time. */
export function useMergeFields(enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<MergeFieldsOut>({
    queryKey: MERGE_FIELDS_KEY,
    enabled: !!accessToken && enabled,
    // Server-side constant — never goes stale within a session.
    staleTime: Infinity,
    queryFn: () => apiFetch<MergeFieldsOut>(`${BASE}/merge-fields`, { token: accessToken }),
  });
}

export function useCreateEmailTemplate() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<EmailTemplateOut, Error, EmailTemplateIn>({
    mutationFn: (body) =>
      apiFetch<EmailTemplateOut>(BASE, {
        method: "POST",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}

export function useUpdateEmailTemplate() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<EmailTemplateOut, Error, { id: string; body: EmailTemplateIn }>({
    mutationFn: ({ id, body }) =>
      apiFetch<EmailTemplateOut>(`${BASE}/${id}`, {
        method: "PUT",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}

export function useDeleteEmailTemplate() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiFetch<void>(`${BASE}/${id}`, { method: "DELETE", token: accessToken }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}
