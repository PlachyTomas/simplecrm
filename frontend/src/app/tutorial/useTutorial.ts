/**
 * Per-page tour state machine + persistence.
 *
 * Source of truth is server-side (`user.preferences.tutorial_tours`, a
 * `{tourId: "done" | "dismissed"}` map) so a user logging in elsewhere
 * sees the same state — and so the header `?` button and the overlay
 * (two separate hook instances) stay in sync through the query cache.
 * `replay` therefore PATCHes the entry away rather than flipping local
 * state: every instance reacts to the refreshed `/auth/me`.
 *
 * The legacy single-tour keys (`tutorial_completed_at` /
 * `tutorial_dismissed_at`) count as the overview tour being done, so
 * long-time users aren't re-welcomed — every OTHER page tour still
 * auto-shows once, which is the point: they showcase what's new.
 *
 * `shouldShow` stays false while `/auth/me` loads — never flash the
 * overlay before we know what the user already saw.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { PAGE_TOURS, type TourId } from "@/app/tutorial/tours";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import { useMediaQuery } from "@/lib/useMediaQuery";

type TourOutcome = "done" | "dismissed";
type ToursMap = Record<string, TourOutcome>;

interface PreferencesPatch {
  tutorial_tours: ToursMap;
  tutorial_completed_at?: null;
  tutorial_dismissed_at?: null;
}

interface PageTourState {
  tourId: TourId | null;
  shouldShow: boolean;
  totalSteps: number;
  currentIndex: number;
  isPersisting: boolean;
  next: () => void;
  prev: () => void;
  dismiss: () => void;
  complete: () => void;
  /** Reopen this page's tour from step 0 (header `?`). */
  replay: () => void;
}

function readToursMap(prefs: Record<string, unknown>): ToursMap {
  const raw = prefs.tutorial_tours;
  if (raw == null || typeof raw !== "object") return {};
  const out: ToursMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === "done" || value === "dismissed") out[key] = value;
  }
  return out;
}

export function usePageTour(tourId: TourId | null): PageTourState {
  const { accessToken } = useAuth();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  // Spotlight anchors live in desktop chrome — tours are desktop-only.
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const prefs = (me.data?.preferences ?? {}) as Record<string, unknown>;
  const tours = readToursMap(prefs);
  const legacyClosed = !!prefs.tutorial_completed_at || !!prefs.tutorial_dismissed_at;

  const steps = tourId ? PAGE_TOURS[tourId] : [];
  const outcome: TourOutcome | null =
    tourId == null
      ? null
      : (tours[tourId] ?? (tourId === "overview" && legacyClosed ? "done" : null));

  // `closedLocally` hides the overlay the instant the user closes it,
  // covering the PATCH round-trip before `/auth/me` refetches.
  const [closedLocallyFor, setClosedLocallyFor] = useState<TourId | null>(null);
  const [localIndex, setLocalIndex] = useState(0);

  // Changing pages resets the cursor and the local-close override.
  useEffect(() => {
    setLocalIndex(0);
    setClosedLocallyFor(null);
  }, [tourId]);

  // A replay (entry deleted server-side) must restart from step 0 even
  // in this instance, where the cursor may still sit on a later step.
  useEffect(() => {
    if (outcome == null) setLocalIndex(0);
  }, [outcome]);

  const shouldShow =
    isDesktop &&
    !!tourId &&
    steps.length > 0 &&
    !!me.data &&
    !!me.data.organization &&
    closedLocallyFor !== tourId &&
    outcome == null;

  const patch = useMutation({
    mutationFn: (body: PreferencesPatch) =>
      apiFetch<Record<string, unknown>>("/api/v1/users/me/preferences", {
        method: "PATCH",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  const close = useCallback(
    (result: TourOutcome) => {
      if (!tourId) return;
      setClosedLocallyFor(tourId);
      patch.mutate({ tutorial_tours: { ...tours, [tourId]: result } });
    },
    // `tours` derives from the query cache; content-compare it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tourId, patch.mutate, JSON.stringify(tours)],
  );

  const replay = useCallback(() => {
    if (!tourId) return;
    setLocalIndex(0);
    setClosedLocallyFor(null);
    const rest = { ...tours };
    delete rest[tourId];
    const body: PreferencesPatch = { tutorial_tours: rest };
    if (tourId === "overview") {
      // The legacy single-tour keys also mark overview as done.
      body.tutorial_completed_at = null;
      body.tutorial_dismissed_at = null;
    }
    patch.mutate(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, patch.mutate, JSON.stringify(tours)]);

  const next = useCallback(() => {
    setLocalIndex((i) => Math.min(i + 1, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  const prev = useCallback(() => {
    setLocalIndex((i) => Math.max(i - 1, 0));
  }, []);

  return {
    tourId,
    shouldShow,
    totalSteps: steps.length,
    currentIndex: Math.min(localIndex, Math.max(steps.length - 1, 0)),
    isPersisting: patch.isPending,
    next,
    prev,
    dismiss: () => close("dismissed"),
    complete: () => close("done"),
    replay,
  };
}
