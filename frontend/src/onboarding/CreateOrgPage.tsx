import { useMutation } from "@tanstack/react-query";
import { Building2, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError, apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";
import type { components } from "@/types/api.generated";

type CurrentUser = components["schemas"]["CurrentUser"];

/**
 * Standalone page shown to a freshly signed-up user (post-Google OAuth) who
 * hasn't picked an organization yet. The only required field is the org
 * name; IčO and other registry fields move to Settings → Firma where
 * they're optional. Submitting promotes the user to admin, creates the
 * default team ("Hlavní tým"), and seeds the default pipeline.
 */
export function CreateOrgPage() {
  usePageTitle("Vytvořit organizaci");
  const { accessToken, clearAuth } = useAuth();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation<CurrentUser, Error, { name: string }>({
    mutationFn: (body) =>
      apiFetch<CurrentUser>("/api/v1/onboarding/organization", {
        method: "POST",
        token: accessToken,
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/app");
    },
  });

  // If somebody navigates here with an existing org, bounce into the app.
  useEffect(() => {
    if (user?.organization) {
      navigate("/app", { replace: true });
    }
  }, [user?.organization, navigate]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Zadejte název organizace.");
      return;
    }
    mutation.mutate(
      { name: trimmed },
      {
        onError: (err) => {
          if (err instanceof ApiError) {
            const detail = (err.body as { detail?: unknown })?.detail;
            setError(typeof detail === "string" ? detail : "Vytvoření selhalo.");
          } else {
            setError(err.message || "Vytvoření selhalo.");
          }
        },
      },
    );
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4 flex items-center gap-3">
        <ThemeToggle variant="compact" />
        <button
          type="button"
          onClick={() => {
            clearAuth();
            navigate("/login");
          }}
          className="text-xs text-text-tertiary hover:text-text-primary"
        >
          Odhlásit se
        </button>
      </div>
      <main
        aria-labelledby="create-org-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-md"
      >
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
        >
          <Sparkles size={24} strokeWidth={1.75} />
        </div>
        <h1 id="create-org-title" className="text-center text-2xl font-semibold">
          Vytvořte si organizaci
        </h1>
        <p className="mt-2 text-center text-sm text-text-secondary">
          Stačí zadat název. Detaily firmy můžete doplnit kdykoli později
          v Nastavení.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              Název organizace
            </span>
            <div className="relative mt-2">
              <Building2
                aria-hidden
                size={18}
                strokeWidth={1.75}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="text"
                autoComplete="organization"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme s.r.o."
                className="block h-10 w-full rounded-md border border-border bg-surface-overlay pl-10 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
            </div>
          </label>

          {error ? (
            <p
              className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Vytvářím…" : "Vytvořit a pokračovat"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-text-tertiary">
          Pozvánka od kolegů? Použijte odkaz, který vám přišel e-mailem,
          místo zakládání nové organizace.
        </p>
      </main>
    </div>
  );
}
