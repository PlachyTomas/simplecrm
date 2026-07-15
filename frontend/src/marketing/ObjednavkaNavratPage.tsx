import type { ParseKeys } from "i18next";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { usePageTitle } from "@/lib/usePageTitle";
import { Footer, Nav } from "@/marketing/LandingPage";
import { marketingPath } from "@/marketing/slugs";
import { useMarketingLang } from "@/marketing/useMarketingLang";

type ReturnStatus = "paid" | "cancelled" | "pending";

const CONTENT: Record<
  ReturnStatus,
  {
    icon: typeof CheckCircle2;
    iconClass: string;
    titleKey: ParseKeys<"marketing">;
    bodyKey: ParseKeys<"marketing">;
  }
> = {
  paid: {
    icon: CheckCircle2,
    iconClass: "text-success",
    titleKey: "orderReturn.paidTitle",
    bodyKey: "orderReturn.paidBody",
  },
  cancelled: {
    icon: XCircle,
    iconClass: "text-danger",
    titleKey: "orderReturn.cancelledTitle",
    bodyKey: "orderReturn.cancelledBody",
  },
  pending: {
    icon: Clock,
    iconClass: "text-text-tertiary",
    titleKey: "orderReturn.pendingTitle",
    bodyKey: "orderReturn.pendingBody",
  },
};

/**
 * Public landing for the demo-order return redirect from the ComGate
 * gateway (`/objednavka` flow). Status comes from the per-payment
 * url_paid / url_cancelled / url_pending we set at create time — it is
 * display-only and never touches billing state.
 */
export function ObjednavkaNavratPage() {
  const { t } = useTranslation("marketing");
  const lang = useMarketingLang();
  usePageTitle(t("meta.orderReturnTitle"));
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("status");
  const status: ReturnStatus = raw === "paid" || raw === "cancelled" ? raw : "pending";
  const { icon: Icon, iconClass, titleKey, bodyKey } = CONTENT[status];

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-16 text-center md:px-8">
        <Icon size={48} strokeWidth={1.5} aria-hidden className={`mx-auto ${iconClass}`} />
        <h1 className="mt-4 text-2xl font-bold md:text-3xl">{t(titleKey)}</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">
          {t(bodyKey)}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            {t("orderReturn.tryFree")}
          </Link>
          <Link
            to={marketingPath("objednavka", lang)}
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-elevated"
          >
            {status === "cancelled" ? t("orderReturn.retry") : t("orderReturn.backToOrder")}
          </Link>
        </div>
        <p className="mt-6 text-xs text-text-tertiary">
          {t("orderReturn.contactNotePre")}{" "}
          <Link to={marketingPath("kontakt", lang)} className="underline hover:text-text-primary">
            {t("orderReturn.contactLink")}
          </Link>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
}
