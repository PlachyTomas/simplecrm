import { Check } from "lucide-react";
import { Link } from "react-router-dom";

import { PriceDisplay } from "@/components/billing/PriceDisplay";
import { cn } from "@/lib/utils";
import { useCenikData } from "@/marketing/cenikData";
import { Footer, Nav } from "@/marketing/LandingPage";

const ENTERPRISE_MAILTO =
  "mailto:podpora@simplecrm.cz" +
  "?subject=" +
  encodeURIComponent("SimpleCRM enterprise poptávka") +
  "&body=" +
  encodeURIComponent(
    "Dobrý den,\n\n" +
      "rád/a bych s vámi probral/a enterprise nabídku SimpleCRM.\n\n" +
      "Počet uživatelů (přibližně):\n" +
      "Společnost (název, IČO):\n" +
      "Telefon:\n\n" +
      "Děkuji,\n",
  );

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
          aria-label="Doporučujeme — ušetříte 16 procent"
        >
          Doporučujeme · Ušetříte 16 %
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

const MONTHLY_BULLETS = ["Bez závazků", "Zrušení kdykoliv", "Plná funkcionalita"] as const;

const ANNUAL_BULLETS = [
  "Vše z měsíčního plánu",
  "Účtováno jednou ročně",
  "Bez závazků po skončení období",
] as const;

const ENTERPRISE_BULLETS = [
  "25+ uživatelů",
  "Vlastní cena a podmínky",
  "Dedikovaná podpora",
  "Jednání o SLA",
] as const;

function PricingHeader() {
  return (
    <header className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">Ceník</p>
      <h1 className="mt-2 text-4xl font-bold leading-tight md:text-5xl">
        Cena za to, co nabízíme.
      </h1>
      <p className="mt-4 text-base text-text-secondary md:text-lg">
        Stejná cena bez ohledu na velikost týmu. Bez závazků, bez zbytečností. Vyzkoušejte 30 dní
        zdarma a rozhodněte se pak.
      </p>
    </header>
  );
}

function HelperSection({ isVatPayer }: { isVatPayer: boolean }) {
  return (
    <section className="mx-auto mt-12 max-w-2xl space-y-2 text-center text-sm text-text-secondary">
      <p>
        {isVatPayer
          ? "Ceny bez DPH; konečné ceny zobrazujeme s 21% DPH."
          : "Všechny ceny jsou bez DPH."}
      </p>
      <p>Zkušební doba je 30 dní. Žádná kreditní karta při registraci.</p>
    </section>
  );
}

export function CenikPage() {
  const { settings } = useCenikData();
  const isVatPayer = settings?.is_vat_payer ?? false;

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main>
        <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-16">
          <PricingHeader />

          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            <PlanCard
              eyebrow="Měsíčně"
              title="Měsíční"
              price={<PriceDisplay baseMinor={9900} interval="monthly" size="xl" hideVatLine />}
              bullets={MONTHLY_BULLETS}
              cta={{ label: "Vyzkoušet 30 dní zdarma", href: "/login" }}
              secondaryCta={{ label: "Objednat", href: "/objednavka?plan=monthly" }}
            />

            <PlanCard
              eyebrow="Ročně"
              title="Roční"
              highlighted
              price={<PriceDisplay baseMinor={99900} interval="annual" size="xl" hideVatLine />}
              caption={
                <p className="text-sm font-medium text-success">
                  Ušetříte 189 Kč na uživatele · 2 měsíce zdarma
                </p>
              }
              bullets={ANNUAL_BULLETS}
              cta={{ label: "Vyzkoušet 30 dní zdarma", href: "/login" }}
              secondaryCta={{ label: "Objednat", href: "/objednavka?plan=annual" }}
            />

            <PlanCard
              eyebrow="Pro velké týmy"
              title="Enterprise"
              price={
                <p className="text-5xl font-bold tracking-tight text-text-primary">
                  Vlastní balíček
                </p>
              }
              bullets={ENTERPRISE_BULLETS}
              cta={{
                label: "Domluvte se s námi",
                href: ENTERPRISE_MAILTO,
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
