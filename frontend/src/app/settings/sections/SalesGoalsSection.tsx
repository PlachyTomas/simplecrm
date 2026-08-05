/**
 * Settings → Prodejní cíle. One screen, no wizard: the current month's goals
 * with inline create/edit/delete.
 *
 * Each row shows live progress, computed server-side from the same "won this
 * month" definition the `deals_won` report uses — so this list and the
 * dashboard widget can never disagree.
 */

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  firstOfMonth,
  formatGoalAmount,
  useCreateSalesGoal,
  useDeleteSalesGoal,
  useSalesGoals,
  useUpdateSalesGoal,
  type SalesGoal,
  type SalesGoalMetric,
} from "@/app/goals/useSalesGoals";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";
import { cn } from "@/lib/utils";

const inputClass =
  "mt-1 block w-full rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent focus:outline-none";

/** Create/edit dialog. `goal` null = create. */
function GoalEditor({ goal, onClose }: { goal: SalesGoal | null; onClose: () => void }) {
  const { t } = useTranslation("settings");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose);
  const create = useCreateSalesGoal();
  const update = useUpdateSalesGoal();
  const { data: usersPage } = useOrgUsers();
  const [userId, setUserId] = useState<string>(goal?.user_id ?? "");
  const [metric, setMetric] = useState<SalesGoalMetric>(goal?.metric ?? "won_value");
  const [target, setTarget] = useState<string>(goal ? String(Number(goal.target_value)) : "");
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const amount = Number(target);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("salesGoals.errors.required"));
      return;
    }
    const body = {
      user_id: userId || null,
      period_month: goal?.period_month ?? firstOfMonth(),
      metric,
      target_value: String(amount),
    };
    try {
      if (goal) await update.mutateAsync({ id: goal.id, body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t("salesGoals.errors.duplicate")
          : t("salesGoals.errors.generic"),
      );
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sales-goal-editor-title"
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-bg/80 px-4 py-6 backdrop-blur-sm sm:py-10"
    >
      <form
        onSubmit={onSubmit}
        className="my-auto w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h3 id="sales-goal-editor-title" className="text-lg font-semibold text-text-primary">
          {goal ? t("salesGoals.editor.editTitle") : t("salesGoals.editor.newTitle")}
        </h3>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("salesGoals.editor.userLabel")}
            </span>
            <select
              className={inputClass}
              value={userId}
              data-testid={testIds.settings.salesGoals.userSelect}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">{t("salesGoals.wholeCompany")}</option>
              {(usersPage?.items ?? [])
                .filter((u) => u.is_active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("salesGoals.editor.metricLabel")}
            </span>
            <select
              className={inputClass}
              value={metric}
              data-testid={testIds.settings.salesGoals.metricSelect}
              onChange={(e) => setMetric(e.target.value as SalesGoalMetric)}
            >
              <option value="won_value">{t("salesGoals.metric.won_value")}</option>
              <option value="won_count">{t("salesGoals.metric.won_count")}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("salesGoals.editor.targetLabel")}
            </span>
            <input
              type="number"
              min={0}
              step="any"
              className={`${inputClass} tabular-nums`}
              value={target}
              data-testid={testIds.settings.salesGoals.targetInput}
              onChange={(e) => setTarget(e.target.value)}
              autoFocus
            />
          </label>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            data-testid={testIds.settings.salesGoals.cancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("salesGoals.editor.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            data-testid={testIds.settings.salesGoals.save}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("salesGoals.editor.saving") : t("salesGoals.editor.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function SalesGoalsSection() {
  const { t } = useTranslation("settings");
  const locale = useLocale();
  const { data: user } = useCurrentUser();
  const month = firstOfMonth();
  const list = useSalesGoals(month);
  const del = useDeleteSalesGoal();
  // Matches the backend gate (`require_role(UserRole.manager)`): everyone
  // reads, admins and managers write.
  const canManage = user?.role === "admin" || user?.role === "manager";
  const [editing, setEditing] = useState<SalesGoal | null>(null);
  const [creating, setCreating] = useState(false);

  const items = list.data?.items ?? [];
  const goalName = (g: SalesGoal) => g.user_name ?? t("salesGoals.wholeCompany");

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("salesGoals.title")}</h2>
          <p className="mt-1 text-sm text-text-tertiary">{t("salesGoals.subtitle")}</p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            data-testid={testIds.settings.salesGoals.add}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            {t("salesGoals.addButton")}
          </button>
        ) : (
          <p className="text-xs text-text-tertiary">{t("salesGoals.readOnlyNote")}</p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {list.isPending ? (
          <p className="text-sm text-text-tertiary">{t("salesGoals.loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("salesGoals.empty")}</p>
        ) : (
          items.map((g) => {
            const pct = Math.round(g.progress_pct);
            return (
              <div
                key={g.id}
                data-testid={testIds.settings.salesGoals.row(g.id)}
                className="flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{goalName(g)}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {t(`salesGoals.metric.${g.metric}`)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-text-tertiary">
                    {t("salesGoals.progress", {
                      actual: formatGoalAmount(g.actual_value, g.metric, g.currency, locale),
                      target: formatGoalAmount(g.target_value, g.metric, g.currency, locale),
                    })}{" "}
                    ·{" "}
                    <span className={cn(pct >= 100 && "font-medium text-success")}>
                      {t("salesGoals.progressPct", { pct: formatNumber(pct, locale) })}
                    </span>
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(g)}
                      data-testid={testIds.settings.salesGoals.edit(g.id)}
                      aria-label={t("salesGoals.editAriaLabel", { name: goalName(g) })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-elevated hover:text-text-primary"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t("salesGoals.deleteConfirm", { name: goalName(g) }))) {
                          del.mutate(g.id);
                        }
                      }}
                      data-testid={testIds.settings.salesGoals.remove(g.id)}
                      aria-label={t("salesGoals.deleteAriaLabel", { name: goalName(g) })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-danger-subtle hover:text-danger"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {creating || editing ? (
        <GoalEditor
          goal={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
