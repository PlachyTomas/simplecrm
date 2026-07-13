import type { ParseKeys } from "i18next";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { PriceDisplay } from "@/components/billing/PriceDisplay";
import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";
import { useCenikData } from "@/marketing/cenikData";
import { Footer, Nav } from "@/marketing/LandingPage";

interface PlanCardProps {
  eyebrow: string;
  title: string;
  bullets: readonly string[];
  cta: { label: string; href: string; isExternal?: boolean };
  /** Optional quieter second action under the primary CTA (e.g. the
   *  demo order flow ComGate's review requires to be reachable). */
  secondaryCta?: { label: string; href: string };
  highlighted?: boolean;
  /** Rendered in the price slot. */
  price: React.ReactNode;
  /** Optional caption below the price (savings line on annual). */
  caption?: React.ReactNode;
}

function PlanCard({
  eyebrow,
  title,
  bullets,
  cta,
  secondaryCta,
  highlighted,
  price,
  caption,
}: PlanCardProps) {
  const { t } = useTranslation("marketing");
  const ctaClass = highlighted
    ? "mt-8 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
    : "mt-8 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-elevated";
  return (
    <article
      className={cn(
        "relative flex flex-col rounded-xl bg-surface p-6 md:p-8",
        highlighted ? "border-2 border-accent shadow-md" : "border border-border shadow-sm",
      )}
    >
      {highlighted ? (
        <span
          className="absolute -top-3 right-4 rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-text-on-brand-accent"
          aria-label={t("cenik.recommendAria")}
        >
          {t("cenik.recommendBadge")}
        </span>
      ) : null}
      <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{eyebrow}</p>
      <h2 className="mt-2 text-lg font-semibold text-text-primary">{title}</h2>
      <div className="mt-6">{price}</div>
      {caption ? <div className="mt-2">{caption}</div> : null}
      <ul className="mt-6 space-y-3 text-sm text-text-primary">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Check
              size={16}
              strokeWidth={1.75}
              aria-hidden
              className="mt-0.5 shrink-0 text-success"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        {cta.isExternal ? (
          <a href={cta.href} className={ctaClass}>
            {cta.label}
          </a>
        ) : (
          <Link to={cta.href} className={ctaClass}>
            {cta.label}
          </Link>
        )}
        {secondaryCta ? (
          <Link
            to={secondaryCta.href}
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-elevated"
          >
            {secondaryCta.label}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

const MONTHLY_BULLET_KEYS = [
  "cenik.monthlyBullet1",
  "cenik.monthlyBullet2",
  "cenik.monthlyBullet3",
] as const satisfies readonly ParseKeys<"marketing">[];

const ANNUAL_BULLET_KEYS = [
  "cenik.annualBullet1",
  "cenik.annualBullet2",
  "cenik.annualBullet3",
] as const satisfies readonly ParseKeys<"marketing">[];

const ENTERPRISE_BULLET_KEYS = [
  "cenik.enterpriseBullet1",
  "cenik.enterpriseBullet2",
  "cenik.enterpriseBullet3",
  "cenik.enterpriseBullet4",
] as const satisfies readonly ParseKeys<"marketing">[];

function PricingHeader() {
  const { t } = useTranslation("marketing");
  return (
    <header className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
        {t("cenik.eyebrow")}
      </p>
      <h1 className="mt-2 text-4xl font-bold leading-tight md:text-5xl">{t("cenik.title")}</h1>
      <p className="mt-4 text-base text-text-secondary md:text-lg">{t("cenik.subtitle")}</p>
    </header>
  );
}

function HelperSection({ isVatPayer }: { isVatPayer: boolean }) {
  const { t } = useTranslation("marketing");
  return (
    <section className="mx-auto mt-12 max-w-2xl space-y-2 text-center text-sm text-text-secondary">
      <p>{isVatPayer ? t("cenik.helperVat") : t("cenik.helperNoVat")}</p>
      <p>{t("cenik.helperTrial")}</p>
    </section>
  );
}

export function CenikPage() {
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  usePageTitle(t("meta.pricingTitle"));
  const { settings } = useCenikData();
  const isVatPayer = settings?.is_vat_payer ?? false;

  const enterpriseMailto =
    "mailto:podpora@simplecrm.cz?subject=" +
    encodeURIComponent(t("cenik.mailSubject")) +
    "&body=" +
    encodeURIComponent(t("cenik.mailBody"));

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main>
        <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-16">
          <PricingHeader />

          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            <PlanCard
              eyebrow={t("cenik.monthlyEyebrow")}
              title={t("cenik.monthlyTitle")}
              price={<PriceDisplay baseMinor={9900} interval="monthly" size="xl" hideVatLine />}
              bullets={MONTHLY_BULLET_KEYS.map((k) => t(k))}
              cta={{ label: t("cenik.tryFree"), href: "/login" }}
              secondaryCta={{ label: t("cenik.order"), href: "/objednavka?plan=monthly" }}
            />

            <PlanCard
              eyebrow={t("cenik.annualEyebrow")}
              title={t("cenik.annualTitle")}
              highlighted
              price={<PriceDisplay baseMinor={99600} interval="annual" size="xl" hideVatLine />}
              caption={
                <p className="text-sm font-medium text-success">
                  {t("cenik.savingsCaption", { amount: formatMoney(192, "CZK", locale) })}
                </p>
              }
              bullets={ANNUAL_BULLET_KEYS.map((k) => t(k))}
              cta={{ label: t("cenik.tryFree"), href: "/login" }}
              secondaryCta={{ label: t("cenik.order"), href: "/objednavka?plan=annual" }}
            />

            <PlanCard
              eyebrow={t("cenik.enterpriseEyebrow")}
              title={t("cenik.enterpriseTitle")}
              price={
                <p className="text-5xl font-bold tracking-tight text-text-primary">
                  {t("cenik.enterprisePrice")}
                </p>
              }
              bullets={ENTERPRISE_BULLET_KEYS.map((k) => t(k))}
              cta={{
                label: t("cenik.enterpriseCta"),
                href: enterpriseMailto,
                isExternal: true,
              }}
            />
          </div>

          <HelperSection isVatPayer={isVatPayer} />
        </section>
      </main>
      <Footer />
    </div>
  );
}
