import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Receipt,
  RefreshCcw,
  Sparkles,
  Users,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useLookupRegistry } from "@/app/companies/useLookupRegistry";
import { UnverifiedEmailBanner } from "@/auth/UnverifiedEmailBanner";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { formatCzkMinor } from "@/components/billing/format";
import { PriceDisplay } from "@/components/billing/PriceDisplay";
import { usePublicPlans } from "@/components/billing/usePublicPlans";
import { ApiError, apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { testIds } from "@/lib/testids";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

type CurrentUser = components["schemas"]["CurrentUser"];
type PlanCode = "monthly" | "annual";

type Step = 1 | 2 | 3 | 4;

// `apiFetch` accepts `Record<string, unknown>` for JSON bodies; the index
// signature is required so a typed interface assigns cleanly.
type SubmitBody = {
  name: string;
  seat_count: number;
  intended_plan_code: PlanCode;
} & Record<string, unknown>;

/**
 * 4-step wizard for the freshly-signed-up user (post-Google OAuth) who
 * hasn't picked an organization yet:
 *   1. Org name
 *   2. Number of salesmen (seat_count)
 *   3. Fakturační údaje — optional IČO with one-click ARES fill. Empty
 *      IČO is accepted; an admin-only banner then nudges the user to
 *      fill it in Settings before the 30-day trial ends.
 *   4. 30-day trial info + monthly/yearly plan picker (with per-user and
 *      overall totals)
 *
 * Submitting promotes the user to admin, creates the default team
 * ("Hlavní tým"), seeds the default pipeline, and queues the chosen
 * plan via Subscription.pending_plan_id so the existing super-admin
 * Aktivovat path applies it on payment receipt.
 */
export function CreateOrgPage() {
  usePageTitle("Vytvořit organizaci");
  const { accessToken, clearAuth } = useAuth();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [seatCount, setSeatCount] = useState<number>(1);
  const [ico, setIco] = useState("");
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
        setError("Zadejte název organizace.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!Number.isFinite(seatCount) || seatCount < 1 || seatCount > 500) {
        setError("Počet uživatelů musí být v rozsahu 1–500.");
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      // IČO is optional. If filled, it must be exactly 8 digits — the
      // input strips non-digits, so this only triggers for partial entries.
      if (ico && !/^\d{8}$/.test(ico)) {
        setError("IČO musí mít 8 číslic. Nebo pole nechte prázdné a doplníte později.");
        return;
      }
      setStep(4);
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
    if (step !== 4) {
      goNext();
      return;
    }
    mutation.mutate(
      {
        name: name.trim(),
        seat_count: seatCount,
        intended_plan_code: planCode,
        // Only send IČO when it's a complete 8-digit value; sending an
        // empty string would make Pydantic's pattern validator unhappy.
        ...(ico && /^\d{8}$/.test(ico) ? { ico } : {}),
      },
      {
        onError: (err) => {
          if (err instanceof ApiError) {
            const detail = (err.body as { detail?: unknown })?.detail;
            setError(typeof detail === "string" ? detail : "Vytvoření selhalo.");
          } else {
            setError(err.message || "Vytvoření selhalo.");
          }
        },
      },
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-bg">
      <UnverifiedEmailBanner />
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
            Odhlásit se
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
            Vytvořte si organizaci
          </h1>
          <StepDots step={step} />

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            {step === 1 ? (
              <NameStep name={name} setName={setName} />
            ) : step === 2 ? (
              <SeatsStep seatCount={seatCount} setSeatCount={setSeatCount} planCode={planCode} />
            ) : step === 3 ? (
              <BillingStep ico={ico} setIco={setIco} />
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
                Zpět
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  onClick={goNext}
                  data-testid={testIds.onboarding.wizard.next}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
                >
                  {step === 3 && !ico ? "Přeskočit" : "Pokračovat"}
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
                  {mutation.isPending ? "Vytvářím…" : "Vytvořit organizaci"}
                </button>
              )}
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-text-tertiary">
            Pozvánka od kolegů? Použijte odkaz, který vám přišel e-mailem, místo zakládání nové
            organizace.
          </p>
        </main>
      </div>
    </div>
  );
}

const STEP_LABELS: Record<Step, string> = {
  1: "Organizace",
  2: "Uživatelé",
  3: "Fakturace",
  4: "Plán",
};

const STEP_NUMBERS: Step[] = [1, 2, 3, 4];

function StepDots({ step }: { step: Step }) {
  return (
    <ol
      aria-label="Kroky vytvoření organizace"
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
              {STEP_LABELS[n]}
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
  return (
    <div>
      <p className="text-center text-sm text-text-secondary">
        Začněte názvem. Detaily firmy lze doplnit kdykoli později.
      </p>
      <label className="mt-5 block">
        <span className="text-xs font-medium text-text-secondary">Název organizace</span>
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
            placeholder="Acme s.r.o."
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
  const previewSuffix = planCode === "annual" ? "rok" : "měsíc";

  return (
    <div>
      <p className="text-center text-sm text-text-secondary">
        Kolik obchodníků bude SimpleCRM používat? Můžete kdykoli později změnit v Nastavení.
      </p>
      <label className="mt-5 block">
        <span className="text-xs font-medium text-text-secondary">Počet obchodníků</span>
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
          Tato hodnota slouží jako limit pro pozvánky a podle ní se počítá výsledná fakturace.
        </span>
      </label>

      {previewMinor != null ? (
        <div
          data-testid="seats-cost-preview"
          className="mt-5 rounded-md border border-border-subtle bg-surface-overlay p-4 text-sm"
          aria-live="polite"
        >
          <p className="text-text-secondary">
            Při {seatCount} {csNoun(seatCount, "obchodnik")} by fakturace činila{" "}
            <span className="font-semibold tabular-nums text-text-primary">
              {formatCzkMinor(previewMinor)}
            </span>{" "}
            / {previewSuffix}.
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            Účtujeme až po skončení 30denní zkušebky. Cenu si vyberete v dalším kroku.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function BillingStep({ ico, setIco }: { ico: string; setIco: (v: string) => void }) {
  // Mirror AddCompanyModal's lookup UX: only fire on exactly 8 digits,
  // debounced 250ms. Skipping the lookup until the field is empty so
  // typing "270" doesn't burn a request per keystroke.
  const debouncedIco = useDebouncedValue(ico, 250);
  const icoQuery = /^\d{8}$/.test(debouncedIco) ? debouncedIco : "";
  const lookup = useLookupRegistry({
    country: "CZ",
    number: icoQuery,
    enabled: !!icoQuery,
    scope: "onboarding",
  });

  const lookupState: "empty" | "typing" | "loading" | "success" | "not_found" | "error" = !ico
    ? "empty"
    : !icoQuery
      ? "typing"
      : lookup.isPending
        ? "loading"
        : lookup.isError
          ? lookup.error instanceof ApiError && lookup.error.status === 404
            ? "not_found"
            : "error"
          : "success";
  const resolved = lookupState === "success" ? lookup.data : null;

  return (
    <div>
      <p className="text-center text-sm text-text-secondary">
        Fakturační údaje jsou <span className="font-medium text-text-primary">volitelné</span>.
        Stačí zadat IČO a zbytek doplníme z ARES.
      </p>
      <label className="mt-5 block">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-secondary">IČO</span>
          {lookupState === "typing" || lookupState === "loading" ? (
            <span className="font-mono text-xs tabular-nums text-text-tertiary">
              {ico.replace(/\D/g, "").length} / 8
            </span>
          ) : null}
        </div>
        <div className="relative mt-2">
          <Receipt
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            data-testid={testIds.onboarding.wizard.icoInput}
            value={ico}
            onChange={(e) => setIco(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="27082440"
            className="block h-10 w-40 rounded-md border border-border bg-surface-overlay pl-10 pr-3 font-mono text-sm tabular-nums text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </div>
        {lookupState === "empty" ? (
          <p className="mt-2 text-xs text-text-tertiary">
            Zadejte 8 číslic — automaticky vyhledáme název a adresu firmy.
          </p>
        ) : null}
        {lookupState === "typing" ? (
          <p className="mt-2 text-xs text-text-tertiary">
            Pokračujte ve psaní — po 8 číslicích spustíme vyhledávání.
          </p>
        ) : null}
        {lookupState === "loading" ? (
          <p className="mt-2 text-xs text-text-tertiary" role="status">
            Hledám v ARES…
          </p>
        ) : null}
        {lookupState === "not_found" ? (
          <p className="mt-2 text-xs text-warning" role="alert">
            IČO {ico} nebylo v ARES nalezeno. Můžete jej i tak uložit a údaje doplnit ručně později.
          </p>
        ) : null}
        {lookupState === "error" ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-danger" role="alert">
              ARES je momentálně nedostupný. Zkuste to znovu nebo IČO doplňte později.
            </p>
            <button
              type="button"
              onClick={() => void lookup.refetch()}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
            >
              <RefreshCcw size={12} strokeWidth={1.75} /> Zkusit znovu
            </button>
          </div>
        ) : null}
      </label>

      {resolved ? (
        <div
          data-testid={testIds.onboarding.wizard.aresPreview}
          className="border-success/40 mt-5 rounded-md border bg-success-subtle p-4 text-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-success">
            Údaje doplněny z ARES
          </p>
          <p className="mt-2 font-medium text-text-primary">{resolved.name}</p>
          {resolved.address_street || resolved.address_city ? (
            <p className="text-text-secondary">
              {[
                resolved.address_street,
                [resolved.address_zip, resolved.address_city].filter(Boolean).join(" "),
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          ) : null}
          {resolved.dic ? (
            <p className="text-text-tertiary">
              DIČ <span className="font-mono">{resolved.dic}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-5 rounded-md bg-info-subtle px-3 py-2 text-xs text-text-secondary">
        Fakturační údaje můžete vyplnit i později v <strong>Nastavení → Fakturace</strong>. Pokud
        zůstanou nevyplněné do konce 30denní zkušebky, nebudeme moci vystavit platnou fakturu.
      </p>
    </div>
  );
}

function csNoun(n: number, kind: "obchodnik"): string {
  // Czech locative plural: "1 obchodníkovi", "2/3/4 obchodnících", "5+ obchodnících"
  if (kind === "obchodnik") return n === 1 ? "obchodníkovi" : "obchodnících";
  return "";
}

const csLongDate = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" });

function PlanStep({
  seatCount,
  planCode,
  setPlanCode,
}: {
  seatCount: number;
  planCode: PlanCode;
  setPlanCode: (c: PlanCode) => void;
}) {
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
  const trialEndsLabel = csLongDate.format(trialEndsAt);

  // Absolute Kč savings for the currently-typed seat count. The marketing
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
        <p className="font-medium text-text-primary">30denní zkušební doba zdarma.</p>
        <p className="mt-2 text-text-secondary">
          Před koncem zkušebky vám zašleme fakturu se splatností v den ukončení zkoušky (
          <span className="font-medium text-text-primary">{trialEndsLabel}</span>). Můžete ji
          uhradit kartou nebo bankovním převodem.
        </p>
        <p className="mt-2 text-text-tertiary">
          Stav úhrady a další doklady najdete kdykoli v{" "}
          <span className="font-medium text-text-secondary">Nastavení → Předplatné</span>.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Plán pro placené období"
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <BillingPlanCard
          code="monthly"
          title="Měsíční"
          per="měsíc"
          priceMinor={monthlyPlan?.price_per_user_minor ?? null}
          priceInterval="monthly"
          seatCount={seatCount}
          selected={planCode === "monthly"}
          onSelect={() => setPlanCode("monthly")}
        />
        <BillingPlanCard
          code="annual"
          title="Roční"
          per="rok"
          priceMinor={annualPlan?.price_per_user_minor ?? null}
          priceInterval="annual"
          seatCount={seatCount}
          selected={planCode === "annual"}
          onSelect={() => setPlanCode("annual")}
          badge="Ušetříte 16 %"
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
          Při {seatCount} {seatCount === 1 ? "obchodníkovi" : "obchodnících"} fakturujeme{" "}
          <span className="font-semibold tabular-nums text-text-primary">
            {formatCzkMinor(totalMinor)}
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
          Ušetříte{" "}
          <span className="font-semibold tabular-nums">{formatCzkMinor(savingsMinor)}</span> oproti
          měsíčnímu plánu.
        </p>
      ) : null}
    </div>
  );
}
