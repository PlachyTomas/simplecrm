import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type TeamOut,
  type UserOut,
  useCreateTeam,
  useDeleteTeam,
  useOrgTeams,
  useOrgUsers,
  useUpdateTeam,
} from "@/app/settings/useUsersTeams";
import { ApiError } from "@/lib/api";

function managerOptions(users: UserOut[]) {
  return users.filter((u) => u.role === "admin" || u.role === "manager");
}

function TeamRow({
  team,
  users,
  onSave,
  onDelete,
}: {
  team: TeamOut;
  users: UserOut[];
  onSave: (patch: { name: string; manager_user_id: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [name, setName] = useState(team.name);
  const [managerId, setManagerId] = useState(team.manager_user_id ?? "");
  const dirty = name.trim() !== team.name || managerId !== (team.manager_user_id ?? "");

  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="py-3 pr-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
        />
      </td>
      <td className="py-3 pr-3">
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="">{t("teams.noManagerOption")}</option>
          {managerOptions(users).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={!dirty}
            onClick={() =>
              void onSave({
                name: name.trim(),
                manager_user_id: managerId === "" ? null : managerId,
              })
            }
            className="text-accent-foreground rounded-md bg-accent px-3 py-1 text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {t("teams.saveButton")}
          </button>
          <button
            type="button"
            aria-label={t("teams.deleteAriaLabel", { name: team.name })}
            onClick={() => void onDelete()}
            className="rounded-md p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger"
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function TeamsSection() {
  const { t } = useTranslation("settings");
  const teams = useOrgTeams();
  const users = useOrgUsers();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const [newName, setNewName] = useState("");
  const [newManagerId, setNewManagerId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      await createTeam.mutateAsync({
        name: newName.trim(),
        manager_user_id: newManagerId === "" ? null : newManagerId,
      });
      setNewName("");
      setNewManagerId("");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.body) : t("teams.createError"));
    }
  }

  async function handleDelete(team: TeamOut) {
    if (!window.confirm(t("teams.deleteConfirm", { name: team.name }))) return;
    setError(null);
    try {
      await deleteTeam.mutateAsync(team.id);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.body) : t("teams.deleteError"));
    }
  }

  async function handleSave(
    team: TeamOut,
    patch: { name: string; manager_user_id: string | null },
  ) {
    setError(null);
    try {
      await updateTeam.mutateAsync({ id: team.id, patch });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.body) : t("teams.saveError"));
    }
  }

  if (teams.isPending || users.isPending) {
    return <p className="text-sm text-text-tertiary">{t("teams.loading")}</p>;
  }
  if (teams.isError || users.isError || !teams.data || !users.data) {
    return <p className="text-sm text-danger">{t("teams.errorLoad")}</p>;
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("teams.title")}</h2>
      <p className="mt-1 text-sm text-text-tertiary">{t("teams.subtitle")}</p>

      {error ? (
        <p
          className="mt-3 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-12">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("teams.namePlaceholder")}
          required
          maxLength={120}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm sm:col-span-5"
        />
        <select
          value={newManagerId}
          onChange={(e) => setNewManagerId(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm sm:col-span-5"
        >
          <option value="">{t("teams.noManagerOption")}</option>
          {managerOptions(users.data.items).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={createTeam.isPending}
          className="text-accent-foreground inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium hover:bg-accent-hover disabled:opacity-50 sm:col-span-2"
        >
          <Plus size={14} strokeWidth={1.75} /> {t("teams.addButton")}
        </button>
      </form>

      <table className="mt-4 w-full">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
            <th className="py-2 font-medium">{t("teams.table.name")}</th>
            <th className="py-2 font-medium">{t("teams.table.manager")}</th>
            <th className="py-2 text-right font-medium">{t("teams.table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {teams.data.items.map((team) => (
            <TeamRow
              key={team.id}
              team={team}
              users={users.data.items}
              onSave={(patch) => handleSave(team, patch)}
              onDelete={() => handleDelete(team)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
