/**
 * React Query hooks for the customer-facing tax-invoice endpoints.
 *
 * These rows are the legal Czech-law tax-invoice documents (faktury) —
 * distinct from `usePayments.ChargeOut` which represents ComGate
 * charge attempts (platby). The user surfaces both: invoices in
 * the "Faktury" section, charges in the "Platby" section.
 */

import { useMutation, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { API_BASE_URL, apiFetch } from "@/lib/api";

export type TaxInvoiceKind = "invoice" | "credit_note" | "proforma";
export type TaxInvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "voided";

export interface TaxInvoiceOut {
  id: string;
  number: string;
  kind: TaxInvoiceKind;
  status: TaxInvoiceStatus;
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  sent_at: string | null;
  currency: string;
  subtotal_minor: number;
  vat_amount_minor: number;
  total_minor: number;
  related_invoice_id: string | null;
}

export interface TaxInvoiceList {
  items: TaxInvoiceOut[];
  total: number;
}

export interface TaxInvoiceLineOut {
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

export interface TaxInvoiceDetailOut extends TaxInvoiceOut {
  customer_name: string;
  customer_address: string;
  customer_ico: string | null;
  customer_dic: string | null;
  taxable_supply_date: string;
  variable_symbol: string;
  payment_method: string;
  note: string | null;
  issuer_iban: string;
  issuer_account_domestic: string | null;
  lines: TaxInvoiceLineOut[];
}

export function useTaxInvoices() {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ["tax-invoices", "current"],
    queryFn: () =>
      apiFetch<TaxInvoiceList>("/api/v1/organizations/current/invoices?limit=50", {
        token: accessToken,
      }),
    staleTime: 30_000,
    enabled: accessToken != null,
  });
}

/**
 * "Stáhnout PDF" hook. Uses raw fetch (not `apiFetch`) because the
 * response is a binary PDF body, not JSON, and we need the blob to
 * hand to a temporary anchor for the browser download.
 */
export function useDownloadTaxInvoicePdf() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: async ({ id, number }: { id: string; number: string }) => {
      const res = await fetch(`${API_BASE_URL}/api/v1/organizations/current/invoices/${id}/pdf`, {
        method: "GET",
        credentials: "include",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (!res.ok) {
        throw new Error(`PDF download failed (${res.status})`);
      }
      const blob = await res.blob();
      triggerDownload(blob, `Faktura-${number}.pdf`);
    },
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
