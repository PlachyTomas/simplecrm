import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/useAuth";
import { OrgBillingFields } from "@/components/billing/OrgBillingFields";
import {
  billingFormFromOrg,
  billingFormToPayload,
  emptyBillingForm,
  isBillingFormValid,
  type BillingFormState,
} from "@/components/billing/orgBillingForm";
import { PriceDisplay } from "@/components/billing/PriceDisplay";
import { RecurringPaymentConsent } from "@/components/billing/RecurringPaymentConsent";
import { useBillingSummary } from "@/components/billing/useBillingSummary";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { usePublicPlans } from "@/components/billing/usePublicPlans";
import {
  billingErrorCode,
  billingErrorMessage,
  useCancelSubscription,
  useInitialPaymentInit,
  useInvoices,
  useReactivateSubscription,
  type ChargeOut,
} from "@/components/billing/usePayments";
import {
  useDownloadTaxInvoicePdf,
  useTaxInvoices,
  type TaxInvoiceOut,
} from "@/components/billing/useTaxInvoices";
import { apiFetch } from "@/lib/api";
import { formatMoneyMinor } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { useModalDialog } from "@/lib/useModalDialog";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

import {
  enterpriseMailto,
  SUPPORT_MAILTO,
  formatCsDate,
  getStatusPill,
  planDisplayName,
  planInterval,
  type PlanCode,
  type SubscriptionOut,
} from "./billingShared";

type OrganizationOut = components["schemas"]["OrganizationOut"];

export function BillingSection() {
  const { t } = useTranslation("billing");
  const subQuery = useCurrentSubscription();
  const summaryQuery = useBillingSummary();
  const sub = subQuery.data;
  const summary = summaryQuery.data;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalPreselect, setModalPreselect] = useState<PlanCode | null>(null);

  function openModal(preselect: PlanCode | null = null) {
    setModalPreselect(preselect);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setModalPreselect(null);
  }

  if (subQuery.isPending) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
        {t("billingSection.loading")}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <CurrentPlanCard sub={sub} onChangePlan={() => openModal(null)} />
      <BillingDetailsCard
        sub={sub}
        summary={summary}
        onSwitchToAnnual={() => openModal("annual")}
      />
      <TaxInvoicesCard />
      <PaymentsCard />
      <CancelSubscriptionCard sub={sub} />
      {modalOpen ? <ChoosePlanModal preselect={modalPreselect} onClose={closeModal} /> : null}
    </div>
  );
}

/**
 * Renders the "paid through" date range for the current subscription.
 * Trialing → headingTrial: start – end; active/past_due → headingDefault: start – end
 * with a renewal hint; canceled → headingCanceled: end; pending_activation
 * → waiting copy already handled by the parent so we render nothing.
 * Comp + enterprise opt out at the call site.
 */
function PaidThroughBlock({ sub }: { sub: SubscriptionOut | null | undefined }) {
  const { t } = useTranslation("billing");
  const locale = useLocale();
  if (!sub) return null;
  if (sub.is_comp) return null;
  if (sub.plan?.code === "enterprise") return null;
  if (sub.status === "pending_activation") return null;

  const start = sub.current_period_starts_at ?? sub.started_at;
  const end = sub.current_period_ends_at;
  const startLabel = formatCsDate(start, locale);
  const endLabel = formatCsDate(end, locale);
  if (!endLabel) return null;

  const isTrial = sub.status === "trialing";
  const isActive = sub.status === "active";
  const isPastDue = sub.status === "past_due";
  const isCanceled = sub.status === "canceled";

  const heading = isTrial
    ? t("paidThroughBlock.headingTrial")
    : isCanceled
      ? t("paidThroughBlock.headingCanceled")
      : t("paidThroughBlock.headingDefault");

  return (
    <div
      data-testid="paid-through-block"
      className="mt-4 rounded-md border border-border-subtle bg-surface-overlay p-4 text-sm"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{heading}</p>
      <p className="mt-1 tabular-nums text-text-primary">
        {isCanceled ? (
          <span className="font-medium">{endLabel}</span>
        ) : (
          <>
            <span className="font-medium">{startLabel ?? "—"}</span>
            <span className="mx-2 text-text-tertiary">–</span>
            <span className="font-medium">{endLabel}</span>
          </>
        )}
      </p>
      {isTrial ? (
        <p className="mt-2 text-xs text-text-tertiary">{t("paidThroughBlock.trialHint")}</p>
      ) : isActive ? (
        <p className="mt-2 text-xs text-text-tertiary">{t("paidThroughBlock.activeHint")}</p>
      ) : isPastDue ? (
        <p className="mt-2 text-xs text-warning">{t("paidThroughBlock.pastDueHint")}</p>
      ) : isCanceled ? (
        <p className="mt-2 text-xs text-text-tertiary">{t("paidThroughBlock.canceledHint")}</p>
      ) : null}
    </div>
  );
}

interface CurrentPlanCardProps {
  sub: SubscriptionOut | null | undefined;
  onChangePlan: () => void;
}

function CurrentPlanCard({ sub, onChangePlan }: CurrentPlanCardProps) {
  const { t } = useTranslation("billing");
  const locale = useLocale();
  const pill = getStatusPill(sub, t);
  const planName = planDisplayName(sub, t);
  const isComp = !!sub?.is_comp;
  const isEnterprise = sub?.plan?.code === "enterprise";
  const showChangePlan =
    !isComp && !isEnterprise && (sub?.status === "trialing" || sub?.status === "past_due");
  const showContactSupport =
    !isComp && !isEnterprise && (sub?.status === "active" || sub?.status === "canceled");
  const effective = sub?.effective_price_per_user_minor ?? null;
  // Show the per-user price for standard paid plans only. Skip trial
  // (price=0 there is a placeholder, not a real bill), pending_activation
  // (showing the chosen price before activation is misleading), comp (no
  // bill), and enterprise (the override price is already rendered inline
  // in the enterprise block — avoid the duplicate).
  const showPrice =
    !isComp &&
    !isEnterprise &&
    sub?.status !== "pending_activation" &&
    sub?.status !== "trialing" &&
    effective !== null &&
    effective > 0;

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("currentPlanCard.heading")}</h2>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-base font-medium text-text-primary">{planName}</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            pill.className,
          )}
        >
          {pill.label}
        </span>
      </div>

      <PaidThroughBlock sub={sub} />

      {showPrice && effective !== null ? (
        <div className="mt-4">
          <PriceDisplay baseMinor={effective} interval={planInterval(sub)} size="md" hideVatLine />
        </div>
      ) : null}

      {sub?.status === "pending_activation" ? (
        <p className="mt-4 text-sm text-text-secondary">
          {t("currentPlanCard.pendingActivation", { planName })}
        </p>
      ) : null}

      {isComp ? (
        <p className="mt-4 text-sm text-text-secondary">{t("currentPlanCard.compNotice")}</p>
      ) : null}

      {isEnterprise ? (
        <div className="mt-4 space-y-3">
          {effective !== null ? (
            <p className="text-sm text-text-secondary">
              {t("currentPlanCard.enterprisePricePrefix")}{" "}
              <span className="font-medium text-text-primary">
                {formatMoneyMinor(effective, "CZK", locale)}
              </span>{" "}
              {t("currentPlanCard.enterprisePriceSuffix")}
            </p>
          ) : null}
          <a
            href={enterpriseMailto(t)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            {t("currentPlanCard.contactSalesCta")}
          </a>
        </div>
      ) : null}

      {showChangePlan ? (
        <button
          type="button"
          onClick={onChangePlan}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          {t("currentPlanCard.changePlanCta")}
        </button>
      ) : null}

      {showContactSupport ? (
        <a
          href={SUPPORT_MAILTO}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
        >
          {t("currentPlanCard.contactSupportCta")}
        </a>
      ) : null}
    </section>
  );
}

interface BillingDetailsCardProps {
  sub: SubscriptionOut | null | undefined;
  summary: components["schemas"]["BillingSummary"] | null | undefined;
  onSwitchToAnnual: () => void;
}

function BillingDetailsCard({ sub, summary, onSwitchToAnnual }: BillingDetailsCardProps) {
  const { t } = useTranslation("billing");
  const locale = useLocale();
  if (!sub) return null;
  if (sub.is_comp) return null;
  if (sub.plan?.code === "enterprise") return null;
  // Only show real billing math when there's an actual bill to discuss —
  // trialing/pending/canceled have no current charge.
  if (sub.status !== "active" && sub.status !== "past_due") return null;
  if (!summary) return null;
  if (summary.effective_price_per_user_minor == null || summary.monthly_total_minor == null) {
    return null;
  }

  const interval = planInterval(sub);
  const isAnnual = interval === "annual";
  const periodLabel = isAnnual
    ? t("billingDetailsCard.periodYear")
    : t("billingDetailsCard.periodMonth");
  // Bill total is computed against the contracted seat_count, not the
  // live active-user count — so a queued downsize that takes effect next
  // period still bills the contracted amount this period, and a
  // headcount that's below seats still pays for what was bought.
  const billedSeats = sub.seat_count;
  const perUserMinor = summary.effective_price_per_user_minor;
  const monthlyContractTotal = perUserMinor * billedSeats;
  const annualContractTotal = perUserMinor * 12 * billedSeats;
  const totalMinor = isAnnual ? annualContractTotal : monthlyContractTotal;
  const renewalDate = formatCsDate(sub.current_period_ends_at, locale);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("billingDetailsCard.heading")}</h2>

      <p className="mt-4 text-sm text-text-secondary">
        {t("billingSection.userCount", { count: billedSeats })} ×{" "}
        <span className="font-medium text-text-primary">
          {formatMoneyMinor(perUserMinor, "CZK", locale)}
        </span>{" "}
        ={" "}
        <span className="font-semibold text-text-primary">
          {formatMoneyMinor(totalMinor, "CZK", locale)}
        </span>{" "}
        / {periodLabel}
      </p>

      {!isAnnual && summary.savings_minor != null && summary.savings_minor > 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          {t("billingDetailsCard.monthlySavingsPrefix")}{" "}
          <span className="font-semibold text-text-primary">
            {formatMoneyMinor(summary.savings_minor, "CZK", locale)}
          </span>{" "}
          {t("billingDetailsCard.monthlySavingsSuffix")}{" "}
          <button
            type="button"
            onClick={onSwitchToAnnual}
            className="text-accent underline-offset-2 hover:underline"
          >
            {t("billingDetailsCard.switchToAnnualCta")}
          </button>
        </p>
      ) : null}

      {isAnnual && summary.savings_minor != null && summary.savings_minor > 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          {t("billingDetailsCard.annualSavingsPrefix")}{" "}
          <span className="font-semibold text-text-primary">
            {formatMoneyMinor(summary.savings_minor, "CZK", locale)}
          </span>{" "}
          {t("billingDetailsCard.annualSavingsSuffix")}
        </p>
      ) : null}

      {renewalDate && (sub.status === "active" || sub.status === "past_due") ? (
        <p className="mt-3 text-sm text-text-tertiary">
          {t("billingDetailsCard.renewalPrefix")}{" "}
          <span className="text-text-primary">{renewalDate}</span>
        </p>
      ) : null}
    </section>
  );
}

const PAYMENT_KIND_LABEL: Record<ChargeOut["kind"], ParseKeys<"billing">> = {
  initial: "paymentsCard.kind.initial",
  renewal: "paymentsCard.kind.renewal",
  seat_upgrade: "paymentsCard.kind.seat_upgrade",
};

const PAYMENT_STATUS_PILL: Record<
  ChargeOut["status"],
  { labelKey: ParseKeys<"billing">; className: string }
> = {
  paid: { labelKey: "paymentsCard.status.paid", className: "bg-success-subtle text-success" },
  pending: { labelKey: "paymentsCard.status.pending", className: "bg-warning-subtle text-warning" },
  failed: { labelKey: "paymentsCard.status.failed", className: "bg-danger-subtle text-danger" },
  refunded: { labelKey: "paymentsCard.status.refunded", className: "bg-info-subtle text-info" },
};

function PaymentsCard() {
  const { t } = useTranslation("billing");
  const payments = useInvoices();
  const locale = useLocale();

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("paymentsCard.heading")}</h2>
      <p className="mt-1 text-xs text-text-tertiary">{t("paymentsCard.subtitle")}</p>
      {payments.isPending ? (
        <p className="mt-3 text-sm text-text-tertiary">{t("billingSection.loading")}</p>
      ) : payments.isError ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {t("paymentsCard.loadError")}
        </p>
      ) : !payments.data || payments.data.items.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">{t("paymentsCard.empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {payments.data.items.map((row) => {
            const pill = PAYMENT_STATUS_PILL[row.status];
            const created = formatCsDate(row.created_at, locale) ?? "";
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {t(PAYMENT_KIND_LABEL[row.kind])}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {created}
                    {row.seats != null
                      ? ` · ${t("billingSection.userCount", { count: row.seats })}`
                      : ""}
                    {row.failure_reason ? ` · ${row.failure_reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-text-primary">
                    {formatMoneyMinor(row.amount_minor, "CZK", locale)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      pill.className,
                    )}
                  >
                    {t(pill.labelKey)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const TAX_INVOICE_KIND_LABEL: Record<TaxInvoiceOut["kind"], ParseKeys<"billing">> = {
  invoice: "taxInvoicesCard.kind.invoice",
  credit_note: "taxInvoicesCard.kind.credit_note",
  proforma: "taxInvoicesCard.kind.proforma",
};

const TAX_INVOICE_STATUS_PILL: Record<
  TaxInvoiceOut["status"],
  { labelKey: ParseKeys<"billing">; className: string }
> = {
  draft: {
    labelKey: "taxInvoicesCard.status.draft",
    className: "bg-bg-elevated text-text-secondary",
  },
  issued: { labelKey: "taxInvoicesCard.status.issued", className: "bg-info-subtle text-info" },
  paid: { labelKey: "taxInvoicesCard.status.paid", className: "bg-success-subtle text-success" },
  overdue: {
    labelKey: "taxInvoicesCard.status.overdue",
    className: "bg-danger-subtle text-danger",
  },
  voided: {
    labelKey: "taxInvoicesCard.status.voided",
    className: "bg-bg-elevated text-text-tertiary line-through",
  },
};

function TaxInvoicesCard() {
  const { t } = useTranslation("billing");
  const invoices = useTaxInvoices();
  const downloadPdf = useDownloadTaxInvoicePdf();
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();

  function onDownload(row: TaxInvoiceOut) {
    setError(null);
    downloadPdf.mutate(
      { id: row.id, number: row.number },
      {
        onError: () => setError(t("taxInvoicesCard.downloadError")),
      },
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("taxInvoicesCard.heading")}</h2>
      <p className="mt-1 text-xs text-text-tertiary">{t("taxInvoicesCard.subtitle")}</p>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger/40 bg-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {invoices.isPending ? (
        <p className="mt-3 text-sm text-text-tertiary">{t("billingSection.loading")}</p>
      ) : invoices.isError ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {t("taxInvoicesCard.loadError")}
        </p>
      ) : !invoices.data || invoices.data.items.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">{t("taxInvoicesCard.empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {invoices.data.items.map((inv) => {
            const pill = TAX_INVOICE_STATUS_PILL[inv.status];
            const issued = formatCsDate(inv.issued_at, locale) ?? "";
            const due = formatCsDate(inv.due_at, locale) ?? "";
            return (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {t(TAX_INVOICE_KIND_LABEL[inv.kind])} {inv.number}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {t("taxInvoicesCard.issuedDue", { issued, due })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-text-primary">
                    {formatMoneyMinor(inv.total_minor, "CZK", locale)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      pill.className,
                    )}
                  >
                    {t(pill.labelKey)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDownload(inv)}
                    disabled={downloadPdf.isPending}
                    aria-label={t("taxInvoicesCard.downloadAriaLabel", { number: inv.number })}
                    className="hover:bg-bg-elevated inline-flex items-center justify-center rounded-md border border-border bg-bg p-1.5 text-text-secondary transition hover:text-text-primary disabled:cursor-wait disabled:opacity-50"
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface CancelSubscriptionCardProps {
  sub: SubscriptionOut | null | undefined;
}

function CancelSubscriptionCard({ sub }: CancelSubscriptionCardProps) {
  const { t } = useTranslation("billing");
  const cancel = useCancelSubscription();
  const reactivate = useReactivateSubscription();
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Hide entirely for orgs that can't self-cancel: comp + enterprise go
  // through the founder, trial doesn't have an active subscription to
  // cancel, and an already-canceled-and-period-expired sub can't be
  // reactivated anyway.
  if (!sub) return null;
  if (sub.is_comp) return null;
  if (sub.plan?.code === "enterprise") return null;
  if (sub.status === "trialing" || sub.status === "pending_activation") return null;

  // Distinguishes "already self-cancelled, can still un-cancel" from
  // "active, can cancel". The backend uses canceled_at != null + status
  // 'active' as the "scheduled to cancel at period end" signal.
  const isScheduledForCancel = sub.canceled_at != null && sub.status === "active";
  const endsAt = formatCsDate(sub.current_period_ends_at, locale);

  if (isScheduledForCancel) {
    return (
      <section className="rounded-lg border border-warning/40 bg-warning-subtle p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("cancelSubscriptionCard.scheduledHeading")}
        </h2>
        <p className="mt-3 text-sm text-text-primary">
          {endsAt
            ? t("cancelSubscriptionCard.scheduledBodyWithDate", { endsAt })
            : t("cancelSubscriptionCard.scheduledBodyDefault")}
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-danger/40 bg-bg px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={reactivate.isPending}
          onClick={() => {
            setError(null);
            reactivate.mutate(undefined, {
              onError: () => setError(t("cancelSubscriptionCard.reactivateError")),
            });
          }}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reactivate.isPending
            ? t("cancelSubscriptionCard.reactivating")
            : t("cancelSubscriptionCard.reactivateCta")}
        </button>
      </section>
    );
  }

  if (sub.status !== "active" && sub.status !== "past_due") return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("cancelSubscriptionCard.heading")}</h2>
      <p className="mt-3 text-sm text-text-secondary">
        {endsAt
          ? t("cancelSubscriptionCard.bodyWithDate", { endsAt })
          : t("cancelSubscriptionCard.bodyWithoutDate")}
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setError(null);
          }}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-danger bg-surface px-5 text-sm font-medium text-danger transition-colors duration-fast hover:bg-danger-subtle"
        >
          {t("cancelSubscriptionCard.cancelCta")}
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-md border border-danger/40 bg-danger-subtle p-4">
          <p className="text-sm font-medium text-text-primary">
            {t("cancelSubscriptionCard.confirmHeading")}
          </p>
          <label className="block text-xs font-medium text-text-tertiary">
            {t("cancelSubscriptionCard.reasonLabel")}
            <textarea
              rows={2}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => {
                setError(null);
                cancel.mutate(
                  { reason: reason.trim() || undefined },
                  {
                    onSuccess: () => setConfirming(false),
                    onError: () => setError(t("cancelSubscriptionCard.cancelError")),
                  },
                );
              }}
              className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancel.isPending
                ? t("cancelSubscriptionCard.canceling")
                : t("cancelSubscriptionCard.confirmCancel")}
            </button>
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              {t("cancelSubscriptionCard.keepSubscription")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

interface ChoosePlanModalProps {
  preselect: PlanCode | null;
  onClose: () => void;
}

function ChoosePlanModal({ preselect, onClose }: ChoosePlanModalProps) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose);
  const { t } = useTranslation("billing");
  const locale = useLocale();
  const { accessToken } = useAuth();
  const plans = usePublicPlans();
  const summary = useBillingSummary();
  const [selected, setSelected] = useState<PlanCode | null>(preselect);
  const [recurringConsent, setRecurringConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Backend requires complete billing details before initial-payment-init
  // (422 billing_details_required otherwise). Fetch the org to prefill the
  // form (and seed `savedIco` so hydrating a saved IČO doesn't re-trigger
  // ARES), then keep local form state in sync.
  const orgQuery = useQuery<OrganizationOut>({
    queryKey: ["organizations", "current"],
    enabled: !!accessToken,
    queryFn: () => apiFetch("/api/v1/organizations/current", { token: accessToken }),
  });
  const [billing, setBilling] = useState<BillingFormState>(emptyBillingForm);
  useEffect(() => {
    if (orgQuery.data) setBilling(billingFormFromOrg(orgQuery.data));
  }, [orgQuery.data]);

  const monthlyPlan = plans.data?.find((p) => p.code === "monthly");
  const annualPlan = plans.data?.find((p) => p.code === "annual");

  // Routes through the new ComGate-backed initial-payment-init endpoint;
  // returns a hosted-page redirect URL that we send the customer to.
  // The legacy choose-plan endpoint still exists as a deprecated
  // fallback but is no longer wired here.
  const initPayment = useInitialPaymentInit();
  const submitting = initPayment.isPending || saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected || submitting || !accessToken) return;
    // Visa/Mastercard + Comgate Card-on-File rule — the customer must
    // explicitly accept the recurring-charge terms at the same click that
    // initiates the first charge. Static T&Cs page is not enough; this
    // checkbox is the moment of consent for risk-review purposes.
    if (!recurringConsent) {
      setError(t("choosePlanModal.consentRequiredError"));
      return;
    }
    if (!isBillingFormValid(billing)) {
      setError(t("choosePlanModal.billingDetailsRequiredError"));
      return;
    }
    setError(null);
    // Persist billing first — the backend rejects initial-payment-init with
    // 422 billing_details_required until the org row carries complete details.
    setSaving(true);
    try {
      await apiFetch("/api/v1/organizations/current", {
        method: "PUT",
        token: accessToken,
        body: billingFormToPayload(billing),
      });
    } catch {
      setSaving(false);
      setError(t("choosePlanModal.billingSaveError"));
      return;
    }
    setSaving(false);
    initPayment.mutate(
      { plan_code: selected },
      {
        onSuccess: (init) => {
          window.location.assign(init.redirect_url);
        },
        onError: (err) => {
          setError(billingErrorMessage(billingErrorCode(err), t));
        },
      },
    );
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="choose-plan-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 py-8 backdrop-blur-md"
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-lg sm:p-8"
      >
        <h2 id="choose-plan-title" className="text-xl font-semibold text-text-primary">
          {t("choosePlanModal.heading")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{t("choosePlanModal.intro")}</p>

        <div
          role="radiogroup"
          aria-label={t("choosePlanModal.planRadioGroupLabel")}
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <PlanModalCard
            code="monthly"
            title={t("choosePlanModal.monthlyTitle")}
            priceMinor={monthlyPlan?.price_per_user_minor ?? null}
            priceInterval="monthly"
            selected={selected === "monthly"}
            disabled={submitting}
            onSelect={() => setSelected("monthly")}
          />
          <PlanModalCard
            code="annual"
            title={t("choosePlanModal.annualTitle")}
            priceMinor={annualPlan?.price_per_user_minor ?? null}
            priceInterval="annual"
            selected={selected === "annual"}
            disabled={submitting}
            onSelect={() => setSelected("annual")}
            badge={t("choosePlanModal.annualBadge")}
            caption={
              summary.data && summary.data.savings_minor != null ? (
                <p className="text-sm text-text-secondary">
                  {t("choosePlanModal.annualSavingsIntro", { count: summary.data.user_count })}{" "}
                  <span className="font-semibold text-text-primary">
                    {formatMoneyMinor(summary.data.savings_minor, "CZK", locale)}
                  </span>{" "}
                  {t("choosePlanModal.annualSavingsSuffix")}
                </p>
              ) : null
            }
          />
        </div>

        <div className="mt-6">
          <RecurringPaymentConsent
            selected={selected}
            checked={recurringConsent}
            onChange={(v) => {
              setRecurringConsent(v);
              if (v) setError(null);
            }}
            disabled={submitting}
          />
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("choosePlanModal.billingDetailsHeading")}
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            {t("choosePlanModal.billingDetailsHint")}
          </p>
          <div className="mt-4">
            <OrgBillingFields
              value={billing}
              onChange={setBilling}
              orgName={orgQuery.data?.name ?? ""}
              savedIco={orgQuery.data?.ico ?? ""}
            />
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-md bg-transparent px-4 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {t("choosePlanModal.cancelCta")}
          </button>
          <button
            type="submit"
            disabled={!selected || submitting || !recurringConsent || !isBillingFormValid(billing)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t("choosePlanModal.submitting") : t("choosePlanModal.submitCta")}
          </button>
        </div>
      </form>
    </div>
  );
}

interface PlanModalCardProps {
  code: PlanCode;
  title: string;
  priceMinor: number | null;
  priceInterval: "monthly" | "annual";
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  badge?: string;
  caption?: React.ReactNode;
}

function PlanModalCard({
  code,
  title,
  priceMinor,
  priceInterval,
  selected,
  disabled,
  onSelect,
  badge,
  caption,
}: PlanModalCardProps) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={disabled ? -1 : 0}
      data-plan-code={code}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-lg border-2 bg-surface p-5 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        selected ? "border-accent shadow-md" : "border-border hover:border-text-tertiary",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {badge ? (
        <span className="absolute -top-3 right-4 rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-text-on-brand-accent">
          {badge}
        </span>
      ) : null}
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <div className="mt-3">
        {priceMinor != null ? (
          <PriceDisplay baseMinor={priceMinor} interval={priceInterval} size="lg" hideVatLine />
        ) : (
          <div aria-hidden className="h-9 w-32 animate-pulse rounded bg-surface-overlay" />
        )}
      </div>
      {caption ? <div className="mt-3">{caption}</div> : null}
    </div>
  );
}
