/**
 * `sales_goal` — this month's progress toward a sales goal.
 *
 * Deliberately not date-filtered: a goal is a monthly commitment, so the
 * dashboard's global range doesn't apply and the widget always reads the
 * current month. That is also why it doesn't go through `useWidgetQuery` —
 * it reads `/api/v1/sales-goals`, the same endpoint the settings list uses,
 * so the two can never show different numbers. (The `/reports/widgets/*`
 * endpoints are manager-gated; a salesperson has to be able to see their own
 * target.)
 *
 * Colour: indigo while the goal is in progress, magenta at ≥100% — the brand
 * accent is reserved for genuine win moments, and hitting the month's number
 * is one.
 */

import { Target } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { formatGoalAmount, useSalesGoals, type SalesGoal } from "@/app/goals/useSalesGoals";
import { useCurrentUser } from "@/auth/useCurrentUser";
import {
  WidgetError,
  WidgetFrame,
  WidgetSkeleton,
} from "@/components/widget-dashboard/WidgetFrame";
import {
  type GlobalFilters,
  type WidgetEntry,
  WIDGET_LABEL_KEY,
} from "@/app/reports/dashboard/types";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

type Config = components["schemas"]["WidgetEntry"]["config"];

interface Props {
  entry: WidgetEntry;
  globalFilters: GlobalFilters;
  isEditMode: boolean;
  onRemove: () => void;
  onConfigClick?: () => void;
}

function narrowConfig(config: Config): Extract<Config, { type: "sales_goal" }> {
  if (config.type !== "sales_goal") {
    throw new Error(`widget config type mismatch: expected sales_goal, got ${config.type}`);
  }
  return config;
}

export function SalesGoalWidget(props: Props) {
  const config = narrowConfig(props.entry.config);
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const { data: user } = useCurrentUser();
  const q = useSalesGoals();

  const label = t(WIDGET_LABEL_KEY.sales_goal);

  // Pick the goal this tile follows. `scope` selects whose goal it is (a
  // salesperson's list only ever contains their own goals plus org-wide
  // ones, so this is a display choice, not an access control). `metric` is a
  // *tie-breaker*, not a filter: with one goal in scope the tile shows it
  // whatever its metric, so a widget added with the default config never
  // lands on an empty state next to a goal that plainly exists.
  const inScope = (q.data?.items ?? []).filter((g) =>
    config.scope === "organization" ? g.user_id === null : g.user_id === user?.id,
  );
  const goal: SalesGoal | undefined = inScope.find((g) => g.metric === config.metric) ?? inScope[0];

  return (
    <WidgetFrame
      label={label}
      isEditMode={props.isEditMode}
      onRemove={props.onRemove}
      onConfigClick={props.onConfigClick}
    >
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : !goal ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <Target size={20} strokeWidth={1.75} aria-hidden className="text-text-tertiary" />
          <p className="text-sm text-text-tertiary">{t("salesGoal.empty")}</p>
          <Link
            to="/app/settings/sales-goals"
            className="text-sm font-medium text-accent hover:underline"
          >
            {t("salesGoal.emptyCta")}
          </Link>
        </div>
      ) : (
        <GoalBody goal={goal} locale={locale} />
      )}
    </WidgetFrame>
  );
}

function GoalBody({ goal, locale }: { goal: SalesGoal; locale: string }) {
  const { t } = useTranslation("reports");
  const pct = Math.max(0, goal.progress_pct);
  const hit = pct >= 100;
  const actual = formatGoalAmount(goal.actual_value, goal.metric, goal.currency, locale);
  const target = formatGoalAmount(goal.target_value, goal.metric, goal.currency, locale);

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <p className="text-xs text-text-tertiary">
        {goal.user_name ?? t("salesGoal.scopeOrganization")} ·{" "}
        {t(`salesGoal.metric.${goal.metric}`)}
      </p>
      <p
        className={cn(
          "font-mono text-3xl font-semibold tabular-nums leading-none",
          hit ? "text-brand-accent" : "text-text-primary",
        )}
      >
        {actual}
      </p>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t(WIDGET_LABEL_KEY.sales_goal)}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-slow",
            hit ? "bg-brand-accent" : "bg-accent",
          )}
          // Cap the bar at 100% — the number above already tells the
          // over-achievement story, a bar past its track just looks broken.
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="text-xs tabular-nums text-text-secondary">
        {formatNumber(Math.round(pct), locale)} % {t("salesGoal.ofTarget")} ·{" "}
        <span className="text-text-tertiary">
          {t("salesGoal.targetLabel")} {target}
        </span>
      </p>
    </div>
  );
}
