import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type SentEmailOut = components["schemas"]["SentEmailOut"];
export type SentEmailDetail = components["schemas"]["SentEmailDetail"];
export type SentEmailsPage = components["schemas"]["Page_SentEmailListItemOut_"];
export type SentEmailListItem = components["schemas"]["SentEmailListItemOut"];

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
  /** Embed the open pixel + rewrite links through the click tracker (server default: true). */
  track?: boolean;
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
    onSuccess: () => {
      // Replies omit deal_id/company_id (the server anchors them to the reply
      // parent), so the payload can't tell us which lists changed — refresh
      // every email list.
      void qc.invalidateQueries({ queryKey: ["emails"] });
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

export interface MailListFilters {
  search?: string;
  direction?: "outbound" | "inbound";
  unmatched?: boolean;
  mine?: boolean;
  companyId?: string;
  dealId?: string;
  limit?: number;
  offset?: number;
}

export function mailListParams(f: MailListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search) params.set("search", f.search);
  if (f.direction) params.set("direction", f.direction);
  if (f.unmatched) params.set("unmatched", "true");
  if (f.mine) params.set("mine", "true");
  if (f.companyId) params.set("company_id", f.companyId);
  if (f.dealId) params.set("deal_id", f.dealId);
  if (f.limit !== undefined) params.set("limit", String(f.limit));
  if (f.offset !== undefined) params.set("offset", String(f.offset));
  return params;
}

/** The Mail page's unified list — every captured mail the user may see. */
export function useMailList(filters: MailListFilters) {
  const { accessToken } = useAuth();
  return useQuery<SentEmailsPage>({
    queryKey: ["emails", "mail-list", filters],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<SentEmailsPage>(`/api/v1/emails?${mailListParams(filters)}`, {
        token: accessToken,
      }),
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
