import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

function LeaderboardVisibilityToggle() {
  const { data: user } = useCurrentUser();
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const initial = !!user?.organization?.show_leaderboard_to_salespeople;
  const [checked, setChecked] = useState(initial);

  // Keep local state in sync if /auth/me re-resolves with a different value
  // (e.g. another admin flips it in another tab).
  useEffect(() => {
    setChecked(initial);
  }, [initial]);

  const mutation = useMutation<OrganizationOut, Error, boolean>({
    mutationFn: (next) =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", {
        method: "PUT",
        token: accessToken,
        body: { show_leaderboard_to_salespeople: next },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  function onToggle(next: boolean) {
    setChecked(next);
    mutation.mutate(next, {
      onError: () => setChecked(!next),
    });
  }

  return (
    <label className="flex items-start gap-3 rounded-md border border-border-subtle bg-surface-overlay p-4">
      <input
        type="checkbox"
        checked={checked}
        disabled={mutation.isPending}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
      />
      <span>
        <span className="block text-sm font-medium text-text-primary">
          Zobrazit obchodníkům žebříček
        </span>
        <span className="mt-0.5 block text-xs text-text-tertiary">
          Když je vypnuto, obchodníci v Reportech vidí pouze své vlastní výsledky. Manažeři a
          administrátoři žebříček vidí vždy.
        </span>
        {mutation.isError ? (
          <span className="mt-1 block text-xs text-danger" role="alert">
            Uložení se nezdařilo.
          </span>
        ) : null}
      </span>
    </label>
  );
}

function OwnershipWindowSetting() {
  const { data: user } = useCurrentUser();
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const initial = user?.organization?.ownership_window_days ?? 365;
  const [days, setDays] = useState<string>(String(initial));
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the input in sync if /auth/me re-resolves with a different value
  // (e.g. another admin updated it in another tab).
  useEffect(() => {
    setDays(String(initial));
  }, [initial]);

  const mutation = useMutation<OrganizationOut, Error, number>({
    mutationFn: (next) =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", {
        method: "PUT",
        token: accessToken,
        body: { ownership_window_days: next },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: () => setError("Uložení se nezdařilo. Zkuste to prosím znovu."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      setError("Hodnota musí být mezi 1 a 3650 dny.");
      return;
    }
    if (n === initial) return; // no-op
    mutation.mutate(n);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-border-subtle bg-surface-overlay p-4"
    >
      <div>
        <label
          htmlFor="ownership-window-days"
          className="block text-sm font-medium text-text-primary"
        >
          Doba držení firem (dny)
        </label>
        <p className="mt-1 text-xs text-text-tertiary">
          Po této době bez vyhraného obchodu se firma automaticky uvolní z poolu obchodníka zpět
          manažerům k přerozdělení. Výchozí hodnota je 365 dní (1 rok). Povolený rozsah 1–3650 dní.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="ownership-window-days"
          type="number"
          min={1}
          max={3650}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          disabled={mutation.isPending}
          className="block h-10 w-32 rounded-md border border-border bg-bg px-3 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={mutation.isPending || Number(days) === initial}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? "Ukládáme…" : "Uložit"}
        </button>
        {savedFlash ? (
          <span className="text-sm text-success" role="status">
            Uloženo.
          </span>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function PermissionsSection() {
  const rows: { action: string; rep: string; manager: string; admin: string }[] = [
    {
      action: "Vidět všechny obchody v rámci pipeline",
      rep: "Jen vlastní",
      manager: "Tým",
      admin: "Vše",
    },
    { action: "Editovat firmy", rep: "Jen vlastní", manager: "Tým", admin: "Vše" },
    { action: "Mazat firmy a uvolňovat z poolu", rep: "—", manager: "—", admin: "Ano" },
    { action: "Spravovat uživatele a týmy", rep: "—", manager: "—", admin: "Ano" },
    { action: "Editovat fáze pipeline", rep: "—", manager: "—", admin: "Ano" },
    { action: "Exportovat reporty", rep: "—", manager: "Ano", admin: "Ano" },
  ];
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Viditelnost</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Co vidí jednotlivé role v Reportech a na Přehledu.
        </p>
        <div className="mt-4">
          <LeaderboardVisibilityToggle />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Pravidla pro firmy</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Doba, po které neaktivní firmy připadají manažerům zpět k přerozdělení.
        </p>
        <div className="mt-4">
          <OwnershipWindowSetting />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Oprávnění</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Oprávnění jsou v této verzi pevně daná. Pokud potřebujete vlastní role, dejte nám vědět.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
                <th className="py-2 pr-4 font-medium">Akce</th>
                <th className="py-2 pr-4 font-medium">Obchodník</th>
                <th className="py-2 pr-4 font-medium">Manažer</th>
                <th className="py-2 font-medium">Administrátor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <tr key={r.action}>
                  <td className="py-2 pr-4 text-text-primary">{r.action}</td>
                  <td className="py-2 pr-4 text-text-secondary">{r.rep}</td>
                  <td className="py-2 pr-4 text-text-secondary">{r.manager}</td>
                  <td className="py-2 text-text-secondary">{r.admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
