import { Handshake } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useCompanies } from "@/app/companies/useCompanies";
import { useDeals } from "@/app/deals/useDeals";
import { stageColor } from "@/app/pipeline/colors";
import { usePipelineBoard } from "@/app/pipeline/useBoard";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { EmptyState } from "@/components/ui/empty-state";
import { csNoun } from "@/lib/i18n/nouns";
import { usePageTitle } from "@/lib/usePageTitle";

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
  usePageTitle("Obchody");
  const navigate = useNavigate();
  const { data: deals, isPending, isError } = useDeals();
  const { data: user } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const { data: board } = usePipelineBoard();
  // Pull a generous batch of companies so we can resolve names without an
  // N+1 fetch per row. Org's full company list usually fits in 200.
  const { data: companiesPage } = useCompanies({ limit: 200 });

  const locale = user?.organization?.locale ?? "cs-CZ";
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);

  const stageById = useMemo(() => {
    const map = new Map<string, { name: string; position: number; color: string }>();
    for (const s of board?.stages ?? []) {
      map.set(s.id, { name: s.name, position: s.position, color: s.color });
    }
    return map;
  }, [board]);

  const ownerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersPage?.items ?? []) map.set(u.id, u.name);
    return map;
  }, [usersPage]);

  const companyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companiesPage?.items ?? []) map.set(c.id, c.name);
    return map;
  }, [companiesPage]);

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
      <div className="px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Obchody</h1>
        </div>
        <EmptyState
          icon={Handshake}
          title="Zatím žádné obchody"
          body="Obchody zakládáte v Pipeline. Tady je uvidíte všechny v seznamu — s firmou, hodnotou, fází a vlastníkem."
          primary={{
            label: "Přejít do Pipeline",
            onClick: () => navigate("/app/pipeline"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Obchody</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Celkem {deals.total} {csNoun(deals.total, "obchod")}
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
                className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary md:table-cell"
              >
                Firma
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary"
              >
                Hodnota
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary md:table-cell"
              >
                Fáze
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary lg:table-cell"
              >
                Vlastník
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary md:table-cell"
              >
                Uzavření
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {deals.items.map((deal) => {
              const stage = stageById.get(deal.stage_id);
              const stageDot = stage ? stageColor(stage.position, stage.color) : null;
              const owner = deal.owner_user_id
                ? (ownerNameById.get(deal.owner_user_id) ?? "—")
                : "—";
              const companyName = companyNameById.get(deal.company_id) ?? "—";
              return (
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
                  <td className="hidden px-4 py-3 text-sm text-text-secondary md:table-cell">
                    {companyName}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-text-primary">
                    {formatMoney(deal.value, deal.currency, locale)}
                  </td>
                  <td className="hidden px-4 py-3 text-sm md:table-cell">
                    {stage && stageDot ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-overlay px-2 py-0.5 text-xs">
                        <span
                          aria-hidden
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: stageDot }}
                        />
                        <span className="text-text-secondary">{stage.name}</span>
                      </span>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-text-secondary lg:table-cell">
                    {owner}
                  </td>
                  <td className="hidden px-4 py-3 text-sm md:table-cell">
                    {deal.closed_at ? (
                      <span className="text-text-secondary">
                        {dateFmt.format(new Date(deal.closed_at))}
                      </span>
                    ) : deal.expected_close_date ? (
                      <span className="text-text-tertiary">
                        ~{dateFmt.format(new Date(deal.expected_close_date))}
                      </span>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
