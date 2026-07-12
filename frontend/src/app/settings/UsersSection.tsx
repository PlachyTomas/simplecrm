import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRef, useState } from "react";

import {
  type UserOut,
  useOrgTeams,
  useOrgUsers,
  useUpdateUser,
} from "@/app/settings/useUsersTeams";
import { useAuth } from "@/auth/useAuth";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";

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
  scheduledDeactivationDate,
  onRoleChange,
  onTeamChange,
  onCanInviteChange,
  onToggleActive,
  onCapChange,
  onCancelScheduledDeactivation,
}: {
  u: UserOut;
  teams: { id: string; name: string }[];
  managedTeams: { id: string; name: string }[];
  /** When set, this user is in the queued downsize list — render the pill. */
  scheduledDeactivationDate: string | null;
  onRoleChange: (role: Role) => Promise<void>;
  onTeamChange: (teamId: string | null) => Promise<void>;
  onCanInviteChange: (next: boolean) => Promise<void>;
  onToggleActive: () => Promise<void>;
  onCapChange: (next: number | null) => Promise<void>;
  onCancelScheduledDeactivation: () => void;
}) {
  // Local string state so the input can be empty while editing without
  // immediately firing a PATCH. We commit on blur.
  const [capDraft, setCapDraft] = useState<string>(
    u.max_owned_companies != null ? String(u.max_owned_companies) : "",
  );
  // Re-sync from server data when it changes (e.g., after a successful
  // PATCH or a polling refresh).
  const lastSyncedCapRef = useRef<number | null | undefined>(u.max_owned_companies);
  if (lastSyncedCapRef.current !== u.max_owned_companies) {
    lastSyncedCapRef.current = u.max_owned_companies;
    if ((u.max_owned_companies ?? null) !== (capDraft === "" ? null : Number(capDraft))) {
      setCapDraft(u.max_owned_companies != null ? String(u.max_owned_companies) : "");
    }
  }
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
            onChange={(e) => void onTeamChange(e.target.value === "" ? null : e.target.value)}
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
      <td className="py-3 text-center">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={`Limit firem — ${u.email}`}
          placeholder="∞"
          value={capDraft}
          onChange={(e) => setCapDraft(e.target.value)}
          onBlur={() => {
            const trimmed = capDraft.trim();
            const next = trimmed === "" ? null : Number(trimmed);
            // Reject NaN / negative numbers without committing.
            if (next != null && (!Number.isFinite(next) || next < 0)) {
              setCapDraft(u.max_owned_companies != null ? String(u.max_owned_companies) : "");
              return;
            }
            if (next === (u.max_owned_companies ?? null)) return;
            void onCapChange(next);
          }}
          className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-center text-sm tabular-nums"
          title="Maximální počet firem, které tento uživatel může současně vlastnit. Prázdné = bez limitu."
        />
      </td>
      <td className="py-3 text-right">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => {
              // Deactivating revokes the member's login immediately — confirm
              // first so a stray click doesn't lock a colleague out (review UX
              // P1). Reactivating is harmless and needs no confirm.
              if (
                u.is_active &&
                !window.confirm(
                  `Opravdu deaktivovat uživatele ${u.name}? Okamžitě ztratí přístup do aplikace.`,
                )
              ) {
                return;
              }
              void onToggleActive();
            }}
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              u.is_active
                ? "border-border text-text-secondary hover:text-text-primary"
                : "border-danger-subtle bg-danger-subtle text-danger"
            }`}
          >
            {u.is_active ? "Aktivní" : "Deaktivovaný"}
          </button>
          {scheduledDeactivationDate ? (
            <span
              data-testid={`scheduled-deactivation-${u.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-subtle px-2 py-0.5 text-[11px] font-medium text-warning"
              title={`Tento uživatel ztratí přístup ${scheduledDeactivationDate}.`}
            >
              <span>Deaktivace naplánovaná na {scheduledDeactivationDate}</span>
              <button
                type="button"
                onClick={onCancelScheduledDeactivation}
                aria-label="Zrušit naplánovanou deaktivaci"
                className="-mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-warning/20"
              >
                <X size={10} strokeWidth={2.5} aria-hidden />
              </button>
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function UsersSection() {
  const users = useOrgUsers();
  const teams = useOrgTeams();
  const update = useUpdateUser();
  const subQuery = useCurrentSubscription();
  const sub = subQuery.data;
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);

  // Map of queued user IDs → formatted "DD.MM.RR" date so each row can
  // render the scheduled-deactivation pill without duplicating the math.
  const queuedSet = new Set(sub?.pending_user_deactivations ?? []);
  const scheduledDate = sub?.current_period_ends_at
    ? formatDate(sub.current_period_ends_at, locale, { dateStyle: "short" })
    : null;

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

  function cancelQueueWithConfirm() {
    if (!sub) return;
    const ok = window.confirm("Tím zrušíte celou naplánovanou změnu počtu uživatelů. Pokračovat?");
    if (!ok) return;
    setError(null);
    void apiFetch("/api/v1/organizations/current/subscription/seat-count", {
      method: "PUT",
      token: accessToken,
      body: { seat_count: sub.seat_count, deactivate_user_ids: [] },
    })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
        void qc.invalidateQueries({ queryKey: ["billing-summary", "current"] });
        void qc.invalidateQueries({ queryKey: ["users", "org"] });
      })
      .catch(() => setError("Zrušení naplánované změny se nezdařilo."));
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
            <th
              className="py-2 text-center font-medium"
              title="Maximální počet firem, které smí mít obchodník současně v držení. Prázdné = bez limitu."
            >
              Limit firem
            </th>
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
              scheduledDeactivationDate={queuedSet.has(u.id) ? scheduledDate : null}
              onRoleChange={(role) => mutate(u.id, { role })}
              onTeamChange={(teamId) => mutate(u.id, { team_id: teamId })}
              onCanInviteChange={(can_invite) => mutate(u.id, { can_invite })}
              onToggleActive={() => mutate(u.id, { is_active: !u.is_active })}
              onCapChange={(max_owned_companies) => mutate(u.id, { max_owned_companies })}
              onCancelScheduledDeactivation={cancelQueueWithConfirm}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
