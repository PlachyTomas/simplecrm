import { Handshake } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useDeals } from "@/app/deals/useDeals";
import { useCurrentUser } from "@/auth/useCurrentUser";

function formatMoney(value: string, currency: string, locale: string): string {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(numeric);
  } catch {
    return `${numeric.toLocaleString(locale)} ${currency}`;
  }
}

export function DealsListPage() {
  const { data: deals, isPending, isError } = useDeals();
  const { data: user } = useCurrentUser();

  const locale = user?.organization.locale ?? "cs-CZ";
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);

  if (isError) {
    return (
      <div
        className="m-8 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
        role="alert"
      >
        Obchody se nepodařilo načíst.
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání obchodů…
      </div>
    );
  }

  if (deals.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div
          aria-hidden
          className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Handshake size={24} strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold">Zatím žádné obchody</h2>
        <p className="max-w-sm text-sm text-text-secondary">
          Obchody se zakládají v Pipeline — Kanban v Fázi 5 nabídne rychlé přetažení.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Obchody</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Celkem {deals.total}{" "}
          {deals.total === 1 ? "obchod" : deals.total < 5 ? "obchody" : "obchodů"}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="min-w-full divide-y divide-border-subtle">
          <thead>
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary"
              >
                Název
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary"
              >
                Hodnota
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary"
              >
                Uzavření
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {deals.items.map((deal) => (
              <tr
                key={deal.id}
                className="transition-colors duration-fast hover:bg-surface-overlay"
              >
                <td className="px-4 py-3 text-sm">
                  <Link
                    to={`/app/deals/${deal.id}`}
                    className="font-medium text-text-primary hover:text-accent"
                  >
                    {deal.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-text-primary">
                  {formatMoney(deal.value, deal.currency, locale)}
                </td>
                <td className="px-4 py-3 text-sm text-text-tertiary">
                  {deal.expected_close_date
                    ? dateFmt.format(new Date(deal.expected_close_date))
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
