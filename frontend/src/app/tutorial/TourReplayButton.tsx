/**
 * `?` icon button in the AppShell header — replays the CURRENT page's
 * tour from step 1. Hidden on routes without a tour and while a tour is
 * on screen (the overlay already carries its own controls).
 */

import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { tourForPath } from "@/app/tutorial/tours";
import { usePageTour } from "@/app/tutorial/useTutorial";

export function TourReplayButton() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const tour = usePageTour(tourForPath(location.pathname));
  if (!tour.tourId) return null;
  // While the tour is on screen the overlay carries the controls.
  if (tour.shouldShow) return null;
  return (
    <button
      type="button"
      onClick={tour.replay}
      aria-label={t("tutorial.replayAriaLabel")}
      title={t("tutorial.replayAriaLabel")}
      data-testid="tour-replay-button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
    >
      <HelpCircle size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
