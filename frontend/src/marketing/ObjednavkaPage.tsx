import type { ParseKeys } from "i18next";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Lock, Minus, Plus, ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";

import { billingErrorCode, billingErrorMessage } from "@/components/billing/usePayments";
import { usePublicPlans } from "@/components/billing/usePublicPlans";
import { apiFetch } from "@/lib/api";
import { formatMoneyMinor } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";
import { Footer, Nav } from "@/marketing/LandingPage";
import type { components } from "@/types/api.generated";

type PlanCode = "monthly" | "annual";
type DemoOrderOut = components["schemas"]["DemoOrderOut"];

/** Fallback unit prices (minor units / user) when the public-plans read
 *  is unavailable — must mirror the seeded plans (Cenik shows the same). */
const FALLBACK_PRICE_MINOR: Record<PlanCode, number> = {
  monthly: 9900,
  annual: 99600,
};

const PLAN_LABEL_KEY: Record<PlanCode, ParseKeys<"marketing">> = {
  monthly: "order.planMonthly",
  annual: "order.planAnnual",
};

const PLAN_PERIOD_KEY: Record<PlanCode, ParseKeys<"marketing">> = {
  monthly: "order.periodMonth",
  annual: "order.periodYear",
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
  const { t } = useTranslation("marketing");
  const { t: tBilling } = useTranslation("billing");
  const locale = useLocale();
  usePageTitle(t("meta.orderTitle"));
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
      setError(billingErrorMessage(billingErrorCode(err), tBilling));
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-12 md:px-8">
        <header className="text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            {t("order.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">{t("order.title")}</h1>
          <p className="mt-3 text-sm text-text-secondary md:text-base">{t("order.subtitle")}</p>
        </header>

        <div
          className="mt-6 rounded-lg border border-border bg-surface-overlay px-4 py-3 text-sm text-text-secondary"
          role="note"
        >
          <span className="font-semibold text-text-primary">{t("order.testNoticeLabel")}</span>{" "}
          {t("order.testNoticeMid1")}{" "}
          <span className="font-semibold text-text-primary">{t("order.testNoticeBold")}</span>
          {t("order.testNoticeMid2")}{" "}
          <Link to="/signup" className="underline hover:text-text-primary">
            {t("order.testNoticeTrialLink")}
          </Link>
          .
        </div>

        <form onSubmit={submit} className="mt-8 space-y-6">
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
              <ShoppingCart size={16} strokeWidth={1.75} aria-hidden /> {t("order.yourOrder")}
            </h2>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-text-primary">
                {t("order.planLegend")}
              </legend>
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
                      {t(PLAN_LABEL_KEY[code])}
                    </span>
                    <span className="mt-1 text-xs text-text-secondary">
                      {formatMoneyMinor(
                        plans?.find((p) => p.code === code)?.price_per_user_minor ??
                          FALLBACK_PRICE_MINOR[code],
                        "CZK",
                        locale,
                      )}{" "}
                      {t("order.perUserPer", { period: t(PLAN_PERIOD_KEY[code]) })}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-5">
              <label htmlFor="seats" className="text-sm font-medium text-text-primary">
                {t("order.seatsLabel")}
              </label>
              <div className="mt-2 inline-flex items-center rounded-md border border-border">
                <button
                  type="button"
                  aria-label={t("order.decrSeat")}
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
                  aria-label={t("order.incrSeat")}
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
                {t("order.emailLabel")}
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
                  {t("order.summaryLine", { plan: t(PLAN_LABEL_KEY[plan]) })} · {seats}{" "}
                  {t("order.seatsUnit", { count: seats })} ×{" "}
                  {formatMoneyMinor(unitMinor, "CZK", locale)}
                </dt>
                <dd>{formatMoneyMinor(totalMinor, "CZK", locale)}</dd>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-text-primary">
                <dt>{t("order.totalFor", { period: t(PLAN_PERIOD_KEY[plan]) })}</dt>
                <dd data-testid="order-total">{formatMoneyMinor(totalMinor, "CZK", locale)}</dd>
              </div>
              <p className="text-xs text-text-tertiary">{t("order.vatNote")}</p>
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
                {t("order.redirecting")}
              </>
            ) : (
              <>
                <Lock size={16} strokeWidth={1.75} aria-hidden />
                {t("order.pay", { amount: formatMoneyMinor(totalMinor, "CZK", locale) })}
              </>
            )}
          </button>

          <p className="text-center text-xs leading-relaxed text-text-tertiary">
            {t("order.consentPre")}{" "}
            <Link to="/obchodni-podminky" className="underline hover:text-text-primary">
              {t("order.termsLink")}
            </Link>
            ,{" "}
            <Link to="/reklamacni-podminky" className="underline hover:text-text-primary">
              {t("order.complaintsLink")}
            </Link>{" "}
            {t("order.consentAnd")}{" "}
            <Link to="/dodaci-a-platebni-podminky" className="underline hover:text-text-primary">
              {t("order.deliveryLink")}
            </Link>
            {t("order.consentPost")}
          </p>
        </form>
      </main>
      <Footer />
    </div>
  );
}
