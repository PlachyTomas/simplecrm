import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { Crown, Plus, Trash2, Workflow, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AddDealModal } from "@/app/deals/AddDealModal";
import { DealDetailDialog } from "@/app/deals/DealDetailDialog";
import { MarkLostDialog } from "@/app/deals/MarkLostDialog";
import {
  useMarkAnyDealLost,
  useMarkAnyDealWon,
  useToggleAnyDealPayment,
} from "@/app/deals/useDealActions";
import { useDealDialog } from "@/app/deals/useDealDialog";
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
import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { useModalDialog } from "@/lib/useModalDialog";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

const WON_WINDOW_STORAGE_KEY = "pipeline-won-window-days";
const WON_WINDOW_VALUES: WonWindow[] = [7, 30, 90, "all"];

function loadWonWindow(): WonWindow {
  // localStorage can be absent (SSR, some webviews) or throw on access (Safari
  // private mode, storage disabled) — never let a preference read crash the page.
  let raw: string | null | undefined;
  try {
    raw = window.localStorage?.getItem(WON_WINDOW_STORAGE_KEY);
  } catch {
    return 30;
  }
  if (raw === "all") return "all";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

// A deal with value 0 is treated as "value not yet entered" — we hide
// the money line on the card / list / detail rather than render a zero
// amount everywhere. See docs/tasks/2026-05-13-feedback-batch.md §2.
function hasValue(value: string): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

// Shown on the card when the value is missing — the creation date is the
// most useful always-available fact for a lead without a number yet.
function formatCreatedDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

interface CardActionButtonProps {
  /** Short tooltip text shown on hover/focus. */
  label: string;
  /** Full screen-reader label including the deal name. */
  ariaLabel: string;
  disabled?: boolean;
  /** Receives the button element so callers can anchor effects (confetti). */
  onActivate: (el: HTMLButtonElement | null) => void;
  className?: string;
  children: ReactNode;
}

// Icon-only card quick-action with a styled tooltip on hover/focus. The
// tooltip is position:fixed off the button rect (house pattern, see
// GatedMailButton) so the column's overflow-y-auto can't clip it.
function CardActionButton({
  label,
  ariaLabel,
  disabled,
  onActivate,
  className,
  children,
}: CardActionButtonProps) {
  const tooltipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          // Keep the card's open-dialog click handler out of the way.
          e.stopPropagation();
          e.preventDefault();
          hide();
          onActivate(btnRef.current);
        }}
        // Stop dnd-kit from starting a drag from the button.
        onPointerDown={(e) => e.stopPropagation()}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-md shadow-sm transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {children}
      </button>
      {pos
        ? // Portaled to <body>: the button sits inside a translated wrapper,
          // and a transformed ancestor would re-base position:fixed coords.
          createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 80 }}
              className="pointer-events-none -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-text-secondary shadow-md"
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

interface DealCardProps {
  deal: BoardDeal;
  locale: string;
  dragging?: boolean;
  /** When this stage is "won" the win button hides — the deal is already there. */
  onWin?: (anchor: HTMLElement | null) => void;
  onLose?: () => void;
  /** Provided only on cards in a won stage; toggles is_paid via the API. */
  onTogglePaid?: (next: boolean) => void;
  /** Open the deal detail dialog. Fires on a click/Enter that isn't a drag. */
  onOpen?: (id: string) => void;
  winning?: boolean;
  losing?: boolean;
  paymentPending?: boolean;
}

function DealCard({
  deal,
  locale,
  dragging,
  onWin,
  onLose,
  onTogglePaid,
  onOpen,
  winning,
  losing,
  paymentPending,
}: DealCardProps) {
  const { t } = useTranslation("deals");
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
    data: { type: "deal", stageId: deal.stage_id },
  });
  // Distinguish a click (open the dialog) from a drag. dnd-kit starts a drag
  // after 6px of movement, so we record where the pointer went down (in the
  // capture phase, to avoid clobbering dnd-kit's own onPointerDown) and only
  // open if the pointer barely moved.
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  const valueShown = hasValue(deal.value);

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onPointerDownCapture={(e) => {
        pointerStart.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        if (!onOpen) return;
        // Ignore clicks that bubbled up from an inner control (win/lose/paid).
        if (e.defaultPrevented) return;
        const start = pointerStart.current;
        const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;
        if (moved <= 6) onOpen(deal.id);
      }}
      onKeyDown={(e) => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(deal.id);
        }
      }}
      aria-label={
        valueShown
          ? `${deal.name} — ${formatMoney(deal.value, deal.currency, locale)}`
          : `${deal.name} — ${t("pipelinePage.card.createdAriaSuffix", { date: formatCreatedDate(deal.created_at, locale) })}`
      }
      className={cn(
        "group/card relative cursor-grab select-none rounded-md border bg-surface px-3 py-2.5 shadow-sm transition-shadow duration-fast hover:shadow-md active:cursor-grabbing",
        // Soft-magenta outline on paid deals so the won column visually
        // separates collected revenue from outstanding receivables.
        deal.is_paid ? "border-brand-accent-border bg-brand-accent-subtle" : "border-border",
        "max-md:w-64 max-md:shrink-0 max-md:snap-start",
        dragging && "opacity-0",
      )}
    >
      <p className="truncate text-sm font-medium text-text-primary">{deal.name}</p>
      <p className="mt-1 truncate text-xs text-text-secondary">{deal.company_name}</p>
      {valueShown ? (
        <p className="mt-0.5 font-mono text-xs tabular-nums text-text-secondary">
          {formatMoney(deal.value, deal.currency, locale)}
        </p>
      ) : (
        <p className="mt-0.5 text-xs tabular-nums text-text-tertiary">
          {t("pipelinePage.card.createdLabel", {
            date: formatCreatedDate(deal.created_at, locale),
          })}
        </p>
      )}
      {onTogglePaid ? (
        <label
          // Stop dnd-kit from kicking in when the user clicks the checkbox.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-flex select-none items-center gap-2 text-xs text-text-secondary"
        >
          <input
            type="checkbox"
            checked={deal.is_paid}
            disabled={paymentPending}
            onChange={(e) => onTogglePaid(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border text-brand-accent focus:ring-brand-accent"
          />
          {t("pipelinePage.card.paid")}
        </label>
      ) : null}
      {onWin || onLose ? (
        // Quick actions overlay the card's right edge instead of taking a
        // row of their own — hidden until hover/focus so resting cards stay
        // compact, with no blank strip reserved for them.
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/card:opacity-100">
          {onWin ? (
            <CardActionButton
              label={t("pipelinePage.card.winTooltip")}
              ariaLabel={t("pipelinePage.card.winAriaLabel", { name: deal.name })}
              disabled={winning}
              onActivate={(el) => onWin(el)}
              className="bg-brand-accent text-text-on-brand-accent hover:bg-brand-accent-hover"
            >
              <Crown size={13} strokeWidth={2} aria-hidden />
            </CardActionButton>
          ) : null}
          {onLose ? (
            <CardActionButton
              label={t("pipelinePage.card.loseTooltip")}
              ariaLabel={t("pipelinePage.card.loseAriaLabel", { name: deal.name })}
              disabled={losing}
              onActivate={() => onLose()}
              className="border border-border bg-surface-overlay text-text-secondary hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger"
            >
              <X size={13} strokeWidth={2} aria-hidden />
            </CardActionButton>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// Mobile-only card. Unlike DealCard it isn't draggable (the mobile board
// shows one stage at a time, so cross-stage moves use a select instead of
// drag), which also means it can live outside the DndContext.
function MobileDealCard({
  deal,
  locale,
  stageType,
  stages,
  onWin,
  onLose,
  onTogglePaid,
  onMove,
  onOpen,
  winning,
  losing,
  paymentPending,
}: {
  deal: BoardDeal;
  locale: string;
  stageType: BoardStage["stage_type"];
  stages: BoardStage[];
  onWin?: () => void;
  onLose?: () => void;
  onTogglePaid?: (next: boolean) => void;
  onMove: (dealId: string, stageId: string) => void;
  onOpen?: (id: string) => void;
  winning?: boolean;
  losing?: boolean;
  paymentPending?: boolean;
}) {
  const { t } = useTranslation("deals");
  const valueShown = hasValue(deal.value);
  return (
    <article
      className={cn(
        "rounded-md border px-3 py-2.5 shadow-sm",
        deal.is_paid
          ? "border-brand-accent-border bg-brand-accent-subtle"
          : "border-border bg-surface",
      )}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(deal.id)}
          className="block w-full text-left text-sm font-medium text-text-primary hover:text-accent"
        >
          {deal.name}
        </button>
      ) : (
        <p className="text-sm font-medium text-text-primary">{deal.name}</p>
      )}
      <p className="mt-1 truncate text-xs text-text-secondary">{deal.company_name}</p>
      {valueShown ? (
        <p className="mt-0.5 font-mono text-xs tabular-nums text-text-secondary">
          {formatMoney(deal.value, deal.currency, locale)}
        </p>
      ) : (
        <p className="mt-0.5 text-xs tabular-nums text-text-tertiary">
          {t("pipelinePage.card.createdLabel", {
            date: formatCreatedDate(deal.created_at, locale),
          })}
        </p>
      )}
      {stageType === "won" ? (
        <label className="mt-2 inline-flex select-none items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={deal.is_paid}
            disabled={paymentPending}
            onChange={(e) => onTogglePaid?.(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border text-brand-accent focus:ring-brand-accent"
          />
          {t("pipelinePage.card.paid")}
        </label>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onWin?.()}
            disabled={winning}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-brand-accent px-2 text-xs font-semibold text-text-on-brand-accent transition-colors duration-fast hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Crown size={12} strokeWidth={2} aria-hidden /> {t("pipelinePage.mobileCard.won")}
          </button>
          <button
            type="button"
            onClick={() => onLose?.()}
            disabled={losing}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface-overlay px-2 text-xs font-medium text-text-secondary transition-colors duration-fast hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={12} strokeWidth={2} aria-hidden /> {t("pipelinePage.mobileCard.lost")}
          </button>
        </div>
      )}
      <label className="mt-2 block">
        <span className="sr-only">{t("pipelinePage.mobileCard.moveAriaLabel")}</span>
        <select
          value={deal.stage_id}
          onChange={(e) => {
            if (e.target.value !== deal.stage_id) onMove(deal.id, e.target.value);
          }}
          className="mt-1 block w-full rounded-md border border-border bg-surface-overlay px-2 py-1.5 text-xs text-text-secondary focus:border-accent focus:outline-none"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

interface MobileBoardProps {
  stages: BoardStage[];
  activeIndex: number;
  onSelectStage: (index: number) => void;
  locale: string;
  boardCurrency: string;
  onWinDeal: (deal: BoardDeal, anchor: HTMLElement | null) => void;
  onLoseDeal: (deal: BoardDeal) => void;
  onTogglePayment: (deal: BoardDeal, next: boolean) => void;
  onMoveDeal: (dealId: string, stageId: string) => void;
  onOpenDeal: (id: string) => void;
  winningDealId: string | null;
  losingDealId: string | null;
  payingDealId: string | null;
}

// Single-stage mobile view: a chip switcher picks the stage, its deals show
// as a vertical list. Replaces the old two-axis (vertical stages × horizontal
// cards) scroll that hid cards off-screen.
function MobileBoard({
  stages,
  activeIndex,
  onSelectStage,
  locale,
  boardCurrency,
  onWinDeal,
  onLoseDeal,
  onTogglePayment,
  onMoveDeal,
  onOpenDeal,
  winningDealId,
  losingDealId,
  payingDealId,
}: MobileBoardProps) {
  const { t } = useTranslation("deals");
  const active = stages[activeIndex];
  return (
    <div className="flex select-none flex-col gap-3 px-4 pb-24 md:hidden">
      <div
        role="tablist"
        aria-label={t("pipelinePage.mobileBoard.tablistAriaLabel")}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {stages.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            onClick={() => onSelectStage(i)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
              i === activeIndex
                ? "bg-accent text-text-on-accent"
                : "border border-border bg-surface text-text-secondary",
            )}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: stageColor(s.position, s.color) }}
            />
            {s.name}
            <span className="tabular-nums opacity-70">{s.deal_count}</span>
          </button>
        ))}
      </div>
      {active ? (
        <>
          <p className="text-xs text-text-tertiary">
            {t("dealCount", { count: active.deal_count })} ·{" "}
            {formatMoney(active.total_value, boardCurrency, locale)}
          </p>
          {active.deals.length === 0 ? (
            <p className="py-8 text-center text-xs text-text-tertiary">
              {t("pipelinePage.stageColumn.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {active.deals.map((deal) => (
                <li key={deal.id}>
                  <MobileDealCard
                    deal={deal}
                    locale={locale}
                    stageType={active.stage_type}
                    stages={stages}
                    onWin={active.stage_type === "won" ? undefined : () => onWinDeal(deal, null)}
                    onLose={active.stage_type === "won" ? undefined : () => onLoseDeal(deal)}
                    onTogglePaid={
                      active.stage_type === "won"
                        ? (next) => onTogglePayment(deal, next)
                        : undefined
                    }
                    onMove={onMoveDeal}
                    onOpen={onOpenDeal}
                    winning={winningDealId === deal.id}
                    losing={losingDealId === deal.id}
                    paymentPending={payingDealId === deal.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
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
  onTogglePayment: (deal: BoardDeal, next: boolean) => void;
  onOpenDeal: (id: string) => void;
  winningDealId: string | null;
  losingDealId: string | null;
  payingDealId: string | null;
}

function StageColumn({
  stage,
  locale,
  boardCurrency,
  draggingId,
  onAddDeal,
  onWinDeal,
  onLoseDeal,
  onTogglePayment,
  onOpenDeal,
  winningDealId,
  losingDealId,
  payingDealId,
}: StageColumnProps) {
  const { t } = useTranslation("deals");
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "stage" },
  });

  // Stage palette is keyed off `position` so admin-renamed stages keep
  // their semantic color. Falls back to the stored `color` for any custom
  // stages beyond the seeded six.
  const dotColor = stageColor(stage.position, stage.color);
  // Brief §4: "kanban columns get a left-seam color accent". Drawn as a
  // ::before sibling sitting above children, so on mobile rows the deal
  // cards scroll *under* the seam instead of over it.
  const seamStyle = { ["--stage-seam" as string]: dotColor } as React.CSSProperties;

  return (
    <section
      aria-label={t("pipelinePage.stageColumn.ariaLabel", { name: stage.name })}
      style={seamStyle}
      className={cn(
        "group/column relative flex flex-col rounded-lg border border-border bg-surface transition-colors duration-fast",
        "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-[3px] before:rounded-l-lg before:bg-[var(--stage-seam)]",
        "max-md:w-full max-md:shrink-0",
        "md:min-w-0 md:flex-1",
        isOver && "ring-2 ring-accent",
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
            <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
          </div>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">
            {t("dealCount", { count: stage.deal_count })} ·{" "}
            {formatMoney(stage.total_value, boardCurrency, locale)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAddDeal(stage.id)}
          aria-label={t("pipelinePage.stageColumn.addDealAriaLabel", { name: stage.name })}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary opacity-0 transition-opacity duration-fast hover:bg-surface-overlay hover:text-text-primary focus-visible:opacity-100 group-hover/column:opacity-100 max-md:opacity-100"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 gap-2 p-2",
          "max-md:snap-x max-md:snap-mandatory max-md:flex-row max-md:overflow-x-auto",
          "md:min-h-0 md:flex-col md:overflow-y-auto",
        )}
      >
        {stage.deals.length === 0 ? (
          <p className="text-xs text-text-tertiary">{t("pipelinePage.stageColumn.empty")}</p>
        ) : (
          stage.deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              locale={locale}
              dragging={draggingId === deal.id}
              onOpen={onOpenDeal}
              onWin={stage.stage_type === "won" ? undefined : (anchor) => onWinDeal(deal, anchor)}
              onLose={stage.stage_type === "won" ? undefined : () => onLoseDeal(deal)}
              onTogglePaid={
                stage.stage_type === "won" ? (next) => onTogglePayment(deal, next) : undefined
              }
              winning={winningDealId === deal.id}
              losing={losingDealId === deal.id}
              paymentPending={payingDealId === deal.id}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function PipelinePage() {
  const { t } = useTranslation("deals");
  usePageTitle("Pipeline");
  const [wonWindow, setWonWindow] = useState<WonWindow>(() => loadWonWindow());
  const { data: board, isPending, isError } = usePipelineBoard(wonWindow);
  const { data: user } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const moveMutation = useMoveDealStage();
  const winMutation = useMarkAnyDealWon();
  const loseMutation = useMarkAnyDealLost();
  const paymentMutation = useToggleAnyDealPayment();
  const deleteMutation = useDeleteAnyDeal();
  const toast = useToast();
  const { dealId: dialogDealId, openDeal, closeDeal } = useDealDialog();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  // Whether releasing now would move the deal to another stage. Drives the
  // DragOverlay's dropAnimation: the default animation flies the overlay back
  // to the source card's rect — correct for cancels/same-column/trash, but a
  // moved deal would visibly "return" to the old column before the optimistic
  // board update re-renders it in the target column.
  const [dropWillMove, setDropWillMove] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine" | string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [addDealStageId, setAddDealStageId] = useState<string | undefined>(undefined);
  // Which stage the mobile single-stage view is showing.
  const [mobileStageIndex, setMobileStageIndex] = useState(0);
  const [winningDealId, setWinningDealId] = useState<string | null>(null);
  const [winToast, setWinToast] = useState<string | null>(null);
  const [losingDealTarget, setLosingDealTarget] = useState<BoardDeal | null>(null);
  const [payingDealId, setPayingDealId] = useState<string | null>(null);
  const [deletingDealTarget, setDeletingDealTarget] = useState<BoardDeal | null>(null);

  // Mouse: drag activates on a small movement (distance:6) so power users
  // get instant feedback. Touch: drag requires a 250ms long-press, so a
  // horizontal swipe inside the mobile-row container scrolls deals
  // freely instead of triggering an aborted drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const locale = useLocale();

  const wonWindowOptions = useMemo(
    () =>
      WON_WINDOW_VALUES.map((value) => ({
        value,
        label:
          value === "all"
            ? t("pipelinePage.wonWindow.all")
            : t("pipelinePage.wonWindow.days", { count: value }),
      })),
    [t],
  );

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
      const valueShown = hasValue(deal.value);
      const formattedValue = valueShown && moneyFmt ? moneyFmt.format(Number(deal.value)) : null;
      setWinToast(
        formattedValue
          ? t("pipelinePage.winToast.withValue", { name: deal.name, value: formattedValue })
          : t("pipelinePage.winToast.withoutValue", { name: deal.name }),
      );
      winMutation.mutate(
        { dealId: deal.id },
        {
          onSettled: () => setWinningDealId(null),
        },
      );
    },
    [winMutation, winningDealId, moneyFmt, t],
  );

  const handleLoseDeal = useCallback((deal: BoardDeal) => {
    setLosingDealTarget(deal);
  }, []);

  const handleTogglePayment = useCallback(
    (deal: BoardDeal, next: boolean) => {
      if (payingDealId) return;
      setPayingDealId(deal.id);
      paymentMutation.mutate(
        { dealId: deal.id, paid: next },
        {
          onError: () => {
            toast.error(t("pipelinePage.toast.paymentSaveError"));
          },
          onSettled: () => setPayingDealId(null),
        },
      );
    },
    [paymentMutation, payingDealId, toast, t],
  );

  const handleConfirmLose = useCallback(
    (reason: string) => {
      if (!losingDealTarget) return;
      const target = losingDealTarget;
      loseMutation.mutate(
        { dealId: target.id, lost_reason: reason },
        {
          onSuccess: () => {
            toast.success(t("pipelinePage.toast.lostSuccess", { name: target.name }));
            setLosingDealTarget(null);
          },
          onError: () => {
            toast.error(t("pipelinePage.toast.lostError"));
          },
        },
      );
    },
    [loseMutation, losingDealTarget, toast, t],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deletingDealTarget) return;
    const target = deletingDealTarget;
    deleteMutation.mutate(
      { dealId: target.id },
      {
        onSuccess: () => {
          toast.success(t("pipelinePage.toast.deleteSuccess", { name: target.name }));
          setDeletingDealTarget(null);
        },
        onError: () => {
          toast.error(t("pipelinePage.toast.deleteError"));
        },
      },
    );
  }, [deleteMutation, deletingDealTarget, toast, t]);

  const filteredStages = useMemo<BoardStage[]>(() => {
    if (!board) return [];
    const normalized = searchTerm.trim().toLowerCase();
    return board.stages.map((stage) => {
      const deals = stage.deals.filter((deal) => {
        if (ownerFilter === "mine" && deal.owner_user_id !== user?.id) return false;
        if (ownerFilter !== "all" && ownerFilter !== "mine" && deal.owner_user_id !== ownerFilter) {
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

  // Global "add deal" entry points default to the first OPEN stage so a new
  // lead never lands in a won/lost column (the per-column "+" still targets
  // its own stage).
  const firstOpenStageId = useMemo(
    () => board?.stages.find((s) => s.stage_type === "open")?.id ?? board?.stages[0]?.id,
    [board?.stages],
  );

  const hasActiveFilter = ownerFilter !== "all" || searchTerm.trim().length > 0;
  const canPickOwner = user?.role === "admin" || user?.role === "manager";

  const handleMoveDeal = useCallback(
    (dealId: string, stageId: string) => {
      moveMutation.mutate({ dealId, stageId });
    },
    [moveMutation],
  );

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
        {t("pipelinePage.loading")}
      </div>
    );
  }

  if (isError || !board) {
    return (
      <div
        className="m-8 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
        role="alert"
      >
        {t("pipelinePage.loadError")}
      </div>
    );
  }

  const hasAnyDeals = board.stages.some((s) => s.deals.length > 0);
  const hasFilteredDeals = filteredStages.some((s) => s.deals.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
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
                setAddDealStageId(firstOpenStageId);
                setAddDealOpen(true);
              }}
              className="hidden h-9 items-center gap-1 rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover md:inline-flex"
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              <span>{t("pipelinePage.toolbar.addDeal")}</span>
            </button>
          ) : null}
          <label className="flex flex-col text-xs font-medium text-text-tertiary">
            {t("pipelinePage.toolbar.searchLabel")}
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("pipelinePage.toolbar.searchPlaceholder")}
              className="mt-1 w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-text-tertiary">
            {t("pipelinePage.toolbar.wonWindowLabel")}
            <select
              value={String(wonWindow)}
              onChange={(e) => {
                const raw = e.target.value;
                const next: WonWindow = raw === "all" ? "all" : Number(raw);
                setWonWindow(next);
                try {
                  window.localStorage?.setItem(WON_WINDOW_STORAGE_KEY, String(next));
                } catch {
                  // Persisting the preference is best-effort; ignore storage errors.
                }
              }}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {wonWindowOptions.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {canPickOwner ? (
            <label className="flex flex-col text-xs font-medium text-text-tertiary">
              {t("pipelinePage.toolbar.ownerLabel")}
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              >
                <option value="all">{t("pipelinePage.toolbar.ownerAll")}</option>
                <option value="mine">{t("pipelinePage.toolbar.ownerMine")}</option>
                <optgroup label={t("pipelinePage.toolbar.salespeopleGroup")}>
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
              {t("pipelinePage.toolbar.visibilityLabel")}
              <select
                value={ownerFilter === "mine" ? "mine" : "all"}
                onChange={(e) => setOwnerFilter(e.target.value === "mine" ? "mine" : "all")}
                className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              >
                <option value="all">{t("pipelinePage.toolbar.visibilityAll")}</option>
                <option value="mine">{t("pipelinePage.toolbar.visibilityMine")}</option>
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
              {t("pipelinePage.toolbar.clearFilter")}
            </button>
          ) : null}
        </div>
      </div>

      {!hasAnyDeals ? (
        <div className="mx-4 rounded-lg border border-border bg-surface md:mx-8">
          <EmptyState
            icon={Workflow}
            title={t("pipelinePage.emptyState.title")}
            body={t("pipelinePage.emptyState.body")}
            primary={{
              label: t("pipelinePage.emptyState.cta"),
              onClick: () => {
                setAddDealStageId(firstOpenStageId);
                setAddDealOpen(true);
              },
            }}
          />
        </div>
      ) : (
        <>
          {/* Desktop: drag-and-drop kanban. */}
          <DndContext
            sensors={sensors}
            onDragStart={(event) => {
              setActiveDealId(String(event.active.id));
              setDropWillMove(false);
            }}
            onDragOver={(event) => {
              const fromStage = event.active.data.current?.stageId;
              const overId = event.over ? String(event.over.id) : null;
              setDropWillMove(overId !== null && overId !== "trash" && overId !== fromStage);
            }}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDealId(null)}
          >
            <div
              className={cn(
                // select-none: touch drags (dnd-kit long-press) must never
                // start a text selection on card/column text.
                "hidden flex-1 select-none gap-3 px-4 pb-6 md:flex md:px-8",
                "md:min-h-0 md:overflow-hidden",
              )}
            >
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
                  onTogglePayment={handleTogglePayment}
                  onOpenDeal={openDeal}
                  winningDealId={winningDealId}
                  losingDealId={losingDealTarget?.id ?? null}
                  payingDealId={payingDealId}
                />
              ))}
            </div>
            <TrashDropZone visible={activeDealId !== null} />
            <DragOverlay dropAnimation={dropWillMove ? null : undefined}>
              {activeDeal ? <DealCard deal={activeDeal} locale={locale} /> : null}
            </DragOverlay>
          </DndContext>

          {/* Mobile: single-stage view with a chip switcher. */}
          <MobileBoard
            stages={filteredStages}
            activeIndex={Math.min(mobileStageIndex, Math.max(0, filteredStages.length - 1))}
            onSelectStage={setMobileStageIndex}
            locale={locale}
            boardCurrency={board.currency}
            onWinDeal={handleWinDeal}
            onLoseDeal={handleLoseDeal}
            onTogglePayment={handleTogglePayment}
            onMoveDeal={handleMoveDeal}
            onOpenDeal={openDeal}
            winningDealId={winningDealId}
            losingDealId={losingDealTarget?.id ?? null}
            payingDealId={payingDealId}
          />

          {!hasFilteredDeals ? (
            <p className="px-4 pb-4 text-center text-sm text-text-tertiary md:px-8" role="status">
              {t("pipelinePage.noFilterMatches")}
            </p>
          ) : null}
        </>
      )}

      {/* Mobile FAB — header CTA collapses to bottom-right at <768px when
          there are deals on the board. Empty state shows its own primary CTA. */}
      {hasAnyDeals ? (
        <button
          type="button"
          onClick={() => {
            setAddDealStageId(firstOpenStageId);
            setAddDealOpen(true);
          }}
          aria-label={t("pipelinePage.toolbar.addDeal")}
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

      {winToast ? <WinToast message={winToast} onDismiss={() => setWinToast(null)} /> : null}

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

      {dialogDealId ? <DealDetailDialog dealId={dialogDealId} onClose={closeDeal} /> : null}
    </div>
  );
}

function TrashDropZone({ visible }: { visible: boolean }) {
  const { t } = useTranslation("deals");
  const { setNodeRef, isOver } = useDroppable({ id: "trash", data: { type: "trash" } });
  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={t("pipelinePage.trash.ariaLabel")}
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center justify-center px-4 pb-4 transition-opacity duration-fast",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-md select-none items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm font-medium shadow-lg transition-colors duration-fast",
          isOver
            ? "border-danger bg-danger text-white"
            : "border-danger-subtle bg-surface text-danger",
        )}
      >
        <Trash2 size={16} strokeWidth={1.75} aria-hidden />
        <span>{isOver ? t("pipelinePage.trash.dropHere") : t("pipelinePage.trash.dragHere")}</span>
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
  const { t } = useTranslation("deals");
  const dialogRef = useModalDialog<HTMLDivElement>(onCancel, Boolean(deal));
  if (!deal) return null;
  const valueShown = hasValue(deal.value);
  const formattedValue = valueShown && moneyFmt ? moneyFmt.format(Number(deal.value)) : null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-deal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
        <h2 id="delete-deal-title" className="text-xl font-semibold">
          {t("pipelinePage.deleteDialog.title")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t("pipelinePage.deleteDialog.bodyPrefix")}{" "}
          <strong className="text-text-primary">{deal.name}</strong>
          {formattedValue ? ` (${formattedValue})` : ""} {t("pipelinePage.deleteDialog.bodySuffix")}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("pipelinePage.deleteDialog.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? t("pipelinePage.deleteDialog.deleting")
              : t("pipelinePage.deleteDialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function WinToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useTranslation("deals");
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
          aria-label={t("pipelinePage.winToast.dismissAriaLabel")}
          className="text-text-tertiary hover:text-text-primary"
        >
          ×
        </button>
      </div>
    </div>
  );
}
