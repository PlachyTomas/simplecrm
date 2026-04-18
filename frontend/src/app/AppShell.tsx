import { useMutation } from "@tanstack/react-query";
import { Building2, Home, LogOut } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { OnboardingForm } from "@/app/OnboardingForm";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";

const NAV_LINK_BASE =
  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast";

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    NAV_LINK_BASE,
    isActive
      ? "bg-accent-subtle text-accent"
      : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
  );
}

export function AppShell() {
  const { data: user } = useCurrentUser();
  const { accessToken, clearAuth } = useAuth();

  const logout = useMutation({
    mutationFn: () =>
      apiFetch<void>("/api/v1/auth/logout", {
        method: "POST",
        token: accessToken,
      }),
    onSettled: () => {
      clearAuth();
      queryClient.clear();
    },
  });

  if (!user) return null;

  const trialEndsAt = new Intl.DateTimeFormat(user.organization.locale, {
    dateStyle: "long",
  }).format(new Date(user.organization.trial_ends_at));

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4 md:px-8">
          <div>
            <p className="text-sm font-medium text-text-tertiary">{user.organization.name}</p>
            <p className="text-xs text-text-tertiary">
              Zkušební doba do <time>{trialEndsAt}</time>
            </p>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/app" end className={navClass}>
              <Home size={16} strokeWidth={1.75} /> Přehled
            </NavLink>
            <NavLink to="/app/companies" className={navClass}>
              <Building2 size={16} strokeWidth={1.75} /> Firmy
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
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
            <div className="text-right">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-text-tertiary">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => logout.mutate()}
              aria-label="Odhlásit se"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
            >
              <LogOut size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      {user.organization.ico == null && user.role === "admin" ? (
        <OnboardingForm
          defaults={{ name: user.organization.name, ico: user.organization.ico ?? null }}
        />
      ) : null}

      <main className="mx-auto max-w-[1440px]">
        <Outlet />
      </main>
    </div>
  );
}

export function AppHome() {
  const { data: user } = useCurrentUser();
  if (!user) return null;
  return (
    <section className="mx-auto max-w-2xl px-4 py-12 md:px-8">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h1 className="text-2xl font-semibold">Vítejte zpět, {user.name}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Aplikace se teprve staví. V dalších krocích přibudou obchody, kontakty a Kanban pipeline.
          Pro teď si můžete prohlédnout přehled firem.
        </p>
      </div>
    </section>
  );
}
