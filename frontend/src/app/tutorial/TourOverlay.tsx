/**
 * Full-viewport tour overlay — scrim + spotlight ring + tooltip card,
 * driven by the current route's tour (see `tours.ts`).
 *
 * The scrim never intercepts pointer events: the page stays clickable,
 * which is what makes action-gated steps ("open the ⚡ menu") possible.
 * Stacking is deliberate: scrim+ring sit at z-40 (below the app's
 * modals at z-50, so a modal the user opens mid-step is fully visible),
 * while the card sits at z-[60] so instructions stay readable on top.
 *
 * Anchor lookup retries for ~1.5 s after each step change (slow mounts),
 * supports `data-testid^=` prefix matching for per-entity anchors, and
 * falls back to a centered card when nothing matches. Position refreshes
 * on scroll + resize so the ring tracks its element.
 */

import { type ReactElement, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

import { TourCard } from "@/app/tutorial/TourCard";
import { PAGE_TOURS, tourForPath } from "@/app/tutorial/tours";
import { usePageTour } from "@/app/tutorial/useTutorial";

const ANCHOR_POLL_INTERVAL_MS = 250;
const ACTION_POLL_INTERVAL_MS = 250;
const RING_PADDING = 6;

function anchorSelector(testId: string, prefix: boolean): string {
  return prefix ? `[data-testid^="${testId}"]` : `[data-testid="${testId}"]`;
}

export function TourOverlay(): ReactElement | null {
  const location = useLocation();
  const tourId = tourForPath(location.pathname);
  const tour = usePageTour(tourId);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const steps = tourId ? PAGE_TOURS[tourId] : [];
  const step = tour.shouldShow ? steps[tour.currentIndex] : null;
  const anchorTestId = step?.anchorTestId ?? null;
  const anchorIsPrefix = step?.anchorIsPrefix ?? false;
  const isLast = tour.currentIndex === tour.totalSteps - 1;

  // Track the anchor for as long as the step is on screen. Never give up:
  // a board that loads slower than any fixed timeout, or a step reached
  // while a modal briefly covers the page, still gets its spotlight the
  // moment the element is (back) in the DOM. The card centers meanwhile.
  useEffect(() => {
    if (!step || !anchorTestId) {
      setAnchorRect(null);
      return;
    }
    const selector = anchorSelector(anchorTestId, anchorIsPrefix);

    const update = () => {
      const el = document.querySelector<HTMLElement>(selector);
      setAnchorRect((prev) => {
        if (!el) return prev == null ? prev : null;
        const rect = el.getBoundingClientRect();
        // Same box → keep the previous object; avoids re-render churn
        // from the polling interval.
        if (
          prev &&
          Math.abs(prev.top - rect.top) < 1 &&
          Math.abs(prev.left - rect.left) < 1 &&
          Math.abs(prev.width - rect.width) < 1 &&
          Math.abs(prev.height - rect.height) < 1
        ) {
          return prev;
        }
        return rect;
      });
    };
    update();
    const interval = window.setInterval(update, ANCHOR_POLL_INTERVAL_MS);
    window.addEventListener("resize", update);
    // Capture-phase: the scroll container is `main`, not the window.
    document.addEventListener("scroll", update, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [step, anchorTestId, anchorIsPrefix]);

  // Action-gated step: watch for the target appearing, then advance.
  const advanceOnAppear = step?.advanceOnAppear ?? null;
  useEffect(() => {
    if (!advanceOnAppear || !step) return;
    const selector = anchorSelector(advanceOnAppear, false);
    // If the target is somehow already on screen, don't advance instantly
    // — wait for it to (re)appear so the step means what it says.
    let seenAbsent = document.querySelector(selector) == null;
    const timer = window.setInterval(() => {
      const present = document.querySelector(selector) != null;
      if (!present) {
        seenAbsent = true;
        return;
      }
      if (seenAbsent) {
        window.clearInterval(timer);
        if (isLast) tour.complete();
        else tour.next();
      }
    }, ACTION_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceOnAppear, step?.id]);

  // Esc dismisses the tour — unless an app modal is open, in which case
  // Esc belongs to the modal (its own handler closes it).
  useEffect(() => {
    if (!tour.shouldShow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const appModalOpen = document.querySelector('[role="dialog"]:not([data-tour-card])') != null;
      if (!appModalOpen) tour.dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour]);

  if (!tour.shouldShow || !step) return null;

  return createPortal(
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-40">
        {/* Scrim — dark wash; pointer-events stay off so the page is
            usable during action steps. */}
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200" />
      </div>

      {/* Ring + card live above app modals (z-50): the ring must be able
          to spotlight elements INSIDE a dialog (deals tour anchors the
          timeline in the deal detail), and instructions must survive a
          dialog the user opens during an action step. */}
      <div className="pointer-events-none fixed inset-0 z-[60]">
        {anchorRect ? (
          <div
            aria-hidden
            className="absolute rounded-md ring-2 ring-accent ring-offset-2 ring-offset-bg/60 transition-all duration-150"
            style={{
              top: anchorRect.top - RING_PADDING,
              left: anchorRect.left - RING_PADDING,
              width: anchorRect.width + RING_PADDING * 2,
              height: anchorRect.height + RING_PADDING * 2,
            }}
          />
        ) : null}
        <div className="pointer-events-auto">
          <TourCard
            step={step}
            index={tour.currentIndex}
            total={tour.totalSteps}
            isFirst={tour.currentIndex === 0}
            isLast={isLast}
            isPersisting={tour.isPersisting}
            onNext={() => {
              if (isLast) tour.complete();
              else tour.next();
            }}
            onPrev={tour.prev}
            onDismiss={tour.dismiss}
            anchorRect={anchorRect}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
