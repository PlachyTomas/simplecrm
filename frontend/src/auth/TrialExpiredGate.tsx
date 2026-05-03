import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/auth/useAuth";
import { formatCzkMinor } from "@/components/billing/format";
import { PriceDisplay } from "@/components/billing/PriceDisplay";
import { useBillingSummary } from "@/components/billing/useBillingSummary";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { useInitialPaymentInit } from "@/components/billing/usePayments";
import { usePublicPlans } from "@/components/billing/usePublicPlans";
import { type TrialExpiredPayload } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/lib/usePageTitle";

const SUPPORT_EMAIL = "podpora@simplecrm.cz";
type PlanCode = "monthly" | "annual";

interface TrialExpiredGateProps {
  payload?: TrialExpiredPayload;
  onExport?: () => void;
}

function userCountPhrase(n: number): string {
  // Instrumental case for "with N users". For N=1 the singular instrumental
  // is "uživatelem"; for ≥2 the plural instrumental is "uživateli".
  if (n === 1) return "S Vaším 1 uživatelem";
  return `S Vašimi ${n} uživateli`;
}

export function TrialExpiredGate({ payload, onExport }: TrialExpiredGateProps) {
  usePageTitle("Zkušební doba skončila");
  const { accessToken } = useAuth();
  const summary = useBillingSummary();
  const plans = usePublicPlans();
  const subscription = useCurrentSubscription();
  const initPayment = useInitialPaymentInit();

  const [selected, setSelected] = useState<PlanCode | null>(null);
  const [submitted] = useState(false); // legacy "thank-you" panel kept for shape; no longer flipped
  const [error, setError] = useState<string | null>(null);
  const contactDialogRef = useRef<HTMLDialogElement | null>(null);

  // Defensive: comp orgs should never reach this gate (the 402 doesn't fire
  // for is_comp=true). If we somehow got here, render nothing — failing
  // closed beats accidentally collecting payment intent from a comp org.
  if (payload?.is_comp) return null;

  const monthlyPlan = plans.data?.find((p) => p.code === "monthly");
  const annualPlan = plans.data?.find((p) => p.code === "annual");
  const isEnterpriseExpired = subscription.data?.plan?.code === "enterprise";
  const submitting = initPayment.isPending;

  function onSubmitChoosePlan() {
    if (!selected || !accessToken) return;
    setError(null);
    initPayment.mutate(
      { plan_code: selected },
      {
        onSuccess: (init) => {
          // Send the customer to the ComGate hosted payment page.
          // They'll come back to /app/billing/return where we read
          // the resulting subscription state.
          window.location.assign(init.redirect_url);
        },
        onError: () => {
          setError(
            "Platební brána není dostupná, zkuste to prosím za chvíli.",
          );
        },
      },
    );
  }

  function openContactModal() {
    contactDialogRef.current?.showModal();
  }

  function closeContactModal() {
    contactDialogRef.current?.close();
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="trial-expired-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 py-8 backdrop-blur-md"
    >
      <div className="w-full max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-lg sm:p-8">
        {submitted ? (
          <ConfirmationCard onExport={onExport} />
        ) : isEnterpriseExpired ? (
          <EnterpriseExpiredBody
            onContact={openContactModal}
            onExport={onExport}
          />
        ) : (
          <>
            <header className="text-center">
              <h1
                id="trial-expired-title"
                className="text-2xl font-semibold text-text-primary"
              >
                Vaše zkušební doba skončila.
              </h1>
              <p className="mt-2 text-sm text-text-secondary">
                Pokračujte výběrem plánu. Vaše data zůstávají v bezpečí.
              </p>
            </header>

            <div
              role="radiogroup"
              aria-label="Vyberte plán"
              className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <PlanRadioCard
                code="monthly"
                title="Měsíční"
                priceMinor={monthlyPlan?.price_per_user_minor ?? null}
                priceInterval="monthly"
                selected={selected === "monthly"}
                disabled={submitting}
                onSelect={() => setSelected("monthly")}
              />
              <PlanRadioCard
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
                      {userCountPhrase(summary.data.user_count)} ušetříte{" "}
                      <span className="font-semibold text-text-primary">
                        {formatCzkMinor(summary.data.savings_minor)}
                      </span>{" "}
                      ročně.
                    </p>
                  ) : null
                }
              />
            </div>

            <button
              type="button"
              onClick={openContactModal}
              className="mt-6 inline-flex w-full items-center justify-center text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              Potřebujete víc? Domluvte se na enterprise balíčku.
            </button>

            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void onSubmitChoosePlan()}
                disabled={!selected || submitting}
                className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Přesměrování…" : "Pokračovat na platbu"}
              </button>
              <button
                type="button"
                onClick={onExport}
                disabled={submitting || !onExport}
                className="inline-flex h-11 items-center justify-center rounded-md bg-transparent px-6 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Exportovat data
              </button>
            </div>

            <p className="mt-6 text-center text-xs text-text-tertiary">
              Máte otázky? Napište nám na{" "}
              <a
                className="text-accent hover:text-accent-hover"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </>
        )}
      </div>

      <ContactEnterpriseDialog
        dialogRef={contactDialogRef}
        defaultUserCount={summary.data?.user_count ?? 1}
        accessToken={accessToken}
        onClose={closeContactModal}
      />
    </div>
  );
}

interface PlanRadioCardProps {
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

function PlanRadioCard({
  code,
  title,
  priceMinor,
  priceInterval,
  selected,
  disabled,
  onSelect,
  badge,
  caption,
}: PlanRadioCardProps) {
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
        selected
          ? "border-accent shadow-md"
          : "border-border hover:border-text-tertiary",
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
          <PriceDisplay
            baseMinor={priceMinor}
            interval={priceInterval}
            size="lg"
            hideVatLine
          />
        ) : (
          <div
            aria-hidden
            className="h-9 w-32 animate-pulse rounded bg-surface-overlay"
          />
        )}
      </div>
      {caption ? <div className="mt-3">{caption}</div> : null}
    </div>
  );
}

interface ConfirmationCardProps {
  onExport?: () => void;
}

function ConfirmationCard({ onExport }: ConfirmationCardProps) {
  // The brief calls for echoing the user's email here, but `/auth/me` is
  // exactly the gated endpoint we got 402'd from, so we can't fetch it.
  // Generic copy is good enough; F5 can revisit by adding `email` to the
  // 402 payload if the echo turns out to matter.
  return (
    <div className="text-center">
      <h2 className="text-2xl font-semibold text-text-primary">
        Děkujeme. Pošleme vám platební instrukce.
      </h2>
      <p className="mt-3 text-sm text-text-secondary">
        Na váš e-mail odešleme fakturu a platební údaje. Po připsání platby
        vás aktivujeme do 24 hodin. Mezitím můžete data exportovat.
      </p>
      <button
        type="button"
        onClick={onExport}
        disabled={!onExport}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-transparent px-6 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        Exportovat data
      </button>
    </div>
  );
}

interface EnterpriseExpiredBodyProps {
  onContact: () => void;
  onExport?: () => void;
}

function EnterpriseExpiredBody({
  onContact,
  onExport,
}: EnterpriseExpiredBodyProps) {
  return (
    <div className="text-center">
      <h1
        id="trial-expired-title"
        className="text-2xl font-semibold text-text-primary"
      >
        Vaše zkušební doba skončila.
      </h1>
      <p className="mt-3 text-sm text-text-secondary">
        Vaše enterprise předplatné skončilo. Domluvte se s naším obchodním
        týmem na prodloužení.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onContact}
          className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          Kontaktovat obchod
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!onExport}
          className="inline-flex h-11 items-center justify-center rounded-md bg-transparent px-6 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Exportovat data
        </button>
      </div>
      <p className="mt-6 text-xs text-text-tertiary">
        Máte otázky? Napište nám na{" "}
        <a
          className="text-accent hover:text-accent-hover"
          href={`mailto:${SUPPORT_EMAIL}`}
        >
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  );
}

interface ContactEnterpriseDialogProps {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  defaultUserCount: number;
  accessToken: string | null;
  onClose: () => void;
}

function ContactEnterpriseDialog({
  dialogRef,
  defaultUserCount,
  accessToken,
  onClose,
}: ContactEnterpriseDialogProps) {
  const [expectedUsers, setExpectedUsers] = useState<number>(defaultUserCount);
  const [message, setMessage] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the user-count default in sync when billing-summary resolves
  // after the dialog has mounted. Don't overwrite once the user has
  // submitted (the field is no longer visible anyway).
  useEffect(() => {
    if (!done) setExpectedUsers(defaultUserCount);
  }, [defaultUserCount, done]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || sending) return;
    setSending(true);
    setErr(null);
    try {
      await apiFetch("/api/v1/organizations/current/subscription/contact-enterprise", {
        method: "POST",
        token: accessToken,
        body: { expected_users: expectedUsers, message },
      });
      setDone(true);
    } catch (e2) {
      setErr(
        e2 instanceof ApiError
          ? "Odeslání se nezdařilo. Zkuste to prosím znovu."
          : "Něco se pokazilo. Zkontrolujte připojení a zkuste to znovu.",
      );
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    onClose();
    setTimeout(() => {
      setDone(false);
      setErr(null);
      setMessage("");
    }, 200);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="rounded-xl border border-border bg-surface p-0 text-text-primary shadow-lg backdrop:bg-bg/60 backdrop:backdrop-blur-sm"
    >
      <div className="w-[min(92vw,32rem)] p-6">
        {done ? (
          <>
            <h2 className="text-lg font-semibold">Děkujeme.</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Ozveme se vám na e-mail do 24 hodin.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
              >
                Zavřít
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)}>
            <h2 className="text-lg font-semibold">Kontaktovat enterprise tým</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Napište nám pár vět o vašich potřebách. Ozveme se vám obratem.
            </p>

            <label className="mt-4 block text-sm font-medium text-text-primary">
              Počet uživatelů
              <input
                type="number"
                min={1}
                max={10000}
                value={expectedUsers}
                onChange={(e) =>
                  setExpectedUsers(Math.max(1, Number(e.target.value) || 1))
                }
                className="mt-1 block h-10 w-32 rounded-md border border-border bg-bg px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-text-primary">
              Zpráva
              <textarea
                required
                minLength={1}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Stručně popište vaše požadavky…"
                className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>

            {err ? (
              <p
                role="alert"
                className="mt-3 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {err}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={sending}
                className="inline-flex h-10 items-center justify-center rounded-md bg-transparent px-4 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                type="submit"
                disabled={sending || message.trim().length === 0}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Odesíláme…" : "Odeslat"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
