import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Lock, Minus, Plus, ShoppingCart } from "lucide-react";

import { usePublicPlans } from "@/components/billing/usePublicPlans";
import { formatCzkMinor } from "@/components/billing/format";
import { apiFetch, ApiError } from "@/lib/api";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";
import { Footer, Nav } from "@/marketing/LandingPage";
import type { components } from "@/types/api.generated";

type PlanCode = "monthly" | "annual";
type DemoOrderOut = components["schemas"]["DemoOrderOut"];

/** Fallback unit prices (minor units / user) when the public-plans read
 *  is unavailable — must mirror the seeded plans (Ceník shows the same). */
const FALLBACK_PRICE_MINOR: Record<PlanCode, number> = {
  monthly: 9900,
  annual: 99600,
};

const PLAN_LABEL: Record<PlanCode, string> = {
  monthly: "Měsíční",
  annual: "Roční",
};

const PLAN_PERIOD: Record<PlanCode, string> = {
  monthly: "měsíc",
  annual: "rok",
};

const MAX_SEATS = 25;

function isPlanCode(value: string | null): value is PlanCode {
  return value === "monthly" || value === "annual";
}

/**
 * Public demo order — the order → payment-gateway flow ComGate's review
 * team requires before granting full access. Payments run with
 * `test=true` on the backend, so nothing is ever charged; the page says
 * so prominently. Real customers start with the free trial instead.
 */
export function ObjednavkaPage() {
  usePageTitle("Objednávka");
  const [searchParams] = useSearchParams();
  const initialPlan = searchParams.get("plan");

  const [plan, setPlan] = useState<PlanCode>(isPlanCode(initialPlan) ? initialPlan : "monthly");
  const [seats, setSeats] = useState(1);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: plans } = usePublicPlans();
  const unitMinor = useMemo(() => {
    const fromApi = plans?.find((p) => p.code === plan)?.price_per_user_minor;
    return fromApi ?? FALLBACK_PRICE_MINOR[plan];
  }, [plans, plan]);
  const totalMinor = seats * unitMinor;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!emailValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<DemoOrderOut>("/api/v1/payments/demo-order", {
        method: "POST",
        body: { plan_code: plan, seats, email },
      });
      window.location.assign(result.redirect_url);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 429) {
        setError("Příliš mnoho pokusů. Zkuste to prosím za pár minut.");
      } else {
        setError("Platební bránu se nepodařilo otevřít. Zkuste to prosím za chvíli.");
      }
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-12 md:px-8">
        <header className="text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            Objednávka
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">
            Objednávka předplatného SimpleCRM
          </h1>
          <p className="mt-3 text-sm text-text-secondary md:text-base">
            Vyzkoušejte si průchod objednávkou a platební bránou Comgate.
          </p>
        </header>

        <div
          className="mt-6 rounded-lg border border-border bg-surface-overlay px-4 py-3 text-sm text-text-secondary"
          role="note"
        >
          <span className="font-semibold text-text-primary">Testovací objednávka:</span> platba
          proběhne v testovacím režimu platební brány a{" "}
          <span className="font-semibold text-text-primary">nebude nikdy účtována</span>. Chcete-li
          SimpleCRM používat naostro, začněte{" "}
          <Link to="/signup" className="underline hover:text-text-primary">
            30denní zkušební verzí zdarma
          </Link>
          .
        </div>

        <form onSubmit={submit} className="mt-8 space-y-6">
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
              <ShoppingCart size={16} strokeWidth={1.75} aria-hidden /> Vaše objednávka
            </h2>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-text-primary">Plán</legend>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(["monthly", "annual"] as const).map((code) => (
                  <label
                    key={code}
                    className={cn(
                      "flex cursor-pointer flex-col rounded-lg border px-4 py-3 transition-colors duration-fast",
                      plan === code
                        ? "border-accent bg-surface-overlay"
                        : "border-border hover:bg-surface-overlay",
                    )}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={code}
                      checked={plan === code}
                      onChange={() => setPlan(code)}
                      className="sr-only"
                    />
                    <span className="text-sm font-semibold text-text-primary">
                      {PLAN_LABEL[code]}
                    </span>
                    <span className="mt-1 text-xs text-text-secondary">
                      {formatCzkMinor(
                        plans?.find((p) => p.code === code)?.price_per_user_minor ??
                          FALLBACK_PRICE_MINOR[code],
                      )}{" "}
                      / uživatel / {PLAN_PERIOD[code]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-5">
              <label htmlFor="seats" className="text-sm font-medium text-text-primary">
                Počet uživatelů
              </label>
              <div className="mt-2 inline-flex items-center rounded-md border border-border">
                <button
                  type="button"
                  aria-label="Ubrat uživatele"
                  onClick={() => setSeats((s) => Math.max(1, s - 1))}
                  disabled={seats <= 1}
                  className="flex h-10 w-10 items-center justify-center text-text-secondary transition-colors duration-fast hover:text-text-primary disabled:opacity-40"
                >
                  <Minus size={16} strokeWidth={1.75} />
                </button>
                <input
                  id="seats"
                  type="number"
                  min={1}
                  max={MAX_SEATS}
                  value={seats}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v))
                      setSeats(Math.min(MAX_SEATS, Math.max(1, Math.round(v))));
                  }}
                  className="h-10 w-16 border-x border-border bg-surface text-center text-sm font-semibold text-text-primary outline-none"
                />
                <button
                  type="button"
                  aria-label="Přidat uživatele"
                  onClick={() => setSeats((s) => Math.min(MAX_SEATS, s + 1))}
                  disabled={seats >= MAX_SEATS}
                  className="flex h-10 w-10 items-center justify-center text-text-secondary transition-colors duration-fast hover:text-text-primary disabled:opacity-40"
                >
                  <Plus size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="email" className="text-sm font-medium text-text-primary">
                Kontaktní e-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="vas@email.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none transition-colors duration-fast focus:border-accent"
              />
            </div>

            <dl className="mt-6 space-y-2 border-t border-border-subtle pt-4 text-sm">
              <div className="flex items-center justify-between text-text-secondary">
                <dt>
                  SimpleCRM — plán {PLAN_LABEL[plan]} · {seats}{" "}
                  {seats === 1 ? "uživatel" : seats <= 4 ? "uživatelé" : "uživatelů"} ×{" "}
                  {formatCzkMinor(unitMinor)}
                </dt>
                <dd>{formatCzkMinor(totalMinor)}</dd>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-text-primary">
                <dt>Celkem za {PLAN_PERIOD[plan]}</dt>
                <dd data-testid="order-total">{formatCzkMinor(totalMinor)}</dd>
              </div>
              <p className="text-xs text-text-tertiary">Nejsme plátci DPH. Cena je konečná.</p>
            </dl>
          </section>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!emailValid || submitting}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={16} strokeWidth={1.75} className="animate-spin" aria-hidden />
                Přesměrováváme na platební bránu…
              </>
            ) : (
              <>
                <Lock size={16} strokeWidth={1.75} aria-hidden />
                Zaplatit {formatCzkMinor(totalMinor)}
              </>
            )}
          </button>

          <p className="text-center text-xs leading-relaxed text-text-tertiary">
            Odesláním objednávky souhlasíte s{" "}
            <Link to="/obchodni-podminky" className="underline hover:text-text-primary">
              Obchodními podmínkami
            </Link>
            ,{" "}
            <Link to="/reklamacni-podminky" className="underline hover:text-text-primary">
              Reklamačními podmínkami
            </Link>{" "}
            a{" "}
            <Link to="/dodaci-a-platebni-podminky" className="underline hover:text-text-primary">
              Dodacími a platebními podmínkami
            </Link>
            . Bezpečnou online platbu zajišťuje brána Comgate (Visa, Mastercard, Apple Pay, Google
            Pay, bankovní převod).
          </p>
        </form>
      </main>
      <Footer />
    </div>
  );
}
