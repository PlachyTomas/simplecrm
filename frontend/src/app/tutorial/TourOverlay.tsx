/**
 * Full-viewport tour overlay — scrim + spotlight ring + tooltip card.
 *
 * The scrim is a single dark-translucent layer over the whole page;
 * the spotlight ring is a separate absolutely-positioned element
 * outlining the anchored DOM node. There is intentionally no SVG
 * "hole" cutout — the ring carries the visual focus without
 * fighting Tailwind/`backdrop-blur` quirks across browsers.
 *
 * Anchor lookup retries for up to ~1.5 s after each step change so
 * a slow-mounting nav link still picks up the spotlight. If the
 * anchor never appears we render the card centered (graceful fallback,
 * never crash the overlay).
 */

import { type ReactElement, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { TourCard } from "@/app/tutorial/TourCard";
import { TUTORIAL_STEPS } from "@/app/tutorial/tutorialSteps";
import { useTutorial } from "@/app/tutorial/useTutorial";

const ANCHOR_POLL_INTERVAL_MS = 50;
const ANCHOR_POLL_TIMEOUT_MS = 1500;
const RING_PADDING = 6;

export function TourOverlay(): ReactElement | null {
  const tour = useTutorial();
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const step = tour.shouldShow ? TUTORIAL_STEPS[tour.currentIndex] : null;
  const anchorTestId = step?.anchorTestId ?? null;

  // Locate the anchor each time the step (or window size) changes.
  // Retries during the poll window so a slow-mounting node still
  // gets a spotlight rather than landing in the centered fallback.
  useEffect(() => {
    if (!step) {
      setAnchorRect(null);
      return;
    }
    if (!anchorTestId) {
      setAnchorRect(null);
      return;
    }
    let cancelled = false;
    const startedAt = performance.now();

    const locate = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-testid="${anchorTestId}"]`);
      if (el) {
        setAnchorRect(el.getBoundingClientRect());
        return;
      }
      if (performance.now() - startedAt > ANCHOR_POLL_TIMEOUT_MS) {
        // Give up — render centered.
        setAnchorRect(null);
        return;
      }
      window.setTimeout(locate, ANCHOR_POLL_INTERVAL_MS);
    };
    locate();

    const onResize = () => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${anchorTestId}"]`);
      if (el) setAnchorRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [step, anchorTestId]);

  // Esc dismisses the tour (treated as "Přeskočit", not "Hotovo").
  useEffect(() => {
    if (!tour.shouldShow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tour.dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour]);

  if (!tour.shouldShow || !step) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Scrim — dark wash that lets the rest of the UI bleed through.
          `pointer-events-auto` is opt-in on the click-blocker so the user
          can still scroll the page behind via wheel events. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200"
      />

      {/* Spotlight ring around the anchored element. */}
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

      {/* The card itself is interactive — re-enable pointer events. */}
      <div className="pointer-events-auto">
        <TourCard
          step={step}
          index={tour.currentIndex}
          total={tour.totalSteps}
          isFirst={tour.currentIndex === 0}
          isLast={tour.currentIndex === tour.totalSteps - 1}
          isPersisting={tour.isPersisting}
          onNext={() => {
            if (tour.currentIndex === tour.totalSteps - 1) {
              tour.complete();
            } else {
              tour.next();
            }
          }}
          onPrev={tour.prev}
          onDismiss={tour.dismiss}
          anchorRect={anchorRect}
        />
      </div>
    </div>,
    document.body,
  );
}
