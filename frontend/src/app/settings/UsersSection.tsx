import { useState } from "react";

import {
  type UserOut,
  useOrgTeams,
  useOrgUsers,
  useUpdateUser,
} from "@/app/settings/useUsersTeams";
import { ApiError } from "@/lib/api";

type Role = "admin" | "manager" | "salesperson";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrátor",
  manager: "Manažer",
  salesperson: "Obchodník",
};

function UserRow({
  u,
  teams,
  managedTeams,
  onRoleChange,
  onTeamChange,
  onCanInviteChange,
  onToggleActive,
}: {
  u: UserOut;
  teams: { id: string; name: string }[];
  managedTeams: { id: string; name: string }[];
  onRoleChange: (role: Role) => Promise<void>;
  onTeamChange: (teamId: string | null) => Promise<void>;
  onCanInviteChange: (next: boolean) => Promise<void>;
  onToggleActive: () => Promise<void>;
}) {
  // Admins always implicitly can invite — show the box as locked-on for them.
  const isAdmin = u.role === "admin";
  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="py-3 text-sm text-text-primary">
        <div className="font-medium">{u.name}</div>
        <div className="text-xs text-text-tertiary">{u.email}</div>
      </td>
      <td className="py-3">
        <select
          value={u.role}
          onChange={(e) => void onRoleChange(e.target.value as Role)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="admin">{ROLE_LABEL.admin}</option>
          <option value="manager">{ROLE_LABEL.manager}</option>
          <option value="salesperson">{ROLE_LABEL.salesperson}</option>
        </select>
      </td>
      <td className="py-3">
        {managedTeams.length > 0 ? (
          <span
            className="inline-flex items-center rounded-md border border-border-subtle bg-surface-overlay px-2 py-1 text-xs text-text-secondary"
            title="Tento uživatel je manažerem těchto týmů. Pro změnu otevřete kartu Týmy."
          >
            Manažer týmu {managedTeams.map((t) => t.name).join(", ")}
          </span>
        ) : (
          <select
            value={u.team_id ?? ""}
            onChange={(e) =>
              void onTeamChange(e.target.value === "" ? null : e.target.value)
            }
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
          >
            <option value="">— bez týmu —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="py-3 text-center">
        <input
          type="checkbox"
          aria-label={`Smí zvát uživatele — ${u.email}`}
          checked={isAdmin || u.can_invite}
          disabled={isAdmin}
          onChange={(e) => void onCanInviteChange(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
          title={
            isAdmin
              ? "Administrátor může zvát vždy."
              : "Když je zaškrtnuto, smí tento uživatel posílat pozvánky."
          }
        />
      </td>
      <td className="py-3 text-right">
        <button
          type="button"
          onClick={() => void onToggleActive()}
          className={`rounded-md border px-2 py-1 text-xs font-medium ${
            u.is_active
              ? "border-border text-text-secondary hover:text-text-primary"
              : "border-danger-subtle bg-danger-subtle text-danger"
          }`}
        >
          {u.is_active ? "Aktivní" : "Deaktivovaný"}
        </button>
      </td>
    </tr>
  );
}

export function UsersSection() {
  const users = useOrgUsers();
  const teams = useOrgTeams();
  const update = useUpdateUser();
  const [error, setError] = useState<string | null>(null);

  async function mutate(id: string, patch: Parameters<typeof update.mutateAsync>[0]["patch"]) {
    setError(null);
    try {
      await update.mutateAsync({ id, patch });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(String((err.body as { detail?: unknown })?.detail ?? err.message));
      } else {
        setError(err instanceof Error ? err.message : "Aktualizace selhala.");
      }
    }
  }

  if (users.isPending || teams.isPending) {
    return <p className="text-sm text-text-tertiary">Načítání…</p>;
  }
  if (users.isError || !users.data) {
    return <p className="text-sm text-danger">Seznam uživatelů se nepodařilo načíst.</p>;
  }

  const teamOptions = (teams.data?.items ?? []).map((t) => ({ id: t.id, name: t.name }));
  const managedTeamsByUserId = new Map<string, { id: string; name: string }[]>();
  for (const t of teams.data?.items ?? []) {
    if (!t.manager_user_id) continue;
    const list = managedTeamsByUserId.get(t.manager_user_id) ?? [];
    list.push({ id: t.id, name: t.name });
    managedTeamsByUserId.set(t.manager_user_id, list);
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Uživatelé</h2>
      <p className="mt-1 text-sm text-text-tertiary">
        Spravujte role, týmovou příslušnost a aktivitu členů vaší organizace.
      </p>
      {error ? (
        <p
          className="mt-3 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <table className="mt-4 w-full">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
            <th className="py-2 font-medium">Jméno / email</th>
            <th className="py-2 font-medium">Role</th>
            <th className="py-2 font-medium">Tým</th>
            <th className="py-2 text-center font-medium">Smí zvát</th>
            <th className="py-2 text-right font-medium">Aktivní</th>
          </tr>
        </thead>
        <tbody>
          {users.data.items.map((u) => (
            <UserRow
              key={u.id}
              u={u}
              teams={teamOptions}
              managedTeams={managedTeamsByUserId.get(u.id) ?? []}
              onRoleChange={(role) => mutate(u.id, { role })}
              onTeamChange={(teamId) => mutate(u.id, { team_id: teamId })}
              onCanInviteChange={(can_invite) => mutate(u.id, { can_invite })}
              onToggleActive={() => mutate(u.id, { is_active: !u.is_active })}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
