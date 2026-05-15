import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";

export type AdminInvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "voided";
export type AdminInvoiceKind = "invoice" | "credit_note" | "proforma";

export interface AdminInvoiceListItem {
  id: string;
  organization_id: string;
  organization_name: string;
  number: string;
  kind: AdminInvoiceKind;
  status: AdminInvoiceStatus;
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  sent_at: string | null;
  customer_name: string;
  currency: string;
  total_minor: number;
  related_invoice_id: string | null;
}

export interface AdminInvoiceList {
  items: AdminInvoiceListItem[];
  total: number;
}

export interface AdminInvoiceLine {
  id: string;
  position: number;
  description: string;
  quantity: string;
  unit_label: string | null;
  unit_price_minor: number;
  vat_rate_percent: string;
  line_subtotal_minor: number;
  line_vat_minor: number;
  line_total_minor: number;
}

export interface AdminInvoiceAuditEntry {
  id: string;
  event: string;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AdminInvoiceDetail {
  id: string;
  organization_id: string;
  organization_name: string;
  subscription_id: string | null;
  charge_id: string | null;
  number: string;
  variable_symbol: string;
  kind: AdminInvoiceKind;
  status: AdminInvoiceStatus;
  related_invoice_id: string | null;
  issued_at: string;
  taxable_supply_date: string;
  due_at: string;
  paid_at: string | null;
  issuer_name: string;
  issuer_address: string;
  issuer_ico: string;
  issuer_dic: string | null;
  issuer_iban: string;
  issuer_account_domestic: string | null;
  issuer_register_text: string;
  issuer_is_vat_payer: boolean;
  customer_name: string;
  customer_address: string;
  customer_ico: string | null;
  customer_dic: string | null;
  customer_email: string | null;
  currency: string;
  subtotal_minor: number;
  vat_amount_minor: number;
  total_minor: number;
  vat_rate_percent: string;
  payment_method: string;
  note: string | null;
  sent_at: string | null;
  sent_to_email: string | null;
  pdf_object_key: string | null;
  pdf_sha256: string | null;
  pdf_size_bytes: number | null;
  isdoc_object_key: string | null;
  isdoc_sha256: string | null;
  lines: AdminInvoiceLine[];
  audit_log: AdminInvoiceAuditEntry[];
}

export interface AdminInvoiceFilters {
  year?: number;
  status?: AdminInvoiceStatus[];
  kind?: AdminInvoiceKind;
  org_id?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
}

const PAGE_SIZE = 50;

function buildFilterParams(filters: AdminInvoiceFilters, offset: number): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (filters.year != null) params.set("year", String(filters.year));
  if (filters.kind != null) params.set("kind", filters.kind);
  if (filters.org_id != null) params.set("org_id", filters.org_id);
  if (filters.date_from != null) params.set("date_from", filters.date_from);
  if (filters.date_to != null) params.set("date_to", filters.date_to);
  if (filters.q) params.set("q", filters.q);
  // status repeats — append each value
  (filters.status ?? []).forEach((s) => params.append("status", s));
  return params;
}

export function useAdminInvoiceList(filters: AdminInvoiceFilters, offset = 0) {
  const { accessToken } = useAuth();
  return useQuery<AdminInvoiceList | null>({
    queryKey: ["admin", "invoices", filters, offset],
    enabled: !!accessToken,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        const params = buildFilterParams(filters, offset);
        return await apiFetch<AdminInvoiceList>(`/api/v1/admin/invoices?${params.toString()}`, {
          token: accessToken,
        });
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

export function useAdminInvoiceDetail(invoiceId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<AdminInvoiceDetail | null>({
    queryKey: ["admin", "invoice-detail", invoiceId],
    enabled: !!accessToken && !!invoiceId,
    staleTime: 5 * 1000,
    queryFn: async () => {
      if (!invoiceId) return null;
      return await apiFetch<AdminInvoiceDetail>(`/api/v1/admin/invoices/${invoiceId}`, {
        token: accessToken,
      });
    },
  });
}

function useInvoiceAction<TBody extends Record<string, unknown>>(endpoint: (id: string) => string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, body }: { invoiceId: string; body: TBody }) =>
      apiFetch<AdminInvoiceDetail>(endpoint(invoiceId), {
        method: "POST",
        token: accessToken,
        body,
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
      void qc.setQueryData(["admin", "invoice-detail", data.id], data);
    },
  });
}

export function useMarkInvoicePaid() {
  return useInvoiceAction<{ paid_at: string | null }>(
    (id) => `/api/v1/admin/invoices/${id}/mark-paid`,
  );
}

export function useVoidInvoice() {
  return useInvoiceAction<{ reason: string }>((id) => `/api/v1/admin/invoices/${id}/void`);
}

export function useSendInvoice() {
  return useInvoiceAction<{ override_to: string | null }>(
    (id) => `/api/v1/admin/invoices/${id}/send`,
  );
}

export interface ManualLineDraft {
  description: string;
  quantity: string;
  unit_price_minor: number;
  unit_label: string | null;
  vat_rate_percent: string | null;
}

export interface ManualInvoiceDraft {
  org_id: string;
  lines: ManualLineDraft[];
  note: string | null;
  taxable_supply_date: string | null;
  due_at: string | null;
  link_subscription: boolean;
}

export function useIssueManualInvoice() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ManualInvoiceDraft) =>
      apiFetch<AdminInvoiceDetail>("/api/v1/admin/invoices/manual", {
        method: "POST",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
      qc.setQueryData(["admin", "invoice-detail", data.id], data);
    },
  });
}

export interface CreditNoteLineDraft {
  description: string;
  quantity: string;
  unit_price_minor: number;
  unit_label: string | null;
  vat_rate_percent: string | null;
}

export interface CreditNoteDraft {
  reason: string;
  lines: CreditNoteLineDraft[];
}

export function useIssueCreditNote(originalInvoiceId: string | null) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreditNoteDraft) => {
      if (!originalInvoiceId) throw new Error("originalInvoiceId is required");
      return apiFetch<AdminInvoiceDetail>(
        `/api/v1/admin/invoices/${originalInvoiceId}/credit-note`,
        {
          method: "POST",
          token: accessToken,
          body: body as unknown as Record<string, unknown>,
        },
      );
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
      qc.setQueryData(["admin", "invoice-detail", data.id], data);
    },
  });
}
