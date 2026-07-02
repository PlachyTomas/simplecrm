import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/auth/useAuth";
import { formatCzkMinor } from "@/components/billing/format";
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
import { csNoun } from "@/lib/i18n/nouns";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

import {
  ENTERPRISE_MAILTO,
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
        Načítání…
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
 * Trialing → "Zkušební doba: start – end"; active/past_due → "Předplaceno: start – end"
 * with a renewal hint; canceled → "Předplaceno do: end"; pending_activation
 * → waiting copy already handled by the parent so we render nothing.
 * Comp + enterprise opt out at the call site.
 */
function PaidThroughBlock({ sub }: { sub: SubscriptionOut | null | undefined }) {
  if (!sub) return null;
  if (sub.is_comp) return null;
  if (sub.plan?.code === "enterprise") return null;
  if (sub.status === "pending_activation") return null;

  const start = sub.current_period_starts_at ?? sub.started_at;
  const end = sub.current_period_ends_at;
  const startLabel = formatCsDate(start);
  const endLabel = formatCsDate(end);
  if (!endLabel) return null;

  const isTrial = sub.status === "trialing";
  const isActive = sub.status === "active";
  const isPastDue = sub.status === "past_due";
  const isCanceled = sub.status === "canceled";

  const heading = isTrial ? "Zkušební doba" : isCanceled ? "Předplaceno do" : "Předplacené období";

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
        <p className="mt-2 text-xs text-text-tertiary">
          Po skončení zkušebky vám zašleme fakturu se splatností v den ukončení zkoušky. Po úhradě
          se vaše předplatné automaticky aktivuje.
        </p>
      ) : isActive ? (
        <p className="mt-2 text-xs text-text-tertiary">
          Po skončení období se předplatné automaticky obnoví z uložené karty.
        </p>
      ) : isPastDue ? (
        <p className="mt-2 text-xs text-warning">
          Platba se nezdařila. Prodloužení období se opakuje — případně aktualizujte kartu.
        </p>
      ) : isCanceled ? (
        <p className="mt-2 text-xs text-text-tertiary">
          Předplatné je zrušené. Po tomto datu se vaší organizaci zablokuje přístup.
        </p>
      ) : null}
    </div>
  );
}

interface CurrentPlanCardProps {
  sub: SubscriptionOut | null | undefined;
  onChangePlan: () => void;
}

function CurrentPlanCard({ sub, onChangePlan }: CurrentPlanCardProps) {
  const pill = getStatusPill(sub);
  const planName = planDisplayName(sub);
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
      <h2 className="text-lg font-semibold">Aktuální plán</h2>

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
          Vybrali jste plán <span className="font-medium">{planName}</span>. Po připsání platby vás
          aktivujeme do 24 hodin.
        </p>
      ) : null}

      {isComp ? (
        <p className="mt-4 text-sm text-text-secondary">
          Vaše organizace má speciální podmínky. Pro detaily kontaktujte podporu.
        </p>
      ) : null}

      {isEnterprise ? (
        <div className="mt-4 space-y-3">
          {effective !== null ? (
            <p className="text-sm text-text-secondary">
              Vlastní balíček ·{" "}
              <span className="font-medium text-text-primary">{formatCzkMinor(effective)}</span> /
              uživatel / měsíc
            </p>
          ) : null}
          <a
            href={ENTERPRISE_MAILTO}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Kontaktovat obchod
          </a>
        </div>
      ) : null}

      {showChangePlan ? (
        <button
          type="button"
          onClick={onChangePlan}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          Změnit plán
        </button>
      ) : null}

      {showContactSupport ? (
        <a
          href={SUPPORT_MAILTO}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
        >
          Kontaktujte podporu
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
  const periodLabel = isAnnual ? "rok" : "měsíc";
  // Bill total is computed against the contracted seat_count, not the
  // live active-user count — so a queued downsize that takes effect next
  // period still bills the contracted amount this period, and a
  // headcount that's below seats still pays for what was bought.
  const billedSeats = sub.seat_count;
  const perUserMinor = summary.effective_price_per_user_minor;
  const monthlyContractTotal = perUserMinor * billedSeats;
  const annualContractTotal = perUserMinor * 12 * billedSeats;
  const totalMinor = isAnnual ? annualContractTotal : monthlyContractTotal;
  const renewalDate = formatCsDate(sub.current_period_ends_at);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Účtování</h2>

      <p className="mt-4 text-sm text-text-secondary">
        {billedSeats} {csNoun(billedSeats, "uzivatel")} ×{" "}
        <span className="font-medium text-text-primary">{formatCzkMinor(perUserMinor)}</span> ={" "}
        <span className="font-semibold text-text-primary">{formatCzkMinor(totalMinor)}</span> /{" "}
        {periodLabel}
      </p>

      {!isAnnual && summary.savings_minor != null && summary.savings_minor > 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          Pokud byste platili ročně, ušetříte{" "}
          <span className="font-semibold text-text-primary">
            {formatCzkMinor(summary.savings_minor)}
          </span>{" "}
          ročně.{" "}
          <button
            type="button"
            onClick={onSwitchToAnnual}
            className="text-accent underline-offset-2 hover:underline"
          >
            Přejít na roční
          </button>
        </p>
      ) : null}

      {isAnnual && summary.savings_minor != null && summary.savings_minor > 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          Šetříte{" "}
          <span className="font-semibold text-text-primary">
            {formatCzkMinor(summary.savings_minor)}
          </span>{" "}
          oproti měsíčnímu plánu.
        </p>
      ) : null}

      {renewalDate && (sub.status === "active" || sub.status === "past_due") ? (
        <p className="mt-3 text-sm text-text-tertiary">
          Další obnova: <span className="text-text-primary">{renewalDate}</span>
        </p>
      ) : null}
    </section>
  );
}

const PAYMENT_KIND_LABEL: Record<ChargeOut["kind"], string> = {
  initial: "První aktivace",
  renewal: "Obnova",
  seat_upgrade: "Navýšení uživatelů",
};

const PAYMENT_STATUS_PILL: Record<ChargeOut["status"], { label: string; className: string }> = {
  paid: { label: "Zaplaceno", className: "bg-success-subtle text-success" },
  pending: { label: "Čeká", className: "bg-warning-subtle text-warning" },
  failed: { label: "Selhalo", className: "bg-danger-subtle text-danger" },
  refunded: { label: "Vráceno", className: "bg-info-subtle text-info" },
};

function PaymentsCard() {
  const payments = useInvoices();

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Platby</h2>
      <p className="mt-1 text-xs text-text-tertiary">
        Historie platebních pokusů (ComGate). Daňové doklady najdete výše v sekci „Faktury“.
      </p>
      {payments.isPending ? (
        <p className="mt-3 text-sm text-text-tertiary">Načítání…</p>
      ) : payments.isError ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          Platby se nepodařilo načíst.
        </p>
      ) : !payments.data || payments.data.items.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">Platby budou dostupné po první platbě.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {payments.data.items.map((row) => {
            const pill = PAYMENT_STATUS_PILL[row.status];
            const created = formatCsDate(row.created_at) ?? "";
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {PAYMENT_KIND_LABEL[row.kind]}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {created}
                    {row.seats != null ? ` · ${row.seats} ${csNoun(row.seats, "uzivatel")}` : ""}
                    {row.failure_reason ? ` · ${row.failure_reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-text-primary">
                    {formatCzkMinor(row.amount_minor)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      pill.className,
                    )}
                  >
                    {pill.label}
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

const TAX_INVOICE_KIND_LABEL: Record<TaxInvoiceOut["kind"], string> = {
  invoice: "Faktura",
  credit_note: "Dobropis",
  proforma: "Proforma",
};

const TAX_INVOICE_STATUS_PILL: Record<
  TaxInvoiceOut["status"],
  { label: string; className: string }
> = {
  draft: { label: "Koncept", className: "bg-bg-elevated text-text-secondary" },
  issued: { label: "Vystavena", className: "bg-info-subtle text-info" },
  paid: { label: "Zaplacena", className: "bg-success-subtle text-success" },
  overdue: { label: "Po splatnosti", className: "bg-danger-subtle text-danger" },
  voided: { label: "Stornována", className: "bg-bg-elevated text-text-tertiary line-through" },
};

function TaxInvoicesCard() {
  const invoices = useTaxInvoices();
  const downloadPdf = useDownloadTaxInvoicePdf();
  const [error, setError] = useState<string | null>(null);

  function onDownload(row: TaxInvoiceOut) {
    setError(null);
    downloadPdf.mutate(
      { id: row.id, number: row.number },
      {
        onError: () =>
          setError("Stažení PDF se nezdařilo. Zkuste to znovu nebo kontaktujte podporu."),
      },
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Faktury</h2>
      <p className="mt-1 text-xs text-text-tertiary">
        Daňové doklady podle českého zákona. PDF si můžete kdykoli stáhnout pro účetnictví.
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger/40 bg-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {invoices.isPending ? (
        <p className="mt-3 text-sm text-text-tertiary">Načítání…</p>
      ) : invoices.isError ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          Faktury se nepodařilo načíst.
        </p>
      ) : !invoices.data || invoices.data.items.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          Zatím nemáte žádné faktury. Po první platbě tu uvidíte přehled.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {invoices.data.items.map((inv) => {
            const pill = TAX_INVOICE_STATUS_PILL[inv.status];
            const issued = formatCsDate(inv.issued_at) ?? "";
            const due = formatCsDate(inv.due_at) ?? "";
            return (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {TAX_INVOICE_KIND_LABEL[inv.kind]} {inv.number}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    Vystaveno {issued} · Splatnost {due}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-text-primary">
                    {formatCzkMinor(inv.total_minor)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      pill.className,
                    )}
                  >
                    {pill.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDownload(inv)}
                    disabled={downloadPdf.isPending}
                    aria-label={`Stáhnout PDF faktury ${inv.number}`}
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
  const cancel = useCancelSubscription();
  const reactivate = useReactivateSubscription();
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
  const endsAt = formatCsDate(sub.current_period_ends_at);

  if (isScheduledForCancel) {
    return (
      <section className="rounded-lg border border-warning/40 bg-warning-subtle p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          Předplatné je naplánované ke zrušení
        </h2>
        <p className="mt-3 text-sm text-text-primary">
          {endsAt
            ? `Přístup do aplikace zachováme do ${endsAt}. Poté pay-gate omezí činnost — data můžete kdykoli vyexportovat.`
            : "Přístup do aplikace zachováme do konce aktuálního období. Poté pay-gate omezí činnost — data můžete kdykoli vyexportovat."}
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
              onError: () => setError("Obnovení se nezdařilo. Zkuste to prosím znovu."),
            });
          }}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reactivate.isPending ? "Obnovuji…" : "Obnovit předplatné"}
        </button>
      </section>
    );
  }

  if (sub.status !== "active" && sub.status !== "past_due") return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Zrušit předplatné</h2>
      <p className="mt-3 text-sm text-text-secondary">
        Po zrušení dále hradíme až do konce aktuálního období
        {endsAt ? ` (do ${endsAt})` : ""} — nikdo o přístup nepřijde okamžitě. Žádné další platby
        vám pak strhnuty nebudou. Data si vždy můžete vyexportovat ze sekce Reporty.
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
          Zrušit předplatné
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-md border border-danger/40 bg-danger-subtle p-4">
          <p className="text-sm font-medium text-text-primary">Opravdu chcete zrušit předplatné?</p>
          <label className="block text-xs font-medium text-text-tertiary">
            Důvod (nepovinné, pomůže nám se zlepšit)
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
                    onError: () => setError("Zrušení se nezdařilo. Zkuste to prosím znovu."),
                  },
                );
              }}
              className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancel.isPending ? "Rušíme…" : "Ano, zrušit"}
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
              Ne, ponechat
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
      setError("Pro pokračování je nutné potvrdit souhlas s opakovanými platbami.");
      return;
    }
    if (!isBillingFormValid(billing)) {
      setError("Vyplňte prosím fakturační údaje.");
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
      setError("Uložení fakturačních údajů se nezdařilo. Zkuste to prosím znovu.");
      return;
    }
    setSaving(false);
    initPayment.mutate(
      { plan_code: selected },
      {
        onSuccess: (init) => {
          window.location.assign(init.redirect_url);
        },
        onError: () => {
          setError("Platební brána není dostupná, zkuste to prosím za chvíli.");
        },
      },
    );
  }

  return (
    <div
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
          Vyberte plán
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Po výběru vás přesměrujeme na zabezpečenou platební bránu. Po úspěšné platbě se vrátíte
          zpět a předplatné bude okamžitě aktivní.
        </p>

        <div
          role="radiogroup"
          aria-label="Plán"
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <PlanModalCard
            code="monthly"
            title="Měsíční"
            priceMinor={monthlyPlan?.price_per_user_minor ?? null}
            priceInterval="monthly"
            selected={selected === "monthly"}
            disabled={submitting}
            onSelect={() => setSelected("monthly")}
          />
          <PlanModalCard
            code="annual"
            title="Roční"
            priceMinor={annualPlan?.price_per_user_minor ?? null}
            priceInterval="annual"
            selected={selected === "annual"}
            disabled={submitting}
            onSelect={() => setSelected("annual")}
            badge="Ušetříte 16 %"
            caption={
              summary.data && summary.data.savings_minor != null ? (
                <p className="text-sm text-text-secondary">
                  {summary.data.user_count === 1
                    ? "S Vaším 1 uživatelem"
                    : `S Vašimi ${summary.data.user_count} uživateli`}{" "}
                  ušetříte{" "}
                  <span className="font-semibold text-text-primary">
                    {formatCzkMinor(summary.data.savings_minor)}
                  </span>{" "}
                  ročně.
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
          <h3 className="text-sm font-semibold text-text-primary">Fakturační údaje</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Tyto údaje použijeme na daňový doklad. Vyplnění je povinné pro pokračování k platbě.
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
            Zrušit
          </button>
          <button
            type="submit"
            disabled={!selected || submitting || !recurringConsent || !isBillingFormValid(billing)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Přesměrování…" : "Pokračovat na platbu"}
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
