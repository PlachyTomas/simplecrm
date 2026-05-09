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

import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { usePageTitle } from "@/lib/usePageTitle";

type ReturnStatus = "paid" | "pending" | "failed" | "refunded";

function isStatus(v: string | null): v is ReturnStatus {
  return v === "paid" || v === "pending" || v === "failed" || v === "refunded";
}

export function BillingReturnPage() {
  usePageTitle("Návrat z platební brány");
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
          Zpět na fakturaci
        </Link>
        <Link
          to="/app"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
        >
          Přehled
        </Link>
      </div>
    </div>
  );
}

function SuccessPanel() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Platba byla úspěšná.</h1>
      <p className="mt-3 text-sm text-text-secondary">
        Děkujeme — vaše předplatné je aktivní. Faktura dorazila na e-mail a najdete ji v sekci
        Fakturace.
      </p>
    </div>
  );
}

function PendingPanel() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Zpracováváme vaši platbu.</h1>
      <p className="mt-3 text-sm text-text-secondary">
        Banka nám platbu potvrdí během několika sekund. Stránku můžete nechat otevřenou nebo se za
        chvíli vrátit do Fakturace.
      </p>
    </div>
  );
}

function FailedPanel() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-danger">Platba se nezdařila.</h1>
      <p className="mt-3 text-sm text-text-secondary">
        Žádné peníze vám nebyly strženy. Zkuste platbu znovu, nebo kontaktujte podporu pokud problém
        přetrvává.
      </p>
    </div>
  );
}

function UnknownPanel() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">
        Vrátili jste se z platební brány.
      </h1>
      <p className="mt-3 text-sm text-text-secondary">
        Stav platby zatím nebyl potvrzen. Zkontrolujte sekci Fakturace, kam ihned po přijetí platby
        přistanou faktury.
      </p>
    </div>
  );
}
