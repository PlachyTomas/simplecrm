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
  const moveMutation = useMoveDealStage();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const locale = user?.organization.locale ?? "cs-CZ";

  const activeDeal = useMemo(() => {
    if (!activeDealId || !board) return null;
    for (const stage of board.stages) {
      const match = stage.deals.find((d) => d.id === activeDealId);
      if (match) return match;
    }
    return null;
  }, [activeDealId, board]);

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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between px-4 py-4 md:px-8">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-sm text-text-tertiary">{board.name}</p>
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
          {board.stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              locale={locale}
              boardCurrency={board.currency}
              draggingId={activeDealId}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} locale={locale} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
