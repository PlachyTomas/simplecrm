/**
 * Tooltip card rendered next to (or over) the anchored element.
 *
 * Indigo accent for regular steps; magenta only on a tour's final,
 * celebratory step (one magenta moment per screen — design brief).
 * Solid surface on purpose: the tokens are hex CSS variables, so
 * Tailwind's `bg-X/<n>` alpha would render fully transparent.
 *
 * Action-gated steps (`advanceOnAppear`) swap the Next button for a
 * "do it on the page" hint plus a quiet skip — the page stays clickable
 * through the overlay, so the user performs the action for real.
 */

import { MousePointerClick, Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { TourStep } from "@/app/tutorial/tours";
import { cn } from "@/lib/utils";

interface TourCardProps {
  step: TourStep;
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  isPersisting: boolean;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
  /** Optional anchor for positioning. When null the card centers itself. */
  anchorRect: DOMRect | null;
}

const CARD_WIDTH = 360;
const CARD_MARGIN = 16;
/** Estimated card height for the above/below flip decision only. */
const CARD_HEIGHT_ESTIMATE = 230;

export function TourCard(props: TourCardProps) {
  const { t } = useTranslation("common");
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Focus the card on each step change so screen readers announce it —
  // but never steal focus from an open app modal: a step that follows an
  // action-gated one appears while the modal the user just opened is
  // still up, and yanking focus would break its Esc/focus-trap handling.
  useEffect(() => {
    const appModalOpen = document.querySelector('[role="dialog"]:not([data-tour-card])') != null;
    if (!appModalOpen) cardRef.current?.focus();
  }, [props.index]);

  const position = computePosition(props.anchorRect);
  const isMagenta = props.step.accent === "magenta";
  const isActionStep = !!props.step.advanceOnAppear;

  return (
    <div
      ref={cardRef}
      role="dialog"
      data-tour-card
      aria-labelledby={`tour-step-title-${props.step.id}`}
      tabIndex={-1}
      className={cn(
        "fixed z-50 w-[var(--tour-card-w)] max-w-[calc(100vw-2rem)] rounded-lg border bg-surface-elevated p-5 shadow-lg",
        isMagenta ? "border-brand-accent" : "border-accent",
      )}
      style={
        {
          ...position,
          "--tour-card-w": `${CARD_WIDTH}px`,
        } as React.CSSProperties
      }
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full",
              isMagenta
                ? "bg-brand-accent-subtle text-brand-accent"
                : "bg-accent-subtle text-accent",
            )}
          >
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <span className="text-xs uppercase tracking-wide text-text-tertiary">
            {t("tutorial.stepCounter", { current: props.index + 1, total: props.total })}
          </span>
        </div>
        <button
          type="button"
          onClick={props.onDismiss}
          aria-label={t("tutorial.closeAriaLabel")}
          className="rounded p-1 text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          data-testid="tour-dismiss"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </header>

      <h2
        id={`tour-step-title-${props.step.id}`}
        className="mb-2 text-base font-semibold text-text-primary"
      >
        {t(props.step.titleKey)}
      </h2>
      <p className="text-sm leading-snug text-text-secondary">{t(props.step.bodyKey)}</p>

      {isActionStep ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent-subtle px-3 py-1.5 text-sm font-medium text-accent">
          <MousePointerClick size={15} strokeWidth={1.75} aria-hidden />
          {t("tutorial.actionHint")}
        </p>
      ) : null}

      <footer className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={props.onPrev}
          disabled={props.isFirst || props.isPersisting}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("tutorial.back")}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onDismiss}
            className="rounded-md px-3 py-1.5 text-sm text-text-tertiary transition-colors hover:text-text-primary"
          >
            {t("tutorial.skip")}
          </button>
          {isActionStep ? (
            // The action itself advances; the quiet skip covers pages
            // where the ask can't be performed (e.g. no data yet).
            <button
              type="button"
              onClick={props.onNext}
              disabled={props.isPersisting}
              data-testid="tour-skip-step"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("tutorial.skipStep")}
            </button>
          ) : (
            <PrimaryButton
              isLast={props.isLast}
              isPersisting={props.isPersisting}
              onClick={props.onNext}
            >
              {t(props.isLast ? "tutorial.done" : "tutorial.next")}
            </PrimaryButton>
          )}
        </div>
      </footer>
    </div>
  );
}

function PrimaryButton(props: {
  isLast: boolean;
  isPersisting: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.isPersisting}
      data-testid={props.isLast ? "tour-complete" : "tour-next"}
      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {props.children}
    </button>
  );
}

/**
 * Anchors are no longer only in the sidebar — page tours point at
 * buttons, filters and rows anywhere on screen. Prefer a card below the
 * anchor (left-aligned, clamped to the viewport); flip above when the
 * bottom would overflow; center when there is no anchor at all.
 */
function computePosition(anchor: DOMRect | null): React.CSSProperties {
  if (!anchor) {
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }
  let left = anchor.left;
  const overflowRight = left + CARD_WIDTH - window.innerWidth + CARD_MARGIN;
  if (overflowRight > 0) left -= overflowRight;
  left = Math.max(CARD_MARGIN, left);

  const below = anchor.bottom + 12;
  if (below + CARD_HEIGHT_ESTIMATE < window.innerHeight - CARD_MARGIN) {
    return { top: below, left };
  }
  const above = anchor.top - 12 - CARD_HEIGHT_ESTIMATE;
  return { top: Math.max(CARD_MARGIN, above), left };
}
