import { useMutation } from "@tanstack/react-query";
import { Settings, Sparkles } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { MobileTabBar } from "@/app/MobileTabBar";
import { Sidebar } from "@/app/Sidebar";
import { TrialBanner } from "@/app/TrialBanner";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { apiFetch } from "@/lib/api";
import { csNoun } from "@/lib/i18n/nouns";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { data: user } = useCurrentUser();
  const { data: subscription } = useCurrentSubscription();
  const { accessToken, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Pipeline is the only route that wants fluid full-viewport layout — the
  // kanban needs every horizontal pixel and clamps its own scroll.
  const fluidLayout = location.pathname.startsWith("/app/pipeline");

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

  const locale = user.organization.locale;
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
    <div
      className={cn(
        "flex bg-bg text-text-primary",
        fluidLayout ? "h-screen overflow-hidden" : "min-h-screen",
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-text-on-accent focus:shadow-lg"
      >
        Přeskočit na obsah
      </a>
      <Sidebar onLogout={() => logout.mutate()} />

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          fluidLayout ? "h-screen overflow-hidden" : "min-h-screen",
        )}
      >
        <TrialBanner daysRemaining={daysRemaining} endsOn={trialEndsAt} />
        <header className="bg-bg/90 sticky top-0 z-30 border-b border-border-subtle backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-highlight text-text-on-accent md:hidden"
              >
                <Sparkles size={18} strokeWidth={1.75} />
              </span>
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
                        Zkušební doba do <time>{trialEndsAt}</time> ·{" "}
                      </span>
                      {daysRemaining} {csNoun(daysRemaining, "den")}{" "}
                      {daysRemaining >= 2 && daysRemaining <= 4 ? "zbývají" : "zbývá"}
                    </span>
                    {showUpgradeCta ? (
                      <Link
                        to="/app/nastaveni/predplatne"
                        className={`underline-offset-2 hover:underline ${
                          daysRemaining <= 3 ? "font-semibold" : "font-medium"
                        }`}
                      >
                        Vybrat plán →
                      </Link>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user.is_super_admin ? (
                <Link
                  to="/admin"
                  aria-label="Admin"
                  title="Admin"
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
          className={cn(
            "w-full flex-1 focus:outline-none",
            fluidLayout
              ? "flex min-h-0 flex-col overflow-hidden pb-20 md:pb-0"
              : "mx-auto max-w-[1200px] pb-20 md:pb-12",
          )}
        >
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
