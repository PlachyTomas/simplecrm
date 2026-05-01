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
import { Check, Plus, Trash2, Workflow, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddDealModal } from "@/app/deals/AddDealModal";
import { MarkLostDialog } from "@/app/deals/MarkLostDialog";
import { useMarkAnyDealLost, useMarkAnyDealWon } from "@/app/deals/useDealActions";
import { useDeleteAnyDeal } from "@/app/deals/useDeals";
import { stageColor } from "@/app/pipeline/colors";
import {
  type BoardDeal,
  type BoardStage,
  type WonWindow,
  useMoveDealStage,
  usePipelineBoard,
} from "@/app/pipeline/useBoard";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { EmptyState } from "@/components/ui/empty-state";
import { celebrateWin } from "@/lib/celebrate";
import { csNoun } from "@/lib/i18n/nouns";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

const WON_WINDOW_STORAGE_KEY = "pipeline-won-window-days";
const WON_WINDOW_OPTIONS: { value: WonWindow; label: string }[] = [
  { value: 7, label: "7 dní" },
  { value: 30, label: "30 dní" },
  { value: 90, label: "90 dní" },
  { value: "all", label: "Vše" },
];

function loadWonWindow(): WonWindow {
  if (typeof window === "undefined") return 30;
  const raw = window.localStorage.getItem(WON_WINDOW_STORAGE_KEY);
  if (raw === "all") return "all";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

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
  /** When this stage is "won" the win button hides — the deal is already there. */
  onWin?: (anchor: HTMLElement | null) => void;
  onLose?: () => void;
  winning?: boolean;
  losing?: boolean;
}

function DealCard({ deal, locale, dragging, onWin, onLose, winning, losing }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
    data: { type: "deal", stageId: deal.stage_id },
  });
  const winButtonRef = useRef<HTMLButtonElement>(null);

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
        "group/card relative cursor-grab select-none rounded-md border border-border bg-surface px-3 py-3 shadow-sm transition-shadow duration-fast hover:shadow-md active:cursor-grabbing",
        dragging && "opacity-0",
      )}
    >
      <p className="truncate text-sm font-medium text-text-primary">{deal.name}</p>
      <p className="mt-1 font-mono text-xs tabular-nums text-text-secondary">
        {formatMoney(deal.value, deal.currency, locale)}
      </p>
      {onWin || onLose ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/card:opacity-100 max-md:opacity-100">
          {onWin ? (
            <button
              ref={winButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onWin(winButtonRef.current);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={winning}
              aria-label={`Označit obchod ${deal.name} jako vyhraný`}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-brand-accent px-2 text-xs font-semibold text-text-on-brand-accent transition-colors duration-fast hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={12} strokeWidth={2} aria-hidden /> Vyhráno
            </button>
          ) : null}
          {onLose ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onLose();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={losing}
              aria-label={`Označit obchod ${deal.name} jako neúspěch`}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface-overlay px-2 text-xs font-medium text-text-secondary transition-colors duration-fast hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={12} strokeWidth={2} aria-hidden /> Neúspěch
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

interface StageColumnProps {
  stage: BoardStage;
  locale: string;
  boardCurrency: string;
  draggingId: string | null;
  onAddDeal: (stageId: string) => void;
  onWinDeal: (deal: BoardDeal, anchor: HTMLElement | null) => void;
  onLoseDeal: (deal: BoardDeal) => void;
  winningDealId: string | null;
  losingDealId: string | null;
}

function StageColumn({
  stage,
  locale,
  boardCurrency,
  draggingId,
  onAddDeal,
  onWinDeal,
  onLoseDeal,
  winningDealId,
  losingDealId,
}: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "stage" },
  });

  // Stage palette is keyed off `position` so admin-renamed stages keep
  // their semantic color. Falls back to the stored `color` for any custom
  // stages beyond the seeded six.
  const dotColor = stageColor(stage.position, stage.color);
  // 2–3px left seam in the stage color — brief §4 "kanban columns get a
  // left-seam color accent, do not tint the full card background".
  const seamStyle: React.CSSProperties = { boxShadow: `inset 3px 0 0 ${dotColor}` };

  return (
    <section
      aria-label={`Fáze ${stage.name}`}
      style={seamStyle}
      className={cn(
        "group/column flex w-[92vw] shrink-0 snap-start flex-col rounded-lg border border-border bg-surface transition-colors duration-fast md:w-72",
        isOver && "ring-2 ring-accent",
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
            <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            {stage.deal_count} {csNoun(stage.deal_count, "obchod")} ·{" "}
            {formatMoney(stage.total_value, boardCurrency, locale)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAddDeal(stage.id)}
          aria-label={`Přidat obchod do fáze ${stage.name}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary opacity-0 transition-opacity duration-fast hover:bg-surface-overlay hover:text-text-primary focus-visible:opacity-100 group-hover/column:opacity-100 max-md:opacity-100"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
      </header>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-3">
        {stage.deals.length === 0 ? (
          <p className="text-xs text-text-tertiary">Zatím žádné obchody.</p>
        ) : (
          stage.deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              locale={locale}
              dragging={draggingId === deal.id}
              onWin={
                stage.stage_type === "won"
                  ? undefined
                  : (anchor) => onWinDeal(deal, anchor)
              }
              onLose={stage.stage_type === "won" ? undefined : () => onLoseDeal(deal)}
              winning={winningDealId === deal.id}
              losing={losingDealId === deal.id}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function PipelinePage() {
  usePageTitle("Pipeline");
  const [wonWindow, setWonWindow] = useState<WonWindow>(() => loadWonWindow());
  const { data: board, isPending, isError } = usePipelineBoard(wonWindow);
  const { data: user } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const moveMutation = useMoveDealStage();
  const winMutation = useMarkAnyDealWon();
  const loseMutation = useMarkAnyDealLost();
  const deleteMutation = useDeleteAnyDeal();
  const toast = useToast();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine" | string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [addDealStageId, setAddDealStageId] = useState<string | undefined>(undefined);
  const [winningDealId, setWinningDealId] = useState<string | null>(null);
  const [winToast, setWinToast] = useState<string | null>(null);
  const [losingDealTarget, setLosingDealTarget] = useState<BoardDeal | null>(null);
  const [deletingDealTarget, setDeletingDealTarget] = useState<BoardDeal | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const locale = user?.organization?.locale ?? "cs-CZ";

  const moneyFmt = useMemo(
    () =>
      board
        ? new Intl.NumberFormat(locale, {
            style: "currency",
            currency: board.currency,
            maximumFractionDigits: 0,
          })
        : null,
    [board, locale],
  );

  const handleWinDeal = useCallback(
    (deal: BoardDeal, anchor: HTMLElement | null) => {
      if (winningDealId) return;
      setWinningDealId(deal.id);
      celebrateWin(anchor);
      const formattedValue = moneyFmt
        ? moneyFmt.format(Number(deal.value))
        : `${deal.value} ${deal.currency}`;
      setWinToast(`🎉 Gratulujeme! Obchod ${deal.name} ve výši ${formattedValue} uzavřen.`);
      winMutation.mutate(
        { dealId: deal.id },
        {
          onSettled: () => setWinningDealId(null),
        },
      );
    },
    [winMutation, winningDealId, moneyFmt],
  );

  const handleLoseDeal = useCallback((deal: BoardDeal) => {
    setLosingDealTarget(deal);
  }, []);

  const handleConfirmLose = useCallback(
    (reason: string) => {
      if (!losingDealTarget) return;
      const target = losingDealTarget;
      loseMutation.mutate(
        { dealId: target.id, lost_reason: reason },
        {
          onSuccess: () => {
            toast.success(`Obchod ${target.name} označen jako neúspěch.`);
            setLosingDealTarget(null);
          },
          onError: () => {
            toast.error("Obchod se nepodařilo označit jako neúspěch.");
          },
        },
      );
    },
    [loseMutation, losingDealTarget, toast],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deletingDealTarget) return;
    const target = deletingDealTarget;
    deleteMutation.mutate(
      { dealId: target.id },
      {
        onSuccess: () => {
          toast.success(`Obchod ${target.name} smazán.`);
          setDeletingDealTarget(null);
        },
        onError: () => {
          toast.error("Obchod se nepodařilo smazat.");
        },
      },
    );
  }, [deleteMutation, deletingDealTarget, toast]);

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

  // Memoize the stage options passed to AddDealModal so that background
  // refetches of the board don't reset the form mid-edit.
  const modalStageOptions = useMemo(
    () => (board?.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
    [board?.stages],
  );

  const hasActiveFilter = ownerFilter !== "all" || searchTerm.trim().length > 0;
  const canPickOwner = user?.role === "admin" || user?.role === "manager";

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const overId = String(over.id);
    if (overId === "trash") {
      const dropped = board?.stages.flatMap((s) => s.deals).find((d) => d.id === dealId);
      if (dropped) setDeletingDealTarget(dropped);
      return;
    }
    const fromStage = active.data.current?.stageId;
    if (fromStage === overId) return;
    moveMutation.mutate({ dealId, stageId: overId });
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
          {hasAnyDeals ? (
            <button
              type="button"
              onClick={() => {
                setAddDealStageId(undefined);
                setAddDealOpen(true);
              }}
              className="hidden h-9 items-center gap-1 rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover md:inline-flex"
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              <span>Přidat obchod</span>
            </button>
          ) : null}
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
          <label className="flex flex-col text-xs font-medium text-text-tertiary">
            Vyhrané za
            <select
              value={String(wonWindow)}
              onChange={(e) => {
                const raw = e.target.value;
                const next: WonWindow = raw === "all" ? "all" : Number(raw);
                setWonWindow(next);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(WON_WINDOW_STORAGE_KEY, String(next));
                }
              }}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {WON_WINDOW_OPTIONS.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
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
        <div className="mx-4 rounded-lg border border-border bg-surface md:mx-8">
          <EmptyState
            icon={Workflow}
            title="Přidejte první obchod"
            body="Sledujte obchody napříč fázemi pipeline. Karty přetahujte mezi sloupci podle vývoje."
            primary={{
              label: "+ Přidat obchod",
              onClick: () => {
                setAddDealStageId(undefined);
                setAddDealOpen(true);
              },
            }}
          />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(event) => setActiveDealId(String(event.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDealId(null)}
        >
          <div className="flex flex-1 snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-6 [scroll-padding-left:1rem] md:snap-none md:px-8">
            {filteredStages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                locale={locale}
                boardCurrency={board.currency}
                draggingId={activeDealId}
                onAddDeal={(stageId) => {
                  setAddDealStageId(stageId);
                  setAddDealOpen(true);
                }}
                onWinDeal={handleWinDeal}
                onLoseDeal={handleLoseDeal}
                winningDealId={winningDealId}
                losingDealId={losingDealTarget?.id ?? null}
              />
            ))}
          </div>
          {!hasFilteredDeals ? (
            <p
              className="px-4 pb-4 text-center text-sm text-text-tertiary md:px-8"
              role="status"
            >
              Žádné obchody neodpovídají filtru.
            </p>
          ) : null}

          <TrashDropZone visible={activeDealId !== null} />

          <DragOverlay>
            {activeDeal ? <DealCard deal={activeDeal} locale={locale} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Mobile FAB — header CTA collapses to bottom-right at <768px when
          there are deals on the board. Empty state shows its own primary CTA. */}
      {hasAnyDeals ? (
        <button
          type="button"
          onClick={() => {
            setAddDealStageId(undefined);
            setAddDealOpen(true);
          }}
          aria-label="Přidat obchod"
          className="fixed bottom-20 right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-text-on-accent shadow-lg transition-colors duration-fast hover:bg-accent-hover md:hidden"
        >
          <Plus size={22} strokeWidth={2} />
        </button>
      ) : null}

      <AddDealModal
        open={addDealOpen}
        onClose={() => setAddDealOpen(false)}
        stages={modalStageOptions}
        initialStageId={addDealStageId}
      />

      {winToast ? (
        <WinToast message={winToast} onDismiss={() => setWinToast(null)} />
      ) : null}

      <MarkLostDialog
        open={losingDealTarget !== null}
        onClose={() => setLosingDealTarget(null)}
        pending={loseMutation.isPending}
        dealName={losingDealTarget?.name}
        onConfirm={handleConfirmLose}
      />

      <DeleteConfirmDialog
        deal={deletingDealTarget}
        pending={deleteMutation.isPending}
        onCancel={() => setDeletingDealTarget(null)}
        onConfirm={handleConfirmDelete}
        moneyFmt={moneyFmt}
      />
    </div>
  );
}

function TrashDropZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "trash", data: { type: "trash" } });
  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label="Smazat obchod"
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center justify-center px-4 pb-4 transition-opacity duration-fast",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm font-medium shadow-lg transition-colors duration-fast",
          isOver
            ? "border-danger bg-danger text-white"
            : "border-danger-subtle bg-surface text-danger",
        )}
      >
        <Trash2 size={16} strokeWidth={1.75} aria-hidden />
        <span>{isOver ? "Pustit pro smazání" : "Sem přetáhněte pro smazání"}</span>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  deal,
  pending,
  onCancel,
  onConfirm,
  moneyFmt,
}: {
  deal: BoardDeal | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  moneyFmt: Intl.NumberFormat | null;
}) {
  if (!deal) return null;
  const formattedValue = moneyFmt
    ? moneyFmt.format(Number(deal.value))
    : `${deal.value} ${deal.currency}`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-deal-title"
      className="bg-bg/80 fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
        <h2 id="delete-deal-title" className="text-xl font-semibold">
          Smazat obchod?
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Smaže obchod <strong className="text-text-primary">{deal.name}</strong> ({formattedValue}
          ) natrvalo. Akci nelze vrátit zpět.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Mažu…" : "Smazat"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WinToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  // Auto-dismiss after 4 seconds (sonner-like default for non-error toasts).
  useEffect(() => {
    const id = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(id);
    // Re-arm whenever the message text changes — covers the case where
    // a second win lands while a first is still on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-brand-accent bg-brand-accent-subtle px-4 py-3 text-sm text-text-primary shadow-lg"
    >
      <div className="flex items-center gap-3">
        <span className="max-w-xs">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Zavřít oznámení"
          className="text-text-tertiary hover:text-text-primary"
        >
          ×
        </button>
      </div>
    </div>
  );
}
