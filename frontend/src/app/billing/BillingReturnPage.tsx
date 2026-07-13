/**
 * Landing page after a customer completes (or cancels) a ComGate
 * hosted-payment session. The backend's /api/v1/payments/return route
 * 302s the browser here with a `status=` query param.
 *
 * We don't trust the query for billing state — that's the webhook's
 * job. Read /subscription on mount so the UI reflects whatever
 * actually landed, then route the user onward.
 */

import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { billingErrorMessage } from "@/components/billing/usePayments";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { usePageTitle } from "@/lib/usePageTitle";

type ReturnStatus = "paid" | "pending" | "failed" | "refunded";

function isStatus(v: string | null): v is ReturnStatus {
  return v === "paid" || v === "pending" || v === "failed" || v === "refunded";
}

export function BillingReturnPage() {
  const { t } = useTranslation("billing");
  usePageTitle(t("billingReturnPage.pageTitle"));
  const [params] = useSearchParams();
  const queryStatus = params.get("status");
  const status: ReturnStatus | "unknown" = isStatus(queryStatus) ? queryStatus : "unknown";

  // Re-fetch the subscription on mount so the AppShell + this page
  // reflect whatever the webhook applied while the customer was on
  // the ComGate hosted page.
  const sub = useCurrentSubscription();

  useEffect(() => {
    void sub.refetch();
    // Intentionally only on mount — refetching repeatedly during the
    // webhook race is handled by the user reloading the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-16 text-center">
      {status === "paid" ? (
        <SuccessPanel />
      ) : status === "failed" ? (
        <FailedPanel />
      ) : status === "pending" ? (
        <PendingPanel />
      ) : (
        <UnknownPanel />
      )}
      <div className="flex gap-3">
        <Link
          to="/app/nastaveni/predplatne"
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          {t("billingReturnPage.backToBillingCta")}
        </Link>
        <Link
          to="/app"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
        >
          {t("billingReturnPage.overviewCta")}
        </Link>
      </div>
    </div>
  );
}

function SuccessPanel() {
  const { t } = useTranslation("billing");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">
        {t("billingReturnPage.successHeading")}
      </h1>
      <p className="mt-3 text-sm text-text-secondary">{t("billingReturnPage.successBody")}</p>
    </div>
  );
}

function PendingPanel() {
  const { t } = useTranslation("billing");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">
        {t("billingReturnPage.pendingHeading")}
      </h1>
      <p className="mt-3 text-sm text-text-secondary">{t("billingReturnPage.pendingBody")}</p>
    </div>
  );
}

function FailedPanel() {
  // No structured error code reaches this page (the return route never
  // reflects charge state — see the route's docstring in payments.py), so
  // this always resolves to the shared `errors.generic` copy. Routed
  // through `billingErrorMessage` anyway so the heading and the /payments
  // error codes stay backed by the same catalog entry.
  const { t } = useTranslation("billing");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-danger">{billingErrorMessage(undefined, t)}</h1>
      <p className="mt-3 text-sm text-text-secondary">{t("billingReturnPage.failedBody")}</p>
    </div>
  );
}

function UnknownPanel() {
  const { t } = useTranslation("billing");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">
        {t("billingReturnPage.unknownHeading")}
      </h1>
      <p className="mt-3 text-sm text-text-secondary">{t("billingReturnPage.unknownBody")}</p>
    </div>
  );
}
