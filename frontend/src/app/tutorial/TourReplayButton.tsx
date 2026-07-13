/**
 * `?` icon button in the AppShell header — re-opens the tutorial from
 * step 1 on click. Hidden while the tour is actively visible to avoid
 * competing with itself.
 */

import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTutorial, useTutorialIsClosed } from "@/app/tutorial/useTutorial";

export function TourReplayButton() {
  const { t } = useTranslation("common");
  const tour = useTutorial();
  const isClosed = useTutorialIsClosed();
  // While the tour is on screen, the overlay already carries the
  // dismiss / next controls — a second entry point would clutter.
  if (tour.shouldShow) return null;
  // Hide the button when there is nothing to "replay" yet (user hasn't
  // dismissed or completed). In practice this branch fires only for
  // freshly-loaded sessions before `useTutorial` has rendered once.
  if (!isClosed) return null;
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
