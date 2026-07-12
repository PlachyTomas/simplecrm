import { Crown, Handshake, Target, Trophy, Workflow } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type KpiSummary, useKpiSummary } from "@/app/dashboard/useKpi";
import { InviteTeammatesCard } from "@/app/dashboard/InviteTeammatesCard";
import { useLeaderboard, useVelocity } from "@/app/reports/useReports";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { KpiCard } from "@/components/ui/KpiCard";
import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { usePageTitle } from "@/lib/usePageTitle";

/**
 * Extract a friendly first name. The backend's `user.name` is "first last"
 * for Google OAuth signups; the email local-part is the fallback when
 * `name` is empty. Splitting on whitespace handles both cases without
 * showing the role or domain.
 */
function firstName(name: string, email: string, fallback: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const [head] = trimmed.split(/\s+/);
    if (head) return head;
  }
  const local = email.split("@")[0] ?? "";
  return local || fallback;
}

function ManagerWidgets({ locale }: { locale: string }) {
  const { t } = useTranslation("dashboard");
  const range = useMemo(() => {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: from.toISOString().slice(0, 10), to };
  }, []);
  const leaderboard = useLeaderboard(range);
  const velocity = useVelocity(range);

  return (
    <section
      aria-label={t("managerWidgets.sectionAriaLabel")}
      className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-2"
    >
      <article className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            {t("managerWidgets.leaderboardTitle")}
          </h2>
        </div>
        {leaderboard.isPending ? (
          <p className="mt-4 text-sm text-text-tertiary">{t("managerWidgets.loading")}</p>
        ) : leaderboard.isError || !leaderboard.data ? (
          <p className="mt-4 text-sm text-danger">{t("managerWidgets.loadError")}</p>
        ) : leaderboard.data.rows.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">{t("managerWidgets.noWonDeals")}</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {leaderboard.data.rows.slice(0, 5).map((row, idx) => (
              <li key={row.user_id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-primary">
                  {idx === 0 ? (
                    <span
                      aria-label={t("managerWidgets.leaderboardLeaderAria")}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-text-on-brand-accent"
                    >
                      <Crown size={11} strokeWidth={2} aria-hidden />
                    </span>
                  ) : (
                    <span className="w-5 text-right tabular-nums text-text-tertiary">
                      {idx + 1}.
                    </span>
                  )}
                  {row.name}
                </span>
                <span className="tabular-nums text-text-secondary">
                  {row.won_count} ·{" "}
                  {(() => {
                    try {
                      return new Intl.NumberFormat(locale, {
                        style: "currency",
                        currency: leaderboard.data.currency,
                        maximumFractionDigits: 0,
                      }).format(Number(row.won_value));
                    } catch {
                      return `${row.won_value} ${leaderboard.data.currency}`;
                    }
                  })()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </article>

      <article className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
          {t("managerWidgets.velocityTitle")}
        </h2>
        {velocity.isPending ? (
          <p className="mt-4 text-sm text-text-tertiary">{t("managerWidgets.loading")}</p>
        ) : velocity.isError || !velocity.data ? (
          <p className="mt-4 text-sm text-danger">{t("managerWidgets.loadError")}</p>
        ) : velocity.data.stages.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">{t("managerWidgets.noClosedDeals")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {velocity.data.stages.map((stage) => (
              <li key={stage.stage_id} className="flex items-center justify-between text-sm">
                <span className="text-text-primary">{stage.stage_name}</span>
                <span className="tabular-nums text-text-secondary">
                  {stage.avg_days_in_stage == null
                    ? "—"
                    : t("managerWidgets.avgDurationDays", {
                        days: (Math.round(stage.avg_days_in_stage * 10) / 10).toFixed(1),
                      })}{" "}
                  · {stage.deal_count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}

export function DashboardPage() {
  const { t } = useTranslation("dashboard");
  usePageTitle(t("dashboardPage.title"));
  const { data: user } = useCurrentUser();
  const { data: kpi, isPending, isError } = useKpiSummary();

  const locale = useLocale();
  const monthLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
        .format(new Date())
        .replace(/^\w/, (c) => c.toUpperCase());
    } catch {
      return "";
    }
  }, [locale]);

  if (isPending || !user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        {t("dashboardPage.loadingSummary")}
      </div>
    );
  }

  if (isError || !kpi) {
    return (
      <div
        className="m-4 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger md:m-8"
        role="alert"
      >
        {t("dashboardPage.summaryLoadError")}
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">
          {t("dashboardPage.welcome", {
            name: firstName(user.name, user.email, t("dashboardPage.userFallback")),
          })}
        </h1>
        <p className="mt-1 text-sm text-text-tertiary">
          {t("dashboardPage.summaryFor", {
            month: monthLabel.toLowerCase() || t("dashboardPage.summaryForFallback"),
          })}
        </p>
      </header>

      <section
        aria-label={t("dashboardPage.kpiSectionAriaLabel")}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label={t("dashboardPage.openDeals")}
          value={String(kpi.open_deal_count)}
          icon={Handshake}
          hint={t("dashboardPage.openDealsHint")}
        />
        <KpiCard
          label={t("dashboardPage.pipelineValue")}
          value={formatMoney(kpi.open_pipeline_value, kpi.currency, locale)}
          icon={Workflow}
          hint={t("dashboardPage.pipelineValueHint")}
        />
        <KpiCard
          label={t("dashboardPage.wonThisMonth")}
          value={String(kpi.won_this_month_count)}
          icon={Target}
          hint={t("dashboardPage.wonThisMonthHint")}
        />
        <KpiCard
          label={t("dashboardPage.revenueThisMonth")}
          value={formatMoney(kpi.won_this_month_value, kpi.currency, locale)}
          icon={Trophy}
          accent="highlight"
          hint={t("dashboardPage.revenueThisMonthHint")}
        />
      </section>

      <InviteTeammatesCard />

      {user.role === "admin" ||
      user.role === "manager" ||
      user.organization?.show_leaderboard_to_salespeople ? (
        <ManagerWidgets locale={locale} />
      ) : null}
    </div>
  );
}

export type { KpiSummary };
