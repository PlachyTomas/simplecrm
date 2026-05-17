/**
 * Hook that owns the tutorial state machine + persistence.
 *
 * Source of truth is server-side (`user.preferences.tutorial_*`) so a
 * user logging in on a different browser sees the same dismissed /
 * completed state instead of having to redo the tour.
 *
 * The hook returns `shouldShow=false` while the user query is loading
 * — never flash the overlay before we know whether the user already
 * dismissed it.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { TUTORIAL_STEPS } from "@/app/tutorial/tutorialSteps";

interface PreferencesPatch {
  tutorial_completed_at?: string | null;
  tutorial_dismissed_at?: string | null;
  tutorial_step_index?: number | null;
}

interface TutorialState {
  shouldShow: boolean;
  totalSteps: number;
  currentIndex: number;
  isPersisting: boolean;
  next: () => void;
  prev: () => void;
  dismiss: () => void;
  complete: () => void;
  /** Reopen the tour from step 0. Wired to the header `?` button. */
  replay: () => void;
}

export function useTutorial(): TutorialState {
  const { accessToken } = useAuth();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const location = useLocation();
  // Out of scope on small viewports per the plan — the spotlight
  // anchors are in the desktop sidebar.
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const prefs = (me.data?.preferences ?? {}) as Record<string, unknown>;
  const completedAt =
    typeof prefs.tutorial_completed_at === "string" ? prefs.tutorial_completed_at : null;
  const dismissedAt =
    typeof prefs.tutorial_dismissed_at === "string" ? prefs.tutorial_dismissed_at : null;
  const storedIndex = typeof prefs.tutorial_step_index === "number" ? prefs.tutorial_step_index : 0;
  const onBillingReturn = location.pathname.startsWith("/app/billing/return");

  const baseShouldShow =
    isDesktop &&
    !!me.data &&
    !!me.data.organization &&
    !completedAt &&
    !dismissedAt &&
    !onBillingReturn;

  // Local cursor — drives the displayed step. Initialized from the
  // server-side resume point so a mid-tour reload picks up where the
  // user left off.
  const [localIndex, setLocalIndex] = useState<number | null>(null);
  const currentIndex = localIndex ?? Math.min(storedIndex, TUTORIAL_STEPS.length - 1);

  // When the tour is closed (completed/dismissed), drop the cursor so
  // a subsequent `replay()` re-opens at step 0 instead of resuming
  // from wherever the previous instance left off. Multiple
  // `useTutorial` consumers each hold their own `localIndex`; this
  // effect keeps every instance in sync via the shared server state.
  useEffect(() => {
    if (!baseShouldShow) setLocalIndex(null);
  }, [baseShouldShow]);

  const patch = useMutation({
    mutationFn: (body: PreferencesPatch) =>
      apiFetch<Record<string, unknown>>("/api/v1/users/me/preferences", {
        method: "PATCH",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      // Refresh `/auth/me` so a follow-up reload reads the new prefs.
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  const persistIndex = useCallback(
    (index: number) => {
      patch.mutate({ tutorial_step_index: index });
    },
    [patch],
  );

  const next = useCallback(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= TUTORIAL_STEPS.length) return;
    setLocalIndex(nextIdx);
    persistIndex(nextIdx);
  }, [currentIndex, persistIndex]);

  const prev = useCallback(() => {
    if (currentIndex <= 0) return;
    const prevIdx = currentIndex - 1;
    setLocalIndex(prevIdx);
    persistIndex(prevIdx);
  }, [currentIndex, persistIndex]);

  const dismiss = useCallback(() => {
    patch.mutate({ tutorial_dismissed_at: new Date().toISOString() });
  }, [patch]);

  const complete = useCallback(() => {
    patch.mutate({ tutorial_completed_at: new Date().toISOString() });
  }, [patch]);

  const replay = useCallback(() => {
    setLocalIndex(0);
    patch.mutate({
      tutorial_completed_at: null,
      tutorial_dismissed_at: null,
      tutorial_step_index: 0,
    });
  }, [patch]);

  return {
    shouldShow: baseShouldShow,
    totalSteps: TUTORIAL_STEPS.length,
    currentIndex,
    isPersisting: patch.isPending,
    next,
    prev,
    dismiss,
    complete,
    replay,
  };
}

/** Read-only sibling: true when the user has either completed or
 *  dismissed the tour. Used by the header `?` button to know whether
 *  to render itself (we hide it while the tour is showing to avoid
 *  competing with itself). */
export function useTutorialIsClosed(): boolean {
  const me = useCurrentUser();
  const prefs = (me.data?.preferences ?? {}) as Record<string, unknown>;
  return !!prefs.tutorial_completed_at || !!prefs.tutorial_dismissed_at;
}
