import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ParseKeys } from "i18next";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useOrgTeams } from "@/app/settings/useUsersTeams";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { useToast } from "@/lib/toast";
import type { components } from "@/types/api.generated";

type InvitationOut = components["schemas"]["InvitationOut"];
type InvitationCreate = components["schemas"]["InvitationCreate"];
type InvitationCreated = components["schemas"]["InvitationCreated"];
type Page = components["schemas"]["Page_InvitationOut_"];

const INVITES_KEY = ["org", "invitations"] as const;

const ROLE_LABEL_KEY: Record<string, ParseKeys<"settings">> = {
  admin: "invitations.roles.admin",
  manager: "invitations.roles.manager",
  salesperson: "invitations.roles.salesperson",
};

function useInvitations() {
  const { accessToken } = useAuth();
  return useQuery<Page>({
    queryKey: INVITES_KEY,
    enabled: !!accessToken,
    staleTime: 15_000,
    queryFn: () => apiFetch<Page>("/api/v1/invitations?limit=100", { token: accessToken }),
  });
}

function useCreateInvitation() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<InvitationCreated, Error, InvitationCreate>({
    mutationFn: (body) =>
      apiFetch<InvitationCreated>("/api/v1/invitations", {
        method: "POST",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVITES_KEY });
    },
  });
}

function useRevokeInvitation() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/invitations/${id}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVITES_KEY });
    },
  });
}

interface NewInvite {
  email: string;
  role: "admin" | "manager" | "salesperson";
  team_id: string;
  can_invite: boolean;
}

function emptyInvite(defaultTeamId: string): NewInvite {
  return {
    email: "",
    role: "salesperson",
    team_id: defaultTeamId,
    can_invite: false,
  };
}

export function InvitationsSection() {
  const { t } = useTranslation("settings");
  const { data: currentUser } = useCurrentUser();
  const invitations = useInvitations();
  const teams = useOrgTeams();
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();
  const toast = useToast();

  const teamItems = teams.data?.items ?? [];
  const defaultTeamId = teamItems.find((t) => t.is_default)?.id ?? "";

  const [draft, setDraft] = useState<NewInvite>(() => emptyInvite(defaultTeamId));
  const [error, setError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const canManage = currentUser?.role === "admin" || !!currentUser?.can_invite;

  // Sync default team into the draft once teams load.
  useEffect(() => {
    if (defaultTeamId && draft.team_id === "") {
      setDraft((d) => ({ ...d, team_id: defaultTeamId }));
    }
  }, [defaultTeamId, draft.team_id]);

  if (!canManage) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("invitations.permissionDenied.title")}</h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t("invitations.permissionDenied.body")}
        </p>
      </section>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLastInviteUrl(null);
    const trimmed = draft.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t("invitations.errors.invalidEmail"));
      return;
    }
    try {
      const result = await create.mutateAsync({
        email: trimmed,
        role: draft.role,
        team_id: draft.team_id || null,
        can_invite: draft.can_invite,
      });
      setLastInviteUrl(result.invite_url);
      setDraft(emptyInvite(defaultTeamId));
      toast.success(t("invitations.createdToast", { email: result.invitation.email }));
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: unknown })?.detail;
        if (typeof detail === "string") setError(detail);
        else if (detail && typeof detail === "object" && "detail" in detail)
          setError(String((detail as { detail: unknown }).detail));
        else setError(t("invitations.errors.createGeneric"));
      } else {
        setError(err instanceof Error ? err.message : t("invitations.errors.createGeneric"));
      }
    }
  }

  async function onRevoke(invite: InvitationOut) {
    if (!window.confirm(t("invitations.pending.revokeConfirm", { email: invite.email }))) return;
    try {
      await revoke.mutateAsync(invite.id);
      toast.success(t("invitations.pending.revokeSuccess"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("invitations.pending.revokeError");
      toast.error(msg);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("invitations.invite.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{t("invitations.invite.subtitle")}</p>

        <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <label className="text-xs font-medium text-text-tertiary sm:col-span-5">
            {t("invitations.invite.emailLabel")}
            <input
              type="email"
              required
              autoComplete="off"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder={t("invitations.invite.emailPlaceholder")}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>

          <label className="text-xs font-medium text-text-tertiary sm:col-span-3">
            {t("invitations.invite.roleLabel")}
            <select
              value={draft.role}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  role: e.target.value as NewInvite["role"],
                }))
              }
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="salesperson">{t(ROLE_LABEL_KEY.salesperson!)}</option>
              <option value="manager">{t(ROLE_LABEL_KEY.manager!)}</option>
              <option value="admin">{t(ROLE_LABEL_KEY.admin!)}</option>
            </select>
          </label>

          <label className="text-xs font-medium text-text-tertiary sm:col-span-4">
            {t("invitations.invite.teamLabel")}
            <select
              value={draft.team_id}
              onChange={(e) => setDraft((d) => ({ ...d, team_id: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="">{t("invitations.invite.noTeamOption")}</option>
              {teamItems.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                  {team.is_default ? t("invitations.invite.defaultTeamSuffix") : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-1 inline-flex items-center gap-2 text-sm text-text-secondary sm:col-span-12">
            <input
              type="checkbox"
              checked={draft.can_invite}
              onChange={(e) => setDraft((d) => ({ ...d, can_invite: e.target.checked }))}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            {t("invitations.invite.canInviteLabel")}
          </label>

          {error ? (
            <p
              className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger sm:col-span-12"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {lastInviteUrl ? (
            <p
              className="rounded-md border border-border-subtle bg-surface-overlay px-3 py-2 text-xs text-text-secondary sm:col-span-12"
              role="status"
            >
              {t("invitations.invite.inviteLinkLabel")}{" "}
              <code className="break-all font-mono text-text-primary">{lastInviteUrl}</code>
            </p>
          ) : null}

          <div className="sm:col-span-12">
            <button
              type="submit"
              disabled={create.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              <Plus size={16} strokeWidth={1.75} />{" "}
              {create.isPending ? t("invitations.invite.submitting") : t("invitations.invite.submit")}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("invitations.pending.title")}</h2>
        {invitations.isPending ? (
          <p className="mt-3 text-sm text-text-tertiary">{t("invitations.pending.loading")}</p>
        ) : invitations.isError ? (
          <p className="mt-3 text-sm text-danger">{t("invitations.pending.error")}</p>
        ) : invitations.data.items.length === 0 ? (
          <p className="mt-3 text-sm text-text-tertiary">{t("invitations.pending.empty")}</p>
        ) : (
          <table className="mt-4 w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
                <th className="py-2 font-medium">{t("invitations.pending.table.email")}</th>
                <th className="py-2 font-medium">{t("invitations.pending.table.role")}</th>
                <th className="py-2 font-medium">{t("invitations.pending.table.team")}</th>
                <th className="py-2 font-medium">{t("invitations.pending.table.canInvite")}</th>
                <th className="py-2 font-medium">{t("invitations.pending.table.expires")}</th>
                <th className="py-2 text-right font-medium">
                  {t("invitations.pending.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.data.items.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  invitation={inv}
                  teamName={teamItems.find((team) => team.id === inv.team_id)?.name ?? "—"}
                  onRevoke={() => void onRevoke(inv)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function InvitationRow({
  invitation,
  teamName,
  onRevoke,
}: {
  invitation: InvitationOut;
  teamName: string;
  onRevoke: () => void;
}) {
  const { t } = useTranslation("settings");
  const locale = useLocale();
  const expires = formatDate(invitation.expires_at, locale, { dateStyle: "medium" });
  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="py-3 text-sm text-text-primary">{invitation.email}</td>
      <td className="py-3 text-sm text-text-secondary">
        {invitation.role in ROLE_LABEL_KEY
          ? t(ROLE_LABEL_KEY[invitation.role]!)
          : invitation.role}
      </td>
      <td className="py-3 text-sm text-text-secondary">{teamName}</td>
      <td className="py-3 text-sm text-text-secondary">
        {invitation.can_invite ? t("invitations.pending.canInviteYes") : t("invitations.pending.canInviteNo")}
      </td>
      <td className="py-3 text-sm text-text-tertiary">{expires}</td>
      <td className="py-3 text-right">
        <button
          type="button"
          onClick={onRevoke}
          aria-label={t("invitations.pending.revokeAriaLabel", { email: invitation.email })}
          className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  );
}
