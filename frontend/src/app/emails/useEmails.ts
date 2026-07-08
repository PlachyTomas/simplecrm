import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type SentEmailOut = components["schemas"]["SentEmailOut"];
export type SentEmailDetail = components["schemas"]["SentEmailDetail"];
export type SentEmailsPage = components["schemas"]["Page_SentEmailOut_"];

// The compose payload is sent as a JSON string inside a multipart form, so
// FastAPI doesn't expose it as a body schema — declare it here to match
// `SentEmailCreate` on the backend.
export interface SentEmailCreate {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body?: string;
  deal_id?: string | null;
  company_id?: string | null;
  reply_to_email_id?: string | null;
}

export interface SendEmailInput {
  payload: SentEmailCreate;
  attachments?: File[];
}

export function useSendEmail() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<SentEmailOut, Error, SendEmailInput>({
    mutationFn: ({ payload, attachments }) => {
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      for (const f of attachments ?? []) form.append("attachments", f);
      return apiFetch<SentEmailOut>("/api/v1/emails", {
        method: "POST",
        token: accessToken,
        body: form,
      });
    },
    onSuccess: (_data, { payload }) => {
      if (payload.deal_id)
        void qc.invalidateQueries({ queryKey: ["emails", { dealId: payload.deal_id }] });
      if (payload.company_id)
        void qc.invalidateQueries({ queryKey: ["emails", { companyId: payload.company_id }] });
      // The send logs an `email_sent` activity — refresh timelines too.
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useDealEmails(dealId: string | undefined) {
  const { accessToken } = useAuth();
  return useQuery<SentEmailsPage>({
    queryKey: ["emails", { dealId }],
    enabled: !!accessToken && !!dealId,
    queryFn: () =>
      apiFetch<SentEmailsPage>(`/api/v1/emails?deal_id=${dealId}`, { token: accessToken }),
  });
}

export function useCompanyEmails(companyId: string | undefined) {
  const { accessToken } = useAuth();
  return useQuery<SentEmailsPage>({
    queryKey: ["emails", { companyId }],
    enabled: !!accessToken && !!companyId,
    queryFn: () =>
      apiFetch<SentEmailsPage>(`/api/v1/emails?company_id=${companyId}`, { token: accessToken }),
  });
}

export function useEmail(emailId: string | undefined) {
  const { accessToken } = useAuth();
  return useQuery<SentEmailDetail>({
    queryKey: ["email", emailId],
    enabled: !!accessToken && !!emailId,
    queryFn: () => apiFetch<SentEmailDetail>(`/api/v1/emails/${emailId}`, { token: accessToken }),
  });
}
