import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useOrgTeams } from "@/app/settings/useUsersTeams";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { components } from "@/types/api.generated";

type InvitationOut = components["schemas"]["InvitationOut"];
type InvitationCreate = components["schemas"]["InvitationCreate"];
type InvitationCreated = components["schemas"]["InvitationCreated"];
type Page = components["schemas"]["Page_InvitationOut_"];

const INVITES_KEY = ["org", "invitations"] as const;

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrátor",
  manager: "Manažer",
  salesperson: "Obchodník",
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
        <h2 className="text-lg font-semibold">Pozvánky</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Pozvánky může spravovat administrátor nebo uživatel s povolením „Může zvát ostatní“.
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
      setError("Zadejte platnou e-mailovou adresu.");
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
      toast.success(`Pozvánka odeslána na ${result.invitation.email}.`);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: unknown })?.detail;
        if (typeof detail === "string") setError(detail);
        else if (detail && typeof detail === "object" && "detail" in detail)
          setError(String((detail as { detail: unknown }).detail));
        else setError("Vytvoření pozvánky se nezdařilo.");
      } else {
        setError(err instanceof Error ? err.message : "Vytvoření pozvánky se nezdařilo.");
      }
    }
  }

  async function onRevoke(invite: InvitationOut) {
    if (!window.confirm(`Zrušit pozvánku pro ${invite.email}?`)) return;
    try {
      await revoke.mutateAsync(invite.id);
      toast.success("Pozvánka zrušena.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Zrušení pozvánky selhalo.";
      toast.error(msg);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Pozvat uživatele</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Pošleme e-mail s odkazem, kterým se pozvaný přihlásí přes Google a automaticky se zařadí
          do vaší organizace.
        </p>

        <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <label className="text-xs font-medium text-text-tertiary sm:col-span-5">
            E-mail
            <input
              type="email"
              required
              autoComplete="off"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="kolega@firma.cz"
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>

          <label className="text-xs font-medium text-text-tertiary sm:col-span-3">
            Role
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
              <option value="salesperson">{ROLE_LABEL.salesperson}</option>
              <option value="manager">{ROLE_LABEL.manager}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>
          </label>

          <label className="text-xs font-medium text-text-tertiary sm:col-span-4">
            Tým
            <select
              value={draft.team_id}
              onChange={(e) => setDraft((d) => ({ ...d, team_id: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="">— bez týmu —</option>
              {teamItems.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_default ? " (výchozí)" : ""}
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
            Může zvát další uživatele
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
              Odkaz pro přijetí:{" "}
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
              {create.isPending ? "Odesílám…" : "Odeslat pozvánku"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Nevyřízené pozvánky</h2>
        {invitations.isPending ? (
          <p className="mt-3 text-sm text-text-tertiary">Načítání…</p>
        ) : invitations.isError ? (
          <p className="mt-3 text-sm text-danger">Pozvánky se nepodařilo načíst.</p>
        ) : invitations.data.items.length === 0 ? (
          <p className="mt-3 text-sm text-text-tertiary">Žádné nevyřízené pozvánky.</p>
        ) : (
          <table className="mt-4 w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
                <th className="py-2 font-medium">E-mail</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Tým</th>
                <th className="py-2 font-medium">Zve další</th>
                <th className="py-2 font-medium">Vyprší</th>
                <th className="py-2 text-right font-medium">Akce</th>
              </tr>
            </thead>
            <tbody>
              {invitations.data.items.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  invitation={inv}
                  teamName={teamItems.find((t) => t.id === inv.team_id)?.name ?? "—"}
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
  const expires = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(
    new Date(invitation.expires_at),
  );
  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="py-3 text-sm text-text-primary">{invitation.email}</td>
      <td className="py-3 text-sm text-text-secondary">
        {ROLE_LABEL[invitation.role] ?? invitation.role}
      </td>
      <td className="py-3 text-sm text-text-secondary">{teamName}</td>
      <td className="py-3 text-sm text-text-secondary">{invitation.can_invite ? "Ano" : "Ne"}</td>
      <td className="py-3 text-sm text-text-tertiary">{expires}</td>
      <td className="py-3 text-right">
        <button
          type="button"
          onClick={onRevoke}
          aria-label={`Zrušit pozvánku pro ${invitation.email}`}
          className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  );
}
