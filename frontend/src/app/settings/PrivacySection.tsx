import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ParseKeys } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import type { components } from "@/types/api.generated";

type AdminAccessLogList = components["schemas"]["AdminAccessLogList"];
type AdminAccessLogRow = components["schemas"]["AdminAccessLogRow"];
type OrganizationEraseOut = components["schemas"]["OrganizationEraseOut"];
type OrganizationOut = components["schemas"]["OrganizationOut"];

const ACTION_LABEL_KEY: Record<AdminAccessLogRow["action"], ParseKeys<"settings">> = {
  list_users: "privacy.actions.list_users",
  view_subscription: "privacy.actions.view_subscription",
  view_invoices: "privacy.actions.view_invoices",
  view_activity: "privacy.actions.view_activity",
  impersonate: "privacy.actions.impersonate",
};

function useAdminAccessLog() {
  const { accessToken } = useAuth();
  return useQuery<AdminAccessLogList>({
    queryKey: ["org", "admin-access-log"],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<AdminAccessLogList>("/api/v1/organizations/me/admin-access-log?limit=100", {
        token: accessToken,
      }),
  });
}

function useCurrentOrganization() {
  const { accessToken } = useAuth();
  return useQuery<OrganizationOut>({
    queryKey: ["org", "current"],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", { token: accessToken }),
  });
}

function useEraseOrganization() {
  const { accessToken } = useAuth();
  return useMutation<OrganizationEraseOut, ApiError, { confirmation_name: string }>({
    mutationFn: (body) =>
      apiFetch<OrganizationEraseOut>("/api/v1/organizations/me/erase", {
        method: "POST",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
  });
}

export function PrivacySection() {
  const { t } = useTranslation("settings");
  const locale = useLocale();
  const query = useAdminAccessLog();
  const org = useCurrentOrganization();
  const me = useCurrentUser();

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("privacy.operatorAccess.title")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t("privacy.operatorAccess.bodyPrefix")}{" "}
          <Link
            to="/zpracovatelska-smlouva#cl-5"
            className="underline hover:text-text-primary"
            target="_blank"
            rel="noreferrer"
          >
            {t("privacy.operatorAccess.linkText")}
          </Link>
          .
        </p>

        <div className="mt-5">
          {query.isPending ? (
            <p className="text-sm text-text-tertiary" role="status">
              {t("privacy.operatorAccess.loading")}
            </p>
          ) : query.isError ? (
            <p className="text-sm text-danger" role="alert">
              {t("privacy.operatorAccess.error")}
            </p>
          ) : query.data && query.data.items.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t("privacy.operatorAccess.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-text-tertiary">
                  <tr>
                    <th className="border-b border-border-subtle py-2 pr-4 font-medium">
                      {t("privacy.operatorAccess.table.when")}
                    </th>
                    <th className="border-b border-border-subtle py-2 pr-4 font-medium">
                      {t("privacy.operatorAccess.table.action")}
                    </th>
                    <th className="border-b border-border-subtle py-2 pr-4 font-medium">
                      {t("privacy.operatorAccess.table.by")}
                    </th>
                    <th className="border-b border-border-subtle py-2 font-medium">
                      {t("privacy.operatorAccess.table.target")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data?.items.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="border-b border-border-subtle py-2 pr-4 text-text-secondary">
                        {formatDate(row.created_at, locale, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="border-b border-border-subtle py-2 pr-4 text-text-primary">
                        {t(ACTION_LABEL_KEY[row.action])}
                      </td>
                      <td className="border-b border-border-subtle py-2 pr-4 text-text-secondary">
                        {row.super_admin_email}
                      </td>
                      <td className="border-b border-border-subtle py-2 text-text-secondary">
                        {row.target_user_email ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {me.data?.role === "admin" && org.data ? <DangerZone orgName={org.data.name} /> : null}
    </section>
  );
}

function DangerZone({ orgName }: { orgName: string }) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-danger/40 bg-danger-subtle p-6">
      <h2 className="text-lg font-semibold text-text-primary">{t("privacy.dangerZone.title")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("privacy.dangerZone.body1")}</p>
      <p className="mt-2 text-xs text-text-tertiary">{t("privacy.dangerZone.body2")}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-danger bg-surface px-5 text-sm font-medium text-danger transition-colors duration-fast hover:bg-danger hover:text-text-on-accent"
      >
        {t("privacy.dangerZone.button")}
      </button>

      {open ? <EraseOrgDialog orgName={orgName} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function EraseOrgDialog({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const { t } = useTranslation("settings");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { accessToken, clearAuth } = useAuth();
  const queryClient = useQueryClient();
  const erase = useEraseOrganization();

  const matches = typed === orgName;
  const submitDisabled = !matches || erase.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitDisabled) return;
    setError(null);
    erase.mutate(
      { confirmation_name: typed },
      {
        onSuccess: async () => {
          // Anonymization deactivates every user; existing tokens stop
          // working on the next request. Best-effort logout to invalidate
          // the refresh cookie, then clear local state and bounce to the
          // public landing.
          try {
            await apiFetch<void>("/api/v1/auth/logout", {
              method: "POST",
              token: accessToken,
            });
          } catch {
            // Already gone server-side — no recovery needed.
          }
          clearAuth();
          queryClient.clear();
          navigate("/", { replace: true });
        },
        onError: (err) => {
          const detail =
            err instanceof ApiError ? (err.body as { detail?: string } | null)?.detail : undefined;
          setError(detail ?? t("privacy.eraseDialog.genericError"));
        },
      },
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="erase-org-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 py-8"
      onClick={(e) => {
        if (e.target === e.currentTarget && !erase.isPending) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id="erase-org-title" className="text-lg font-semibold text-text-primary">
          {t("privacy.eraseDialog.title")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t("privacy.eraseDialog.confirmBody")}
        </p>
        <p className="mt-2 rounded-md border border-border bg-surface-overlay px-3 py-2 font-mono text-sm text-text-primary">
          {orgName}
        </p>
        <label className="mt-4 block text-xs font-medium text-text-tertiary">
          {t("privacy.eraseDialog.nameLabel")}
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={erase.isPending}
            autoComplete="off"
            autoFocus
            className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary"
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submitDisabled}
            className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {erase.isPending ? t("privacy.eraseDialog.submitting") : t("privacy.eraseDialog.submit")}
          </button>
          <button
            type="button"
            disabled={erase.isPending}
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            {t("privacy.eraseDialog.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
