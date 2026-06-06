import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { usePageTitle } from "@/lib/usePageTitle";
import { Footer, Nav } from "@/marketing/LandingPage";

type ReturnStatus = "paid" | "cancelled" | "pending";

const CONTENT: Record<
  ReturnStatus,
  { icon: typeof CheckCircle2; iconClass: string; title: string; body: string }
> = {
  paid: {
    icon: CheckCircle2,
    iconClass: "text-success",
    title: "Testovací platba proběhla úspěšně",
    body: "Děkujeme za vyzkoušení. Šlo o testovací objednávku — žádná částka nebyla a nebude účtována. Chcete-li SimpleCRM používat naostro, začněte 30denní zkušební verzí zdarma.",
  },
  cancelled: {
    icon: XCircle,
    iconClass: "text-danger",
    title: "Platba byla zrušena",
    body: "Testovací objednávka nebyla dokončena. Nic se neděje — žádná částka nebyla účtována. Můžete to zkusit znovu.",
  },
  pending: {
    icon: Clock,
    iconClass: "text-text-tertiary",
    title: "Platba se zpracovává",
    body: "Testovací platba zatím čeká na potvrzení platební brány. Šlo o testovací objednávku — žádná částka nebude účtována.",
  },
};

/**
 * Public landing for the demo-order return redirect from the ComGate
 * gateway (`/objednavka` flow). Status comes from the per-payment
 * url_paid / url_cancelled / url_pending we set at create time — it is
 * display-only and never touches billing state.
 */
export function ObjednavkaNavratPage() {
  usePageTitle("Výsledek objednávky");
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("status");
  const status: ReturnStatus = raw === "paid" || raw === "cancelled" ? raw : "pending";
  const { icon: Icon, iconClass, title, body } = CONTENT[status];

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-16 text-center md:px-8">
        <Icon size={48} strokeWidth={1.5} aria-hidden className={`mx-auto ${iconClass}`} />
        <h1 className="mt-4 text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">{body}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Vyzkoušet 30 dní zdarma
          </Link>
          <Link
            to="/objednavka"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-elevated"
          >
            {status === "cancelled" ? "Zkusit znovu" : "Zpět na objednávku"}
          </Link>
        </div>
        <p className="mt-6 text-xs text-text-tertiary">
          Máte dotaz k objednávce? Napište nám — kontakty najdete na stránce{" "}
          <Link to="/kontakt" className="underline hover:text-text-primary">
            Kontakt
          </Link>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
}
