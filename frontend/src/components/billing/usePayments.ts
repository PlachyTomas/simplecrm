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
import type { TFunction } from "i18next";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";

export interface PaymentInitOut {
  redirect_url: string;
  charge_id: string;
  amount_minor: number;
  currency: string;
}

export interface SeatChangeInitOut {
  status: "accepted";
  charge_id: string;
  amount_minor: number;
  currency: string;
}

// `Charge` is a ComGate charge attempt — initial activation, recurring
// renewal, or mid-period seat upgrade. The Czech-law tax-invoice document
// (ships in a later commit) is a separate concept with its own type.
export type ChargeKind = "initial" | "renewal" | "seat_upgrade";
export type ChargeStatus = "pending" | "paid" | "failed" | "refunded";

export interface ChargeOut {
  id: string;
  kind: ChargeKind;
  amount_minor: number;
  currency: string;
  status: ChargeStatus;
  seats: number | null;
  period_starts_at: string | null;
  period_ends_at: string | null;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface ChargeList {
  items: ChargeOut[];
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

// Hook name kept as `useInvoices` (and queryKey "invoices") because the
// customer-facing UI label is "Faktury" — that label still makes sense
// for the user. The underlying type renamed to `ChargeList` because
// these rows are ComGate charges, not legal invoice documents.
export function useInvoices() {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ["invoices", "current"],
    queryFn: () =>
      apiFetch<ChargeList>("/api/v1/payments/invoices?limit=50", {
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

// Structured error codes the /payments/* endpoints raise via
// `HTTPException(detail={"code": "…"})` — see backend/app/api/v1/payments.py.
// Each has a matching `errors.<code>` key in locales/{cs,en}/billing.json;
// any other code (or none at all) falls back to `errors.generic`.
const BILLING_ERROR_CODES = [
  "gateway_unavailable",
  "too_many_attempts",
  "gateway_declined",
  "already_active",
  "payment_in_progress",
  "billing_details_required",
  "not_active",
  "not_an_upgrade",
  "no_payment_method",
] as const;
type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

function isBillingErrorCode(code: unknown): code is BillingErrorCode {
  return typeof code === "string" && (BILLING_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Pulls the structured `{code}` out of a payments-endpoint error, if
 * present. Returns `undefined` for non-`ApiError`s, non-JSON error
 * bodies (e.g. a plain-text 5xx), or bodies without a recognized code —
 * `billingErrorMessage` maps all of those to the generic fallback.
 */
export function billingErrorCode(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const body = err.body as { detail?: { code?: unknown } } | null | undefined;
  const code = body?.detail?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Central cs/en mapping for the /payments/* structured error codes.
 * Unknown or missing codes resolve to `errors.generic` rather than
 * leaking a raw code or blank message to the customer.
 */
export function billingErrorMessage(
  code: string | null | undefined,
  t: TFunction<"billing">,
): string {
  return isBillingErrorCode(code) ? t(`errors.${code}`) : t("errors.generic");
}
