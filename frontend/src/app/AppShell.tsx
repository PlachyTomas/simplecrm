import { useMutation } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { MobileTabBar } from "@/app/MobileTabBar";
import { InstallNudge } from "@/app/pwa/InstallNudge";
import { GlobalSearch } from "@/app/search/GlobalSearch";
import { Sidebar } from "@/app/Sidebar";
import { TourOverlay, TourReplayButton } from "@/app/tutorial";
import { TrialBanner } from "@/app/TrialBanner";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { Logo } from "@/components/Logo";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { apiFetch } from "@/lib/api";
import { useLocale } from "@/lib/i18n/useLocale";
import { useSyncUserLanguage } from "@/lib/i18n/useSyncUserLanguage";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { t } = useTranslation("common");
  const { data: user } = useCurrentUser();
  useSyncUserLanguage();
  const locale = useLocale();
  const { data: subscription } = useCurrentSubscription();
  const { accessToken, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // The app is viewport-locked: the sidebar and top bar never move and
  // scrolling happens inside a content region, never on the window.
  //
  // Fluid routes go one step further and hand the whole region to the page —
  // the kanban needs every horizontal pixel, the calendar and the contacts
  // split-pane scroll several panes independently — so they opt out of the
  // shared scroll container and the centred max-width wrapper and take
  // responsibility for scrolling everything themselves.
  const fluidLayout =
    location.pathname.startsWith("/app/pipeline") ||
    location.pathname.startsWith("/app/calendar") ||
    location.pathname.startsWith("/app/contacts");

  const logout = useMutation({
    mutationFn: () =>
      apiFetch<void>("/api/v1/auth/logout", {
        method: "POST",
        token: accessToken,
      }),
    onSettled: () => {
      clearAuth();
      queryClient.clear();
      // Land on the public landing page rather than letting ProtectedRoute
      // bounce the now-tokenless session to /login. Logout is a goodbye,
      // not a "please sign back in" prompt.
      navigate("/");
    },
  });

  if (!user || !user.organization) return null;

  const trialEndsAt = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(user.organization.trial_ends_at),
  );

  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(user.organization.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );
  const trialBadgeClass =
    daysRemaining <= 3 ? "text-danger" : daysRemaining <= 7 ? "text-warning" : "text-text-tertiary";
  // Hide the trial badge entirely for orgs we positively know are not in
  // trial (paid / comp / canceled). Loading or unknown → keep showing —
  // we never gate UI on a guess.
  const showTrialBadge = !subscription || subscription.access_status === "trialing";
  const showUpgradeCta = showTrialBadge && daysRemaining <= 7;

  return (
    // `relative` is load-bearing on the fluid routes: it makes this the
    // containing block for absolutely-positioned descendants that have no
    // positioned ancestor of their own — notably Tailwind's `sr-only`, which
    // is `position: absolute`. Resolving against the viewport instead, an
    // sr-only element below the fold escapes the `overflow-hidden` here and
    // gives the kanban a stray window scrollbar over blank space.
    // `h-dvh`, not `h-screen`: on mobile browsers 100vh includes the
    // collapsible URL bar, which pushes the tab bar off-screen.
    <div className="relative flex h-dvh overflow-hidden bg-bg text-text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-text-on-accent focus:shadow-lg"
      >
        {t("shell.skipToContent")}
      </a>
      <Sidebar onLogout={() => logout.mutate()} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showTrialBadge ? <TrialBanner daysRemaining={daysRemaining} endsOn={trialEndsAt} /> : null}
        <header className="z-30 shrink-0 border-b border-border-subtle bg-bg/70 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to="/app"
                aria-label="SimpleCRM"
                className="shrink-0 rounded-md text-lg outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
              >
                <Logo />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {user.organization.name}
                </p>
                {showTrialBadge ? (
                  <p
                    data-testid="trial-badge"
                    className={`flex flex-wrap items-baseline gap-x-2 text-xs ${trialBadgeClass}`}
                  >
                    <span>
                      <span className="hidden sm:inline">
                        {t("trial.untilPrefix")} <time>{trialEndsAt}</time> ·{" "}
                      </span>
                      {t("trial.remaining", { count: daysRemaining })}
                    </span>
                    {showUpgradeCta ? (
                      <Link
                        to="/app/nastaveni/predplatne"
                        className={`underline-offset-2 hover:underline ${
                          daysRemaining <= 3 ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {t("trial.choosePlanCta")}
                      </Link>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <GlobalSearch />
              <TourReplayButton />
              {user.is_super_admin ? (
                <Link
                  to="/admin"
                  aria-label={t("shell.adminLink")}
                  title={t("shell.adminLink")}
                  data-testid="admin-gear"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
                >
                  <Settings size={16} strokeWidth={1.75} aria-hidden />
                </Link>
              ) : null}
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full border border-border-subtle"
                />
              ) : (
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-semibold text-text-primary"
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="hidden text-right md:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-text-tertiary">{user.email}</p>
              </div>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          // `pb-20` lives on the scroll container, not the wrapper inside
          // it, so the padding stays at the end of the scrollable content
          // and the last row clears the mobile tab bar however long the
          // page is.
          className={cn(
            "min-h-0 w-full flex-1 pb-20 focus:outline-none md:pb-0",
            fluidLayout ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          {fluidLayout ? (
            <Outlet />
          ) : (
            // `h-full`, not `min-h-full`: a definite height is what lets a
            // page claim the viewport remainder with `flex-1` and push its
            // overflow into a region it scrolls itself. With `min-h-full`
            // the column just grows and `main` scrolls instead — which
            // stays the fallback for pages that don't opt in, since their
            // overflow scrolls `main` either way.
            <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col">
              <Outlet />
            </div>
          )}
        </main>
      </div>

      <MobileTabBar />
      <InstallNudge />
      <TourOverlay />
    </div>
  );
}
