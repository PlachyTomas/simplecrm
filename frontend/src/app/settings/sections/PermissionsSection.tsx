import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import { testIds } from "@/lib/testids";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

/** Boolean org flag with optimistic local state and rollback on failure. */
function OrgFlagToggle({
  field,
  initial,
  label,
  subtitle,
  errorLabel,
  testId,
}: {
  field: "show_leaderboard_to_salespeople" | "email_tracking_enabled";
  initial: boolean;
  label: string;
  subtitle: string;
  errorLabel: string;
  testId?: string;
}) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
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
        body: { [field]: next },
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
        data-testid={testId}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
      />
      <span>
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        <span className="mt-0.5 block text-xs text-text-tertiary">{subtitle}</span>
        {mutation.isError ? (
          <span className="mt-1 block text-xs text-danger" role="alert">
            {errorLabel}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function LeaderboardVisibilityToggle() {
  const { t } = useTranslation("settings");
  const { data: user } = useCurrentUser();
  return (
    <OrgFlagToggle
      field="show_leaderboard_to_salespeople"
      initial={!!user?.organization?.show_leaderboard_to_salespeople}
      label={t("permissions.leaderboard.label")}
      subtitle={t("permissions.leaderboard.subtitle")}
      errorLabel={t("permissions.leaderboard.error")}
    />
  );
}

function EmailTrackingToggle() {
  const { t } = useTranslation("settings");
  const { data: user } = useCurrentUser();
  return (
    <OrgFlagToggle
      field="email_tracking_enabled"
      // Absent flag = server default (tracking on) — never render "off" for a
      // stale /auth/me payload, that would misrepresent what is being sent.
      initial={user?.organization?.email_tracking_enabled !== false}
      label={t("permissions.emailTracking.label")}
      subtitle={t("permissions.emailTracking.subtitle")}
      errorLabel={t("permissions.emailTracking.error")}
      testId={testIds.settings.emailTrackingToggle}
    />
  );
}

/**
 * Numeric org setting expressed in days, with explicit save + range check.
 *
 * Shared by the company auto-release window (min 1) and the pipeline rotting
 * threshold (min 0 — zero switches that indicator off), so the two can't
 * drift apart in behaviour: same optimistic-free submit, same saved-flash,
 * same "Save is disabled while the value is unchanged" no-op guard.
 */
function OrgDaysSetting({
  field,
  initial,
  min,
  inputId,
  label,
  subtitle,
  rangeError,
  genericError,
  testId,
}: {
  field: "ownership_window_days" | "deal_rotting_days";
  initial: number;
  min: number;
  inputId: string;
  label: string;
  subtitle: string;
  rangeError: string;
  genericError: string;
  testId?: string;
}) {
  const { t } = useTranslation("settings");
  const { accessToken } = useAuth();
  const qc = useQueryClient();
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
        body: { [field]: next },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
      // The board reads the threshold off /auth/me, but its own cache holds
      // the day counts — drop it so a changed threshold shows immediately.
      void qc.invalidateQueries({ queryKey: ["pipeline", "default", "board"] });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: () => setError(genericError),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(days);
    if (!Number.isFinite(n) || n < min || n > 3650) {
      setError(rangeError);
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
        <label htmlFor={inputId} className="block text-sm font-medium text-text-primary">
          {label}
        </label>
        <p className="mt-1 text-xs text-text-tertiary">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={inputId}
          type="number"
          min={min}
          max={3650}
          value={days}
          data-testid={testId}
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

function OwnershipWindowSetting() {
  const { t } = useTranslation("settings");
  const { data: user } = useCurrentUser();
  return (
    <OrgDaysSetting
      field="ownership_window_days"
      initial={user?.organization?.ownership_window_days ?? 365}
      min={1}
      inputId="ownership-window-days"
      label={t("permissions.ownershipWindow.label")}
      subtitle={t("permissions.ownershipWindow.subtitle")}
      rangeError={t("permissions.ownershipWindow.error.range")}
      genericError={t("permissions.ownershipWindow.error.generic")}
    />
  );
}

function DealRottingSetting() {
  const { t } = useTranslation("settings");
  const { data: user } = useCurrentUser();
  return (
    <OrgDaysSetting
      field="deal_rotting_days"
      // Absent = a stale /auth/me payload; render the server default rather
      // than 0, which would claim the indicator is switched off.
      initial={user?.organization?.deal_rotting_days ?? 14}
      min={0}
      inputId="deal-rotting-days"
      label={t("dealRotting.label")}
      subtitle={t("dealRotting.inputSubtitle")}
      rangeError={t("dealRotting.error.range")}
      genericError={t("dealRotting.error.generic")}
      testId={testIds.settings.dealRottingDaysInput}
    />
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
        <h2 className="text-lg font-semibold">{t("permissions.emailTracking.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          {t("permissions.emailTracking.subtitleCard")}
        </p>
        <div className="mt-4">
          <EmailTrackingToggle />
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
        <h2 className="text-lg font-semibold">{t("dealRotting.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{t("dealRotting.subtitle")}</p>
        <div className="mt-4">
          <DealRottingSetting />
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
