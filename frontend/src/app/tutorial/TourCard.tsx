/**
 * Tooltip card rendered next to (or over) the anchored element.
 *
 * Visuals follow the design brief — indigo accent border for steps 1–4,
 * magenta accent only on the final celebratory step. Glassmorphism
 * (`backdrop-blur` + translucent surface) is permitted per the project
 * memory; it lands legibly on both themes via the semantic surface
 * tokens.
 */

import { Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import type { TourStep } from "@/app/tutorial/tutorialSteps";
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

export function TourCard(props: TourCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Focus the title on each step change so screen readers announce it
  // and Esc / Enter keyboard handling lands on the card.
  useEffect(() => {
    cardRef.current?.focus();
  }, [props.index]);

  const position = computePosition(props.anchorRect);
  const isMagenta = props.step.accent === "magenta";

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`tour-step-title-${props.step.id}`}
      tabIndex={-1}
      className={cn(
        "bg-surface-elevated/95 fixed z-50 w-[var(--tour-card-w)] max-w-[calc(100vw-2rem)] rounded-lg border p-5 shadow-lg backdrop-blur",
        isMagenta ? "border-brand-accent" : "border-accent",
      )}
      style={
        {
          ...position,
          // Expose card width to children as a CSS var so the math up here
          // stays the single source of truth.
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
            Krok {props.index + 1} / {props.total}
          </span>
        </div>
        <button
          type="button"
          onClick={props.onDismiss}
          aria-label="Zavřít průvodce"
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
        {props.step.title}
      </h2>
      <p className="text-sm leading-snug text-text-secondary">{props.step.body}</p>

      <footer className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={props.onPrev}
          disabled={props.isFirst || props.isPersisting}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Zpět
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onDismiss}
            className="rounded-md px-3 py-1.5 text-sm text-text-tertiary transition-colors hover:text-text-primary"
          >
            Přeskočit
          </button>
          <PrimaryButton
            isLast={props.isLast}
            isPersisting={props.isPersisting}
            onClick={props.onNext}
          >
            {props.isLast ? "Hotovo" : "Další"}
          </PrimaryButton>
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
  // Final step keeps the magenta accent only on the icon background —
  // the button itself stays indigo, both because we want one magenta
  // *moment* per screen and because the magenta "+" CTA pattern is
  // reserved for the "Označit jako vyhráno" action elsewhere.
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

function computePosition(anchor: DOMRect | null): React.CSSProperties {
  if (!anchor) {
    // Center on the viewport — used for the welcome step.
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }
  // Anchor is the sidebar nav link — drop the card to the right of it,
  // vertically aligned. If the card would overflow the right edge
  // (narrow viewport but still desktop), clamp to a safe margin.
  const top = Math.max(CARD_MARGIN, anchor.top);
  const left = anchor.right + 12;
  const overflow = left + CARD_WIDTH - window.innerWidth + CARD_MARGIN;
  return {
    top,
    left: overflow > 0 ? left - overflow : left,
  };
}
