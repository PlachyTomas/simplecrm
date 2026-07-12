import { Handshake } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DealDetailDialog } from "@/app/deals/DealDetailDialog";
import { useDealDialog } from "@/app/deals/useDealDialog";
import { useDeals } from "@/app/deals/useDeals";
import { stageColor } from "@/app/pipeline/colors";
import { usePipelineBoard } from "@/app/pipeline/useBoard";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/format";
import { csNoun } from "@/lib/i18n/nouns";
import { useLocale } from "@/lib/i18n/useLocale";
import { usePageTitle } from "@/lib/usePageTitle";

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary";

export function DealsListPage() {
  usePageTitle("Obchody");
  const navigate = useNavigate();
  const { data: deals, isPending, isError } = useDeals();
  const { data: board } = usePipelineBoard();
  const { dealId: dialogDealId, openDeal, closeDeal } = useDealDialog();

  const locale = useLocale();
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);

  // The board is only consulted for a stage's semantic dot color; the stage
  // *name* now arrives denormalized on each deal.
  const stageColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of board?.stages ?? []) map.set(s.id, stageColor(s.position, s.color));
    return map;
  }, [board]);

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

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="min-w-full divide-y divide-border-subtle">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Název
              </th>
              <th scope="col" className={`${TH} hidden md:table-cell`}>
                Firma
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Hodnota
              </th>
              <th scope="col" className={`${TH} hidden md:table-cell`}>
                Fáze
              </th>
              <th scope="col" className={`${TH} hidden lg:table-cell`}>
                Vlastník
              </th>
              <th scope="col" className={`${TH} hidden md:table-cell`}>
                Uzavření
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {deals.items.map((deal) => {
              const dotColor = stageColorById.get(deal.stage_id);
              return (
                <tr
                  key={deal.id}
                  onClick={() => openDeal(deal.id)}
                  className="cursor-pointer transition-colors duration-fast hover:bg-surface-overlay"
                >
                  <td className="px-4 py-3 text-sm">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeal(deal.id);
                      }}
                      className="text-left font-medium text-text-primary hover:text-accent"
                    >
                      {deal.name}
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-text-secondary md:table-cell">
                    {deal.company_name}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-text-primary">
                    {Number(deal.value) > 0 ? (
                      formatMoney(deal.value, deal.currency, locale)
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-sm md:table-cell">
                    {dotColor ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-overlay px-2 py-0.5 text-xs">
                        <span
                          aria-hidden
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="text-text-secondary">{deal.stage_name}</span>
                      </span>
                    ) : (
                      <span className="text-text-secondary">{deal.stage_name}</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-text-secondary lg:table-cell">
                    {deal.owner_name ?? "—"}
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

      {dialogDealId ? <DealDetailDialog dealId={dialogDealId} onClose={closeDeal} /> : null}
    </div>
  );
}
