import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type RecipientCandidate = components["schemas"]["RecipientCandidate"];
export type CampaignOut = components["schemas"]["CampaignOut"];
export type CampaignDetailOut = components["schemas"]["CampaignDetailOut"];
export type CampaignsPage = components["schemas"]["Page_CampaignOut_"];
export type BulkEmailFilters = components["schemas"]["BulkEmailFilters"];

// The send payload is sent as a JSON string inside a multipart form, so
// FastAPI never emits it into the OpenAPI schema — define it locally to
// match `app/schemas/bulk_email.py::BulkEmailSendIn`.
export interface BulkEmailRecipientIn {
  company_id: string;
  emails: string[];
  contact_id?: string | null;
}

export interface BulkEmailSendIn {
  subject: string;
  body: string;
  recipients: BulkEmailRecipientIn[];
  create_deals: boolean;
  deal_title?: string | null;
}

const BASE = "/api/v1/companies/bulk-email";

export function useResolveRecipients() {
  const { accessToken } = useAuth();
  return useMutation<RecipientCandidate[], Error, BulkEmailFilters>({
    mutationFn: (filters) =>
      apiFetch<RecipientCandidate[]>(`${BASE}/recipients`, {
        method: "POST",
        token: accessToken,
        body: filters as unknown as Record<string, unknown>,
      }),
  });
}

export interface SendBulkEmailInput {
  payload: BulkEmailSendIn;
  attachment?: File | null;
}

export function useSendBulkEmail() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<CampaignOut, Error, SendBulkEmailInput>({
    mutationFn: ({ payload, attachment }) => {
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      if (attachment) form.append("attachment", attachment);
      return apiFetch<CampaignOut>(`${BASE}/send`, {
        method: "POST",
        token: accessToken,
        body: form,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["email-campaigns"] }),
  });
}

export function useEmailCampaigns(limit = 25, offset = 0) {
  const { accessToken } = useAuth();
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return useQuery<CampaignsPage>({
    queryKey: ["email-campaigns", { limit, offset }],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<CampaignsPage>(`${BASE}/campaigns?${query.toString()}`, { token: accessToken }),
  });
}

export function useEmailCampaign(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<CampaignDetailOut>({
    queryKey: ["email-campaign", id],
    enabled: !!accessToken && !!id,
    queryFn: () => apiFetch<CampaignDetailOut>(`${BASE}/campaigns/${id}`, { token: accessToken }),
  });
}
