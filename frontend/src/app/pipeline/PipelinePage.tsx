import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Workflow } from "lucide-react";
import { useMemo, useState } from "react";

import {
  type BoardDeal,
  type BoardStage,
  useMoveDealStage,
  usePipelineBoard,
} from "@/app/pipeline/useBoard";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { cn } from "@/lib/utils";

function formatMoney(value: string, currency: string, locale: string): string {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(numeric);
  } catch {
    return `${numeric.toLocaleString(locale)} ${currency}`;
  }
}

interface DealCardProps {
  deal: BoardDeal;
  locale: string;
  dragging?: boolean;
}

function DealCard({ deal, locale, dragging }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
    data: { type: "deal", stageId: deal.stage_id },
  });

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-label={`${deal.name} — ${formatMoney(deal.value, deal.currency, locale)}`}
      className={cn(
        "cursor-grab select-none rounded-md border border-border bg-surface px-3 py-3 shadow-sm transition-shadow duration-fast hover:shadow-md active:cursor-grabbing",
        dragging && "opacity-0",
      )}
    >
      <p className="truncate text-sm font-medium text-text-primary">{deal.name}</p>
      <p className="mt-1 font-mono text-xs tabular-nums text-text-secondary">
        {formatMoney(deal.value, deal.currency, locale)}
      </p>
    </article>
  );
}

interface StageColumnProps {
  stage: BoardStage;
  locale: string;
  boardCurrency: string;
  draggingId: string | null;
}

function StageColumn({ stage, locale, boardCurrency, draggingId }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "stage" },
  });

  return (
    <section
      aria-label={`Fáze ${stage.name}`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface transition-colors duration-fast",
        isOver && "ring-2 ring-accent",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            {stage.deal_count}{" "}
            {stage.deal_count === 1 ? "obchod" : stage.deal_count < 5 ? "obchody" : "obchodů"} ·{" "}
            {formatMoney(stage.total_value, boardCurrency, locale)}
          </p>
        </div>
      </header>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-3">
        {stage.deals.length === 0 ? (
          <p className="text-xs text-text-tertiary">Zatím žádné obchody.</p>
        ) : (
          stage.deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} locale={locale} dragging={draggingId === deal.id} />
          ))
        )}
      </div>
    </section>
  );
}

export function PipelinePage() {
  const { data: board, isPending, isError } = usePipelineBoard();
  const { data: user } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const moveMutation = useMoveDealStage();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine" | string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const locale = user?.organization.locale ?? "cs-CZ";

  const filteredStages = useMemo<BoardStage[]>(() => {
    if (!board) return [];
    const normalized = searchTerm.trim().toLowerCase();
    return board.stages.map((stage) => {
      const deals = stage.deals.filter((deal) => {
        if (ownerFilter === "mine" && deal.owner_user_id !== user?.id) return false;
        if (
          ownerFilter !== "all" &&
          ownerFilter !== "mine" &&
          deal.owner_user_id !== ownerFilter
        ) {
          return false;
        }
        if (normalized && !deal.name.toLowerCase().includes(normalized)) return false;
        return true;
      });
      const total = deals.reduce((acc, d) => {
        if (d.currency === board.currency) return acc + Number(d.value);
        return acc;
      }, 0);
      return {
        ...stage,
        deals,
        deal_count: deals.length,
        total_value: String(total),
      };
    });
  }, [board, ownerFilter, searchTerm, user?.id]);

  const activeDeal = useMemo(() => {
    if (!activeDealId || !board) return null;
    for (const stage of board.stages) {
      const match = stage.deals.find((d) => d.id === activeDealId);
      if (match) return match;
    }
    return null;
  }, [activeDealId, board]);

  const hasActiveFilter = ownerFilter !== "all" || searchTerm.trim().length > 0;
  const canPickOwner = user?.role === "admin" || user?.role === "manager";

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const stageId = String(over.id);
    const fromStage = active.data.current?.stageId;
    if (fromStage === stageId) return;
    moveMutation.mutate({ dealId, stageId });
  };

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání pipeline…
      </div>
    );
  }

  if (isError || !board) {
    return (
      <div
        className="m-8 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
        role="alert"
      >
        Pipeline se nepodařilo načíst.
      </div>
    );
  }

  const hasAnyDeals = board.stages.some((s) => s.deals.length > 0);
  const hasFilteredDeals = filteredStages.some((s) => s.deals.length > 0);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-4 md:px-8">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-sm text-text-tertiary">{board.name}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs font-medium text-text-tertiary">
            Hledat
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Název obchodu…"
              className="mt-1 w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          {canPickOwner ? (
            <label className="flex flex-col text-xs font-medium text-text-tertiary">
              Vlastník
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              >
                <option value="all">Všichni</option>
                <option value="mine">Moje obchody</option>
                <optgroup label="Obchodníci">
                  {(usersPage?.items ?? [])
                    .filter((u) => u.is_active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
          ) : (
            <label className="flex flex-col text-xs font-medium text-text-tertiary">
              Zobrazit
              <select
                value={ownerFilter === "mine" ? "mine" : "all"}
                onChange={(e) => setOwnerFilter(e.target.value === "mine" ? "mine" : "all")}
                className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              >
                <option value="all">Vše v mém rozsahu</option>
                <option value="mine">Pouze moje obchody</option>
              </select>
            </label>
          )}
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={() => {
                setOwnerFilter("all");
                setSearchTerm("");
              }}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              Zrušit filtr
            </button>
          ) : null}
        </div>
      </div>

      {!hasAnyDeals ? (
        <div className="mx-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface py-12 text-center md:mx-8">
          <div
            aria-hidden
            className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-accent"
          >
            <Workflow size={24} strokeWidth={1.75} />
          </div>
          <h2 className="text-lg font-semibold">Žádné obchody v pipeline</h2>
          <p className="max-w-md text-sm text-text-secondary">
            Založte první obchod ve firemním detailu nebo přes rychlé akce. Jakmile tu bude, můžete
            ho přetáhnout mezi fázemi.
          </p>
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={(event) => setActiveDealId(String(event.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDealId(null)}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto px-4 pb-6 md:px-8">
          {filteredStages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              locale={locale}
              boardCurrency={board.currency}
              draggingId={activeDealId}
            />
          ))}
        </div>
        {hasAnyDeals && !hasFilteredDeals ? (
          <p
            className="px-4 pb-4 text-center text-sm text-text-tertiary md:px-8"
            role="status"
          >
            Žádné obchody neodpovídají filtru.
          </p>
        ) : null}

        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} locale={locale} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
