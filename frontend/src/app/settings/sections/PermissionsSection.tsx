import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

function LeaderboardVisibilityToggle() {
  const { t } = useTranslation("settings");
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
          {t("permissions.leaderboard.label")}
        </span>
        <span className="mt-0.5 block text-xs text-text-tertiary">
          {t("permissions.leaderboard.subtitle")}
        </span>
        {mutation.isError ? (
          <span className="mt-1 block text-xs text-danger" role="alert">
            {t("permissions.leaderboard.error")}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function OwnershipWindowSetting() {
  const { t } = useTranslation("settings");
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
    onError: () => setError(t("permissions.ownershipWindow.error.generic")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      setError(t("permissions.ownershipWindow.error.range"));
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
          {t("permissions.ownershipWindow.label")}
        </label>
        <p className="mt-1 text-xs text-text-tertiary">
          {t("permissions.ownershipWindow.subtitle")}
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
          {mutation.isPending
            ? t("permissions.ownershipWindow.saving")
            : t("permissions.ownershipWindow.save")}
        </button>
        {savedFlash ? (
          <span className="text-sm text-success" role="status">
            {t("permissions.ownershipWindow.savedFlash")}
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
  const { t } = useTranslation("settings");
  const own = t("permissions.scope.own");
  const team = t("permissions.scope.team");
  const all = t("permissions.scope.all");
  const yes = t("permissions.scope.yes");
  const dash = "—";
  const rows: { action: string; rep: string; manager: string; admin: string }[] = [
    {
      action: t("permissions.rows.viewAllDeals"),
      rep: own,
      manager: team,
      admin: all,
    },
    { action: t("permissions.rows.editCompanies"), rep: own, manager: team, admin: all },
    { action: t("permissions.rows.deleteCompanies"), rep: dash, manager: dash, admin: yes },
    { action: t("permissions.rows.manageUsers"), rep: dash, manager: dash, admin: yes },
    { action: t("permissions.rows.editPipeline"), rep: dash, manager: dash, admin: yes },
    { action: t("permissions.rows.exportReports"), rep: dash, manager: yes, admin: yes },
  ];
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("permissions.visibility.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{t("permissions.visibility.subtitle")}</p>
        <div className="mt-4">
          <LeaderboardVisibilityToggle />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("permissions.companyRules.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{t("permissions.companyRules.subtitle")}</p>
        <div className="mt-4">
          <OwnershipWindowSetting />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("permissions.table.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{t("permissions.table.subtitle")}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
                <th className="py-2 pr-4 font-medium">{t("permissions.table.action")}</th>
                <th className="py-2 pr-4 font-medium">{t("permissions.table.rep")}</th>
                <th className="py-2 pr-4 font-medium">{t("permissions.table.manager")}</th>
                <th className="py-2 font-medium">{t("permissions.table.admin")}</th>
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
