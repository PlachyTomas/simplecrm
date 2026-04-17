import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { OnboardingForm } from "@/app/OnboardingForm";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

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

      <main className="mx-auto max-w-[1440px] px-4 py-12 md:px-8">
        <section className="mx-auto max-w-2xl rounded-lg border border-border bg-surface p-6">
          <h1 className="text-2xl font-semibold">Vítejte zpět, {user.name}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Aplikace se teprve staví. V dalších krocích přibude přehled obchodů, firem a kontaktů.
            Sledujte <code className="font-mono text-text-primary">WORK_LOG.md</code> pro aktuální
            postup.
          </p>
        </section>
      </main>
    </div>
  );
}
