import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, Check, Sparkles, Users } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { PriceDisplay } from "@/components/billing/PriceDisplay";
import { usePublicPlans } from "@/components/billing/usePublicPlans";
import { ApiError, apiFetch } from "@/lib/api";
import { formatMoneyMinor } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { queryClient } from "@/lib/queryClient";
import { testIds } from "@/lib/testids";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

type CurrentUser = components["schemas"]["CurrentUser"];
type PlanCode = "monthly" | "annual";

type Step = 1 | 2 | 3;

// `apiFetch` accepts `Record<string, unknown>` for JSON bodies; the index
// signature is required so a typed interface assigns cleanly.
type SubmitBody = {
  name: string;
  seat_count: number;
  intended_plan_code: PlanCode;
} & Record<string, unknown>;

/**
 * 3-step wizard for the freshly-signed-up user (post-Google OAuth) who
 * hasn't picked an organization yet:
 *   1. Org name
 *   2. Number of salesmen (seat_count)
 *   3. 30-day trial info + monthly/yearly plan picker (with per-user and
 *      overall totals)
 *
 * Submitting promotes the user to admin, creates the default team,
 * seeds the default pipeline, and queues the chosen
 * plan via Subscription.pending_plan_id so the existing super-admin
 * activation path applies it on payment receipt.
 */
export function CreateOrgPage() {
  const { t } = useTranslation("onboarding");
  usePageTitle(t("createOrg.pageTitle"));
  const { accessToken, clearAuth } = useAuth();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [seatCount, setSeatCount] = useState<number>(1);
  const [planCode, setPlanCode] = useState<PlanCode>("monthly");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation<CurrentUser, Error, SubmitBody>({
    mutationFn: (body) =>
      apiFetch<CurrentUser>("/api/v1/onboarding/organization", {
        method: "POST",
        token: accessToken,
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/app");
    },
  });

  useEffect(() => {
    if (user?.organization) navigate("/app", { replace: true });
  }, [user?.organization, navigate]);

  function goNext() {
    setError(null);
    if (step === 1) {
      if (name.trim().length === 0) {
        setError(t("createOrg.errors.nameRequired"));
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!Number.isFinite(seatCount) || seatCount < 1 || seatCount > 500) {
        setError(t("createOrg.errors.seatRange"));
        return;
      }
      setStep(3);
      return;
    }
  }

  function goBack() {
    setError(null);
    if (step > 1) setStep((step - 1) as Step);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (step !== 3) {
      goNext();
      return;
    }
    mutation.mutate(
      {
        name: name.trim(),
        seat_count: seatCount,
        intended_plan_code: planCode,
      },
      {
        onError: (err) => {
          if (err instanceof ApiError) {
            const detail = (err.body as { detail?: unknown })?.detail;
            setError(typeof detail === "string" ? detail : t("createOrg.errors.generic"));
          } else {
            setError(err.message || t("createOrg.errors.generic"));
          }
        },
      },
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-bg">
      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
        <div className="absolute right-4 top-4 flex items-center gap-3">
          <ThemeToggle variant="compact" />
          <button
            type="button"
            onClick={() => {
              clearAuth();
              navigate("/login");
            }}
            className="text-xs text-text-tertiary hover:text-text-primary"
          >
            {t("createOrg.signOut")}
          </button>
        </div>
        <main
          aria-labelledby="create-org-title"
          className="w-full max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-md sm:p-8"
        >
          <div
            aria-hidden
            className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
          >
            <Sparkles size={24} strokeWidth={1.75} />
          </div>
          <h1 id="create-org-title" className="text-center text-2xl font-semibold">
            {t("createOrg.heading")}
          </h1>
          <StepDots step={step} />

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            {step === 1 ? (
              <NameStep name={name} setName={setName} />
            ) : step === 2 ? (
              <SeatsStep seatCount={seatCount} setSeatCount={setSeatCount} planCode={planCode} />
            ) : (
              <PlanStep seatCount={seatCount} planCode={planCode} setPlanCode={setPlanCode} />
            )}

            {error ? (
              <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1 || mutation.isPending}
                data-testid={testIds.onboarding.wizard.back}
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-transparent px-3 text-sm font-medium text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
                {t("createOrg.back")}
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={goNext}
                  data-testid={testIds.onboarding.wizard.next}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
                >
                  {t("createOrg.next")}
                  <ArrowRight size={16} strokeWidth={1.75} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  data-testid={testIds.onboarding.wizard.submit}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-6 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check size={16} strokeWidth={2} />
                  {mutation.isPending ? t("createOrg.submitting") : t("createOrg.submit")}
                </button>
              )}
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-text-tertiary">{t("createOrg.inviteHint")}</p>
        </main>
      </div>
    </div>
  );
}

const STEP_LABEL_KEY: Record<Step, ParseKeys<"onboarding">> = {
  1: "createOrg.steps.org",
  2: "createOrg.steps.users",
  3: "createOrg.steps.plan",
};

const STEP_NUMBERS: Step[] = [1, 2, 3];

function StepDots({ step }: { step: Step }) {
  const { t } = useTranslation("onboarding");
  return (
    <ol
      aria-label={t("createOrg.stepsAriaLabel")}
      className="mx-auto mt-5 flex items-center justify-center gap-3 text-xs"
    >
      {STEP_NUMBERS.map((n, idx) => {
        const isCurrent = step === n;
        const isPast = step > n;
        return (
          <li key={n} className="flex items-center gap-3">
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors",
                isCurrent
                  ? "bg-accent text-text-on-accent"
                  : isPast
                    ? "bg-accent text-text-on-accent"
                    : "border border-border bg-surface-overlay text-text-tertiary",
              )}
            >
              {isPast ? <Check size={12} strokeWidth={3} /> : n}
            </span>
            <span
              className={cn(
                "hidden sm:inline",
                isCurrent
                  ? "font-semibold text-text-primary"
                  : isPast
                    ? "text-text-secondary"
                    : "text-text-tertiary",
              )}
            >
              {t(STEP_LABEL_KEY[n])}
            </span>
            {idx < STEP_NUMBERS.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "hidden h-px w-6 sm:inline-block",
                  isPast ? "bg-accent" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function NameStep({ name, setName }: { name: string; setName: (v: string) => void }) {
  const { t } = useTranslation("onboarding");
  return (
    <div>
      <p className="text-center text-sm text-text-secondary">{t("createOrg.nameStep.intro")}</p>
      <label className="mt-5 block">
        <span className="text-xs font-medium text-text-secondary">
          {t("createOrg.nameStep.label")}
        </span>
        <div className="relative mt-2">
          <Building2
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            autoComplete="organization"
            autoFocus
            required
            data-testid={testIds.onboarding.wizard.nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("createOrg.nameStep.placeholder")}
            className="block h-10 w-full rounded-md border border-border bg-surface-overlay pl-10 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </div>
      </label>
    </div>
  );
}

function SeatsStep({
  seatCount,
  setSeatCount,
  planCode,
}: {
  seatCount: number;
  setSeatCount: (n: number) => void;
  planCode: PlanCode;
}) {
  const { t } = useTranslation("onboarding");
  const locale = useLocale();
  const plans = usePublicPlans();
  const monthlyPlan = useMemo(() => plans.data?.find((p) => p.code === "monthly"), [plans.data]);
  const annualPlan = useMemo(() => plans.data?.find((p) => p.code === "annual"), [plans.data]);
  const perUserMonthly = monthlyPlan?.price_per_user_minor ?? null;
  const perUserAnnual = annualPlan?.price_per_user_minor ?? null;
  const previewMinor =
    planCode === "annual"
      ? perUserAnnual != null
        ? perUserAnnual * seatCount
        : null
      : perUserMonthly != null
        ? perUserMonthly * seatCount
        : null;
  const previewSuffix = planCode === "annual" ? t("createOrg.perYear") : t("createOrg.perMonth");

  return (
    <div>
      <p className="text-center text-sm text-text-secondary">{t("createOrg.seatsStep.intro")}</p>
      <label className="mt-5 block">
        <span className="text-xs font-medium text-text-secondary">
          {t("createOrg.seatsStep.label")}
        </span>
        <div className="relative mt-2">
          <Users
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="number"
            min={1}
            max={500}
            autoFocus
            required
            data-testid={testIds.onboarding.wizard.seatCountInput}
            value={seatCount}
            onChange={(e) => setSeatCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            className="block h-10 w-32 rounded-md border border-border bg-surface-overlay pl-10 pr-3 text-sm tabular-nums text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <span className="mt-2 block text-xs text-text-tertiary">
          {t("createOrg.seatsStep.hint")}
        </span>
      </label>

      {previewMinor != null ? (
        <div
          data-testid="seats-cost-preview"
          className="mt-5 rounded-md border border-border-subtle bg-surface-overlay p-4 text-sm"
          aria-live="polite"
        >
          <p className="text-text-secondary">
            {t("createOrg.seatsPhrase", { count: seatCount })}{" "}
            {t("createOrg.seatsStep.billingWouldTotal")}{" "}
            <span className="font-semibold tabular-nums text-text-primary">
              {formatMoneyMinor(previewMinor, "CZK", locale)}
            </span>{" "}
            / {previewSuffix}.
          </p>
          <p className="mt-1 text-xs text-text-tertiary">{t("createOrg.seatsStep.hint2")}</p>
        </div>
      ) : null}
    </div>
  );
}

function PlanStep({
  seatCount,
  planCode,
  setPlanCode,
}: {
  seatCount: number;
  planCode: PlanCode;
  setPlanCode: (c: PlanCode) => void;
}) {
  const { t } = useTranslation("onboarding");
  const locale = useLocale();
  const plans = usePublicPlans();
  const monthlyPlan = useMemo(() => plans.data?.find((p) => p.code === "monthly"), [plans.data]);
  const annualPlan = useMemo(() => plans.data?.find((p) => p.code === "annual"), [plans.data]);

  // The org doesn't exist yet — the backend stamps trial_ends_at = now + 30d
  // when we submit. Computed here for the copy below; the user is already
  // bounded to today by the time the wizard renders, so the off-by-a-few-
  // hours risk vs the server clock is below display precision.
  const trialEndsAt = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  }, []);
  const trialEndsLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(trialEndsAt),
    [trialEndsAt, locale],
  );

  // Absolute CZK savings for the currently-typed seat count. The marketing
  // 16 % discount is derived from the published per-user prices, so we
  // compute the exact koruna delta off the same source.
  const annualSavingsMinor = useMemo(() => {
    if (!monthlyPlan?.price_per_user_minor || !annualPlan?.price_per_user_minor) return null;
    const monthlyYearTotal = monthlyPlan.price_per_user_minor * 12 * seatCount;
    const annualTotal = annualPlan.price_per_user_minor * seatCount;
    const delta = monthlyYearTotal - annualTotal;
    return delta > 0 ? delta : null;
  }, [monthlyPlan, annualPlan, seatCount]);

  return (
    <div>
      <div className="rounded-md border border-border-subtle bg-surface-overlay p-4 text-sm">
        <p className="font-medium text-text-primary">{t("createOrg.planStep.trialHeading")}</p>
        <p className="mt-2 text-text-secondary">
          {t("createOrg.planStep.dueDatePrefix")}
          <span className="font-medium text-text-primary">{trialEndsLabel}</span>
          {t("createOrg.planStep.dueDateSuffix")}
        </p>
        <p className="mt-2 text-text-tertiary">
          {t("createOrg.planStep.statusPrefix")}{" "}
          <span className="font-medium text-text-secondary">
            {t("createOrg.planStep.statusLocation")}
          </span>
          .
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t("createOrg.planStep.ariaLabel")}
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <BillingPlanCard
          code="monthly"
          title={t("createOrg.planMonthly")}
          per={t("createOrg.perMonth")}
          priceMinor={monthlyPlan?.price_per_user_minor ?? null}
          priceInterval="monthly"
          seatCount={seatCount}
          selected={planCode === "monthly"}
          onSelect={() => setPlanCode("monthly")}
        />
        <BillingPlanCard
          code="annual"
          title={t("createOrg.planAnnual")}
          per={t("createOrg.perYear")}
          priceMinor={annualPlan?.price_per_user_minor ?? null}
          priceInterval="annual"
          seatCount={seatCount}
          selected={planCode === "annual"}
          onSelect={() => setPlanCode("annual")}
          badge={t("createOrg.annualBadge")}
          savingsMinor={annualSavingsMinor}
        />
      </div>
    </div>
  );
}

interface BillingPlanCardProps {
  code: PlanCode;
  title: string;
  per: string;
  priceMinor: number | null;
  priceInterval: "monthly" | "annual";
  seatCount: number;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
  /** Absolute CZK saved vs paying monthly — only set on the annual card. */
  savingsMinor?: number | null;
}

function BillingPlanCard({
  code,
  title,
  per,
  priceMinor,
  priceInterval,
  seatCount,
  selected,
  onSelect,
  badge,
  savingsMinor,
}: BillingPlanCardProps) {
  const { t } = useTranslation("onboarding");
  const locale = useLocale();
  const totalMinor = priceMinor != null ? priceMinor * seatCount : null;
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      data-plan-code={code}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-lg border-2 bg-surface p-5 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        selected ? "border-accent shadow-md" : "border-border hover:border-text-tertiary",
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
      {totalMinor != null ? (
        <p
          data-testid={`plan-${code}-total`}
          className="mt-3 text-sm text-text-secondary"
          aria-live="polite"
        >
          {t("createOrg.seatsPhrase", { count: seatCount })} {t("createOrg.planCard.weInvoice")}{" "}
          <span className="font-semibold tabular-nums text-text-primary">
            {formatMoneyMinor(totalMinor, "CZK", locale)}
          </span>{" "}
          / {per}.
        </p>
      ) : null}
      {savingsMinor != null && savingsMinor > 0 ? (
        <p
          data-testid={`plan-${code}-savings`}
          className="mt-2 text-sm text-success"
          aria-live="polite"
        >
          {t("createOrg.planCard.savingsPrefix")}{" "}
          <span className="font-semibold tabular-nums">
            {formatMoneyMinor(savingsMinor, "CZK", locale)}
          </span>{" "}
          {t("createOrg.planCard.savingsSuffix")}
        </p>
      ) : null}
    </div>
  );
}
