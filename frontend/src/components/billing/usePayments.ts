/**
 * React Query hooks + helpers for the customer-facing /payments
 * endpoints introduced by the ComGate billing rewrite.
 *
 * The endpoints return ComGate hosted-page redirect URLs; the frontend
 * is expected to `window.location` to that URL. The webhook lands the
 * actual billing-state mutation server-side; the customer is bounced
 * back to /app/billing/return where this app polls /subscription for
 * the new state.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";

export interface PaymentInitOut {
  redirect_url: string;
  invoice_id: string;
  amount_minor: number;
  currency: string;
}

export interface SeatChangeInitOut {
  status: "accepted";
  invoice_id: string;
  amount_minor: number;
  currency: string;
}

export type InvoiceKind = "initial" | "renewal" | "seat_upgrade";
export type InvoiceStatus = "pending" | "paid" | "failed" | "refunded";

export interface InvoiceOut {
  id: string;
  kind: InvoiceKind;
  amount_minor: number;
  currency: string;
  status: InvoiceStatus;
  seats: number | null;
  period_starts_at: string | null;
  period_ends_at: string | null;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface InvoiceList {
  items: InvoiceOut[];
  total: number;
}

/**
 * Kicks off the customer's first paid plan via ComGate.
 * Replaces the old `choose-plan` → bank-transfer-email path.
 */
export function useInitialPaymentInit() {
  const { accessToken } = useAuth();
  return useMutation<PaymentInitOut, Error, { plan_code: "monthly" | "annual" }>({
    mutationFn: (body) =>
      apiFetch<PaymentInitOut>("/api/v1/payments/initial-payment-init", {
        method: "POST",
        token: accessToken,
        body,
      }),
  });
}

/**
 * Triggers a prorated seat-upgrade charge via ComGate. Used when
 * the seat-count PUT returns 402 with code=seat_upgrade_payment_required.
 */
export function useSeatChangeInit() {
  const { accessToken } = useAuth();
  return useMutation<SeatChangeInitOut, Error, { seat_count: number }>({
    mutationFn: (body) =>
      apiFetch<SeatChangeInitOut>("/api/v1/payments/seat-change-init", {
        method: "POST",
        token: accessToken,
        body,
      }),
  });
}

export function useInvoices() {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ["invoices", "current"],
    queryFn: () =>
      apiFetch<InvoiceList>("/api/v1/payments/invoices?limit=50", {
        token: accessToken,
      }),
    staleTime: 30_000,
    enabled: accessToken != null,
  });
}

export function useCancelSubscription() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<unknown, Error, { reason?: string }>({
    mutationFn: (body) =>
      apiFetch("/api/v1/organizations/current/subscription/cancel", {
        method: "POST",
        token: accessToken,
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
      void qc.invalidateQueries({ queryKey: ["invoices", "current"] });
    },
  });
}

export function useReactivateSubscription() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/organizations/current/subscription/reactivate", {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
    },
  });
}

/**
 * Detects the 402 response from PUT /subscription/seat-count that says
 * "you need to pay first". Returns the parsed detail so callers can
 * branch on the `redirect_endpoint`.
 */
export interface SeatUpgradePaymentRequired {
  code: "seat_upgrade_payment_required";
  detail: string;
  contracted_seat_count: number;
  redirect_endpoint: string;
}

export function isSeatUpgradePaymentRequired(
  err: unknown,
): err is { status: number; body: { detail: SeatUpgradePaymentRequired } } {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { status?: number; body?: { detail?: { code?: string } } };
  return e.status === 402 && e.body?.detail?.code === "seat_upgrade_payment_required";
}
