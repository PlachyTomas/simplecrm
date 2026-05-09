import { Crown, Handshake, Target, Trophy, Workflow } from "lucide-react";
import { useMemo } from "react";

import { type KpiSummary, useKpiSummary } from "@/app/dashboard/useKpi";
import { useLeaderboard, useVelocity } from "@/app/reports/useReports";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { KpiCard } from "@/components/ui/KpiCard";
import { usePageTitle } from "@/lib/usePageTitle";

/**
 * Extract a friendly first name. The backend's `user.name` is "first last"
 * for Google OAuth signups; the email local-part is the fallback when
 * `name` is empty. Splitting on whitespace handles both cases without
 * showing the role or domain.
 */
function firstName(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const [head] = trimmed.split(/\s+/);
    if (head) return head;
  }
  const local = email.split("@")[0] ?? "";
  return local || "uživateli";
}

function formatMoney(value: string, currency: string, locale: string): string {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${numeric.toLocaleString(locale)} ${currency}`;
  }
}

function ManagerWidgets({ locale }: { locale: string }) {
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
    <section aria-label="Manažerský přehled" className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <article className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            Leaderboard (30 dní)
          </h2>
        </div>
        {leaderboard.isPending ? (
          <p className="mt-4 text-sm text-text-tertiary">Načítání…</p>
        ) : leaderboard.isError || !leaderboard.data ? (
          <p className="mt-4 text-sm text-danger">Nelze načíst.</p>
        ) : leaderboard.data.rows.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">
            Žádné vyhrané obchody za posledních 30 dní.
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {leaderboard.data.rows.slice(0, 5).map((row, idx) => (
              <li key={row.user_id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-primary">
                  {idx === 0 ? (
                    <span
                      aria-label="Vedoucí leaderboardu"
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
          Průměrné trvání obchodu (30 dní)
        </h2>
        {velocity.isPending ? (
          <p className="mt-4 text-sm text-text-tertiary">Načítání…</p>
        ) : velocity.isError || !velocity.data ? (
          <p className="mt-4 text-sm text-danger">Nelze načíst.</p>
        ) : velocity.data.stages.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">
            Za posledních 30 dní nebyl uzavřen žádný obchod.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {velocity.data.stages.map((stage) => (
              <li key={stage.stage_id} className="flex items-center justify-between text-sm">
                <span className="text-text-primary">{stage.stage_name}</span>
                <span className="tabular-nums text-text-secondary">
                  {stage.avg_days_in_stage == null
                    ? "—"
                    : `${(Math.round(stage.avg_days_in_stage * 10) / 10).toFixed(1)} dní`}{" "}
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
  usePageTitle("Přehled");
  const { data: user } = useCurrentUser();
  const { data: kpi, isPending, isError } = useKpiSummary();

  const locale = user?.organization?.locale ?? "cs-CZ";
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
        Načítání přehledu…
      </div>
    );
  }

  if (isError || !kpi) {
    return (
      <div
        className="m-4 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger md:m-8"
        role="alert"
      >
        Přehled KPI se nepodařilo načíst.
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Vítejte zpět, {firstName(user.name, user.email)}</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Rychlý přehled za {monthLabel.toLowerCase() || "tento měsíc"}.
        </p>
      </header>

      <section
        aria-label="Klíčové ukazatele"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label="Otevřené obchody"
          value={String(kpi.open_deal_count)}
          icon={Handshake}
          hint="V probíhající pipeline"
        />
        <KpiCard
          label="Hodnota pipeline"
          value={formatMoney(kpi.open_pipeline_value, kpi.currency, locale)}
          icon={Workflow}
          hint="Součet otevřených obchodů"
        />
        <KpiCard
          label="Vyhráno tento měsíc"
          value={String(kpi.won_this_month_count)}
          icon={Target}
          hint="Počet uzavřených obchodů"
        />
        <KpiCard
          label="Výnosy tento měsíc"
          value={formatMoney(kpi.won_this_month_value, kpi.currency, locale)}
          icon={Trophy}
          accent="highlight"
          hint="Součet vyhraných obchodů"
        />
      </section>

      {user.role === "admin" ||
      user.role === "manager" ||
      user.organization?.show_leaderboard_to_salespeople ? (
        <ManagerWidgets locale={locale} />
      ) : null}
    </div>
  );
}

export type { KpiSummary };
