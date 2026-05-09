import { useMemo } from "react";

import { useOrgTeams, useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { cn } from "@/lib/utils";

import {
  PRESET_LABEL,
  type RangePreset,
  VISIBLE_PRESETS,
  resolvePreset,
} from "@/app/reports/dashboard/dateRange";
import type { GlobalFilters } from "@/app/reports/dashboard/types";

interface GlobalFilterBarProps {
  value: GlobalFilters;
  onChange: (next: GlobalFilters) => void;
}

/**
 * Sticky header above the widget grid. Three controls — date range
 * preset (segmented), team dropdown, owner dropdown. Per
 * REPORTS_TASK §5.1.
 *
 * Permission rules:
 *  - Admin: all teams, all reps.
 *  - Manager: team selector limited to teams they manage; rep
 *    selector limited to members of their managed teams (or, when no
 *    team is selected, every rep across those teams).
 *
 * The team and owner option lists come from the existing org
 * endpoints (`/api/v1/teams`, `/api/v1/users`); we lift those queries
 * into this component so the widget grid below stays a pure consumer
 * of `globalFilters`.
 */
export function GlobalFilterBar({ value, onChange }: GlobalFilterBarProps) {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const isManager = me?.role === "manager";

  const teams = useOrgTeams();
  const users = useOrgUsers();

  const presets = useMemo(() => VISIBLE_PRESETS, []);

  // Resolve the picked preset (or custom window) into the absolute
  // date pair every widget will see, so we can echo it next to the
  // segmented control. Format: "5. 4. – 4. 5. 2026".
  const resolvedRange = useMemo(() => {
    if (!value.dateRange) return null;
    try {
      const { from, to } = resolvePreset(value.dateRange);
      const fmt = new Intl.DateTimeFormat("cs-CZ", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      });
      return `${fmt.format(new Date(from))} – ${fmt.format(new Date(to))}`;
    } catch {
      return null;
    }
  }, [value.dateRange]);

  // Teams the current user can scope by. Admins see every team; a
  // manager sees only the teams they manage (a single user can manage
  // multiple). If a manager manages exactly zero teams the dropdown
  // hides — there's no useful filter to expose.
  const visibleTeams = useMemo(() => {
    const all = teams.data?.items ?? [];
    if (isAdmin) return all;
    if (isManager && me) {
      return all.filter((t) => t.manager_user_id === me.id);
    }
    return [];
  }, [teams.data, isAdmin, isManager, me]);

  // Owner options follow the team-scope: when a team is picked, only
  // its members; otherwise all reps the caller can see.
  const visibleOwners = useMemo(() => {
    const all = users.data?.items ?? [];
    const inScope = isAdmin
      ? all
      : isManager && me
        ? all.filter((u) => {
            // A manager sees themselves + any user assigned to one of
            // their managed teams.
            if (u.id === me.id) return true;
            return visibleTeams.some((t) => t.id === u.team_id);
          })
        : all.filter((u) => u.id === me?.id);
    if (value.teamId) {
      return inScope.filter((u) => u.team_id === value.teamId);
    }
    return inScope;
  }, [users.data, isAdmin, isManager, me, visibleTeams, value.teamId]);

  function setPreset(preset: RangePreset) {
    onChange({
      ...value,
      dateRange: { preset, from: null, to: null },
    });
  }

  function setTeam(teamId: string | null) {
    // Clearing team also clears owner if the current owner isn't in
    // the new scope; otherwise leave it.
    let nextOwner = value.ownerUserId ?? null;
    if (nextOwner) {
      const stillVisible = (users.data?.items ?? []).find(
        (u) => u.id === nextOwner && (!teamId || u.team_id === teamId),
      );
      if (!stillVisible) nextOwner = null;
    }
    onChange({ ...value, teamId, ownerUserId: nextOwner });
  }

  function setOwner(ownerUserId: string | null) {
    onChange({ ...value, ownerUserId });
  }

  return (
    <div
      className="bg-bg/90 sticky top-0 z-10 -mx-4 border-b border-border px-4 py-3 backdrop-blur md:-mx-8 md:px-8"
      role="toolbar"
      aria-label="Filtry reportů"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Časové období" className="flex flex-wrap gap-1">
          {presets.map((preset) => {
            const active = value.dateRange?.preset === preset;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreset(preset)}
                className={cn(
                  "h-8 rounded-md border px-3 text-xs font-medium transition-colors duration-fast",
                  active
                    ? "border-accent bg-accent text-text-on-accent"
                    : "border-border bg-surface text-text-secondary hover:bg-surface-overlay",
                )}
              >
                {PRESET_LABEL[preset]}
              </button>
            );
          })}
        </div>
        {resolvedRange ? (
          <span className="text-xs tabular-nums text-text-tertiary" aria-label="Vybrané období">
            {resolvedRange}
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {visibleTeams.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-text-tertiary">
              <span className="sr-only">Tým</span>
              <select
                value={value.teamId ?? ""}
                onChange={(e) => setTeam(e.target.value || null)}
                className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text-primary"
                aria-label="Tým"
              >
                <option value="">{isAdmin ? "Všechny týmy" : "Všechny moje týmy"}</option>
                {visibleTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="sr-only">Obchodník</span>
            <select
              value={value.ownerUserId ?? ""}
              onChange={(e) => setOwner(e.target.value || null)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text-primary"
              aria-label="Obchodník"
            >
              <option value="">Všichni obchodníci</option>
              {visibleOwners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
