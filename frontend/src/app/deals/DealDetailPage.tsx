import { ArrowLeft } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { useDeal } from "@/app/deals/useDeals";
import { useCurrentUser } from "@/auth/useCurrentUser";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3">
      <dt className="text-sm text-text-tertiary">{label}</dt>
      <dd className="col-span-2 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

export function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const { data: deal, isPending, isError } = useDeal(dealId);
  const { data: user } = useCurrentUser();

  const locale = user?.organization.locale ?? "cs-CZ";
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "long" }), [locale]);

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  if (isError || !deal) {
    return (
      <div className="p-8">
        <Link
          to="/app/deals"
          className="mb-4 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={16} strokeWidth={1.75} /> Zpět na obchody
        </Link>
        <p className="mt-4 text-sm text-danger" role="alert">
          Obchod se nepodařilo načíst.
        </p>
      </div>
    );
  }

  const moneyFmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: deal.currency,
  });
  const value = Number(deal.value);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/app/deals"
        className="mb-4 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.75} /> Zpět na obchody
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{deal.name}</h1>
        <p className="mt-1 font-mono text-lg tabular-nums text-text-primary">
          {Number.isNaN(value) ? `${deal.value} ${deal.currency}` : moneyFmt.format(value)}
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface">
        <dl className="divide-y divide-border-subtle px-6">
          <Field label="Stav">
            {deal.closed_at ? (
              deal.lost_reason ? (
                <span className="inline-flex items-center rounded-full bg-danger-subtle px-3 py-1 text-xs font-medium text-danger">
                  Prohráno · {deal.lost_reason}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-highlight px-3 py-1 text-xs font-medium text-text-on-accent">
                  Vyhráno
                </span>
              )
            ) : (
              <span className="inline-flex items-center rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent">
                Otevřeno
              </span>
            )}
          </Field>
          <Field label="Firma">
            <Link
              to={`/app/companies/${deal.company_id}`}
              className="text-accent hover:text-accent-hover"
            >
              Přejít na firmu
            </Link>
          </Field>
          <Field label="Očekávané uzavření">
            {deal.expected_close_date ? dateFmt.format(new Date(deal.expected_close_date)) : "—"}
          </Field>
          <Field label="Pravděpodobnost">
            {deal.probability_override != null ? `${deal.probability_override} %` : "dle fáze"}
          </Field>
          <Field label="Vytvořeno">{dateFmt.format(new Date(deal.created_at))}</Field>
          {deal.closed_at ? (
            <Field label="Uzavřeno">{dateFmt.format(new Date(deal.closed_at))}</Field>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
