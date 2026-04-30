import {
  Crown,
  Download,
  Gauge,
  Handshake,
  PiggyBank,
  Sprout,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  type Leaderboard,
  type LossReasons,
  type MySummary,
  type TeamLeaderboard,
  type TeamMetric,
  type Velocity,
  buildExportCsvUrl,
  useLeaderboard,
  useLossReasons,
  useMySummary,
  useTeamLeaderboard,
  useVelocity,
} from "@/app/reports/useReports";
import { useOrgTeams } from "@/app/settings/useUsersTeams";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/KpiCard";
import { csNoun } from "@/lib/i18n/nouns";
import { usePageTitle } from "@/lib/usePageTitle";

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 89);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

function formatMoney(value: string | number, currency: string, locale: string): string {
  const numeric = typeof value === "string" ? Number(value) : value;
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

function formatDays(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${(Math.round(value * 10) / 10).toFixed(1)} dní`;
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)} %`;
}

const TEAM_METRIC_LABEL: Record<TeamMetric, string> = {
  won_value: "Hodnota vyhraných",
  won_count: "Počet vyhraných",
  open_pipeline_value: "Hodnota otevřené pipeline",
  conversion_rate: "Konverzní poměr",
  avg_cycle_days: "Průměrný cyklus",
};

function teamMetricValue(
  row: TeamLeaderboard["rows"][number],
  metric: TeamMetric,
): number {
  switch (metric) {
    case "won_value":
      return Number(row.won_value);
    case "won_count":
      return row.won_count;
    case "open_pipeline_value":
      return Number(row.open_pipeline_value);
    case "conversion_rate":
      return row.conversion_rate ?? 0;
    case "avg_cycle_days":
      return row.avg_cycle_days ?? 0;
  }
}

function teamMetricFormat(
  row: TeamLeaderboard["rows"][number],
  metric: TeamMetric,
  currency: string,
  locale: string,
): string {
  switch (metric) {
    case "won_value":
      return formatMoney(row.won_value, currency, locale);
    case "won_count":
      return `${row.won_count} ${csNoun(row.won_count, "obchod")}`;
    case "open_pipeline_value":
      return formatMoney(row.open_pipeline_value, currency, locale);
    case "conversion_rate":
      return formatPercent(row.conversion_rate);
    case "avg_cycle_days":
      return formatDays(row.avg_cycle_days);
  }
}

function TeamLeaderboardSection({
  data,
  metric,
  onMetricChange,
  locale,
}: {
  data: TeamLeaderboard;
  metric: TeamMetric;
  onMetricChange: (metric: TeamMetric) => void;
  locale: string;
}) {
  const values = data.rows.map((r) => teamMetricValue(r, metric));
  const max = values.length ? Math.max(...values, 1) : 1;
  // Avg-cycle is "lower is better" — for the bar chart we invert so the
  // shortest cycle gets the longest bar. The numeric label still shows the
  // raw cycle value.
  const isLowerBetter = metric === "avg_cycle_days";
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Žebříček týmů</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Porovnání týmů za vybrané období.
          </p>
        </div>
        <label className="flex flex-col text-xs font-medium text-text-tertiary">
          Metrika
          <select
            value={metric}
            onChange={(e) => onMetricChange(e.target.value as TeamMetric)}
            className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
          >
            {(Object.keys(TEAM_METRIC_LABEL) as TeamMetric[]).map((key) => (
              <option key={key} value={key}>
                {TEAM_METRIC_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {data.rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="Žádné týmy s daty v tomto období."
            body="Žebříček se objeví, jakmile vaše týmy začnou uzavírat obchody."
          />
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {data.rows.map((row, idx) => {
            const v = teamMetricValue(row, metric);
            const ratio = max > 0 ? Math.abs(v) / max : 0;
            const visualPct = isLowerBetter
              ? Math.max(6, Math.round((1 - ratio) * 100))
              : Math.max(6, Math.round(ratio * 100));
            const highlight = idx === 0;
            return (
              <li key={row.team_id} className="flex items-center gap-4">
                {highlight ? (
                  <span
                    aria-label="Vedoucí žebříčku"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-accent text-text-on-brand-accent"
                  >
                    <Crown size={12} strokeWidth={2} aria-hidden />
                  </span>
                ) : (
                  <span className="w-6 text-right text-sm font-medium text-text-tertiary tabular-nums">
                    {idx + 1}.
                  </span>
                )}
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-text-primary">
                      {row.team_name}
                      {row.manager_name ? (
                        <span className="ml-2 text-xs font-normal text-text-tertiary">
                          {row.manager_name} · {row.member_count}{" "}
                          {csNoun(row.member_count, "člen")}
                        </span>
                      ) : (
                        <span className="ml-2 text-xs font-normal text-text-tertiary">
                          {row.member_count} {csNoun(row.member_count, "člen")}
                        </span>
                      )}
                    </span>
                    <span className="text-sm tabular-nums text-text-secondary">
                      {teamMetricFormat(row, metric, data.currency, locale)}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-full bg-surface-elevated"
                    aria-hidden
                  >
                    <div
                      className={
                        highlight
                          ? "h-full rounded-full bg-brand-accent"
                          : "h-full rounded-full bg-accent"
                      }
                      style={{ width: `${visualPct}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LeaderboardSection({
  data,
  locale,
  teamFilter,
  onTeamFilterChange,
  teamOptions,
}: {
  data: Leaderboard;
  locale: string;
  teamFilter: string;
  onTeamFilterChange: (id: string) => void;
  teamOptions: { id: string; name: string }[];
}) {
  const max = data.rows[0] ? Number(data.rows[0].won_value) || 1 : 1;
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Žebříček obchodníků</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Vítězné obchody obchodníků za vybrané období.
          </p>
        </div>
        {teamOptions.length > 0 ? (
          <label className="flex flex-col text-xs font-medium text-text-tertiary">
            Tým
            <select
              value={teamFilter}
              onChange={(e) => onTeamFilterChange(e.target.value)}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="">Všechny týmy</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {data.rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Trophy}
            title="V tomto období nebyly uzavřeny vítězné obchody."
            body="Až někdo vyhraje obchod, objeví se zde s počtem a celkovou hodnotou."
          />
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {data.rows.map((row, idx) => {
            const pct = Math.max(
              6,
              Math.round((Number(row.won_value) / max) * 100) || 0,
            );
            const highlight = idx === 0;
            return (
              <li key={row.user_id} className="flex items-center gap-4">
                {highlight ? (
                  <span
                    aria-label="Vedoucí leaderboardu"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-accent text-text-on-brand-accent"
                  >
                    <Crown size={12} strokeWidth={2} aria-hidden />
                  </span>
                ) : (
                  <span className="w-6 text-right text-sm font-medium text-text-tertiary tabular-nums">
                    {idx + 1}.
                  </span>
                )}
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-text-primary">{row.name}</span>
                    <span className="text-sm tabular-nums text-text-secondary">
                      {row.won_count} {csNoun(row.won_count, "obchod")} ·{" "}
                      {formatMoney(row.won_value, data.currency, locale)}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-full bg-surface-elevated"
                    aria-hidden
                  >
                    <div
                      className={
                        highlight
                          ? "h-full rounded-full bg-brand-accent"
                          : "h-full rounded-full bg-accent"
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function MySummarySection({
  data,
  locale,
}: {
  data: MySummary;
  locale: string;
}) {
  return (
    <section
      aria-label="Moje výsledky"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <KpiCard
        label="Nové firmy"
        value={String(data.companies_added)}
        icon={Sprout}
        hint="Přidané v období"
      />
      <KpiCard
        label="Vyhrané obchody"
        value={String(data.deals_won_count)}
        icon={Handshake}
        hint="Uzavřené v období"
      />
      <KpiCard
        label="Hodnota výhry"
        value={formatMoney(data.deals_won_value, data.currency, locale)}
        icon={Trophy}
        accent="highlight"
        hint="Součet vyhraných obchodů"
      />
      <KpiCard
        label="Konverze"
        value={formatPercent(data.conversion_rate)}
        icon={Target}
        hint="Vyhrané / uzavřené"
      />
      <KpiCard
        label="Průměrný cyklus"
        value={formatDays(data.avg_cycle_days)}
        icon={Gauge}
        hint="Od vzniku po uzavření"
      />
    </section>
  );
}

function LossReasonsSection({
  data,
  locale,
}: {
  data: LossReasons;
  locale: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Důvody prohry</h2>
      <p className="mt-1 text-sm text-text-tertiary">
        Nejčastější důvody uvedené u ztracených obchodů.
      </p>
      {data.rows.length === 0 ? (
        <p className="mt-6 text-sm text-text-secondary">
          V tomto období nebyly ztracené obchody s vyplněným důvodem.
        </p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
              <th className="py-2 font-medium">Důvod</th>
              <th className="py-2 text-right font-medium">Počet</th>
              <th className="py-2 text-right font-medium">Hodnota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.rows.map((row) => (
              <tr key={row.lost_reason}>
                <td className="py-2 text-text-primary">{row.lost_reason}</td>
                <td className="py-2 text-right tabular-nums text-text-primary">{row.count}</td>
                <td className="py-2 text-right tabular-nums text-text-secondary">
                  {formatMoney(row.total_value, data.currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function VelocitySection({ data }: { data: Velocity }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Průměrné trvání obchodu</h2>
      <p className="mt-1 text-sm text-text-tertiary">
        Průměrný počet dní od vzniku do uzavření — podle konečné fáze.
      </p>
      {data.stages.length === 0 ? (
        <p className="mt-6 text-sm text-text-secondary">
          V tomto období nebyly žádné uzavřené obchody.
        </p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
              <th className="py-2 font-medium">Fáze</th>
              <th className="py-2 text-right font-medium">Průměr dní</th>
              <th className="py-2 text-right font-medium">Počet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.stages.map((s) => (
              <tr key={s.stage_id}>
                <td className="py-2 text-text-primary">{s.stage_name}</td>
                <td className="py-2 text-right tabular-nums text-text-primary">
                  {s.avg_days_in_stage === null || s.avg_days_in_stage === undefined
                    ? "—"
                    : (Math.round(s.avg_days_in_stage * 10) / 10).toFixed(1)}
                </td>
                <td className="py-2 text-right tabular-nums text-text-secondary">
                  {s.deal_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ReportsPage() {
  usePageTitle("Reporty");
  const { data: user } = useCurrentUser();
  const { accessToken } = useAuth();
  const locale = user?.organization.locale ?? "cs-CZ";
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [teamMetric, setTeamMetric] = useState<TeamMetric>("won_value");
  const [teamFilter, setTeamFilter] = useState<string>("");

  const role = user?.role;
  const showLeaderboardForRole =
    role !== "salesperson" || !!user?.organization.show_leaderboard_to_salespeople;
  const showTeamLeaderboard = role === "admin" || role === "manager";
  const showMySummary = role === "salesperson";

  const range = useMemo(() => ({ from, to }), [from, to]);
  const leaderboard = useLeaderboard({
    from,
    to,
    teamId: teamFilter || undefined,
    enabled: showLeaderboardForRole,
  });
  const teamLeaderboard = useTeamLeaderboard({
    from,
    to,
    metric: teamMetric,
    enabled: showTeamLeaderboard,
  });
  const mySummary = useMySummary(range);
  const loss = useLossReasons(range);
  const velocity = useVelocity(range);
  const orgTeams = useOrgTeams();

  const teamOptions = useMemo(() => {
    if (!showLeaderboardForRole || !orgTeams.data) return [];
    return orgTeams.data.items.map((team) => ({ id: team.id, name: team.name }));
  }, [orgTeams.data, showLeaderboardForRole]);

  async function handleDownload() {
    if (!accessToken) return;
    const url = buildExportCsvUrl(range);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `simplecrm-deals-${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reporty</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            {showTeamLeaderboard
              ? "Výkonnost týmů, obchodníků a rychlost pipeline."
              : "Vaše výsledky, důvody proher a rychlost pipeline."}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-medium text-text-tertiary">
            Od
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-text-tertiary">
            Do
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!accessToken}
            className="inline-flex h-[34px] items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-primary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <Download size={16} strokeWidth={1.75} /> Export CSV
          </button>
        </div>
      </header>

      <div className="space-y-5">
        {showTeamLeaderboard ? (
          teamLeaderboard.isPending ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
              Načítání žebříčku týmů…
            </div>
          ) : teamLeaderboard.isError || !teamLeaderboard.data ? (
            <div className="rounded-lg border border-danger-subtle bg-danger-subtle p-6 text-sm text-danger">
              Žebříček týmů se nepodařilo načíst.
            </div>
          ) : (
            <TeamLeaderboardSection
              data={teamLeaderboard.data}
              metric={teamMetric}
              onMetricChange={setTeamMetric}
              locale={locale}
            />
          )
        ) : null}

        {showLeaderboardForRole ? (
          leaderboard.isPending ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
              Načítání žebříčku obchodníků…
            </div>
          ) : leaderboard.isError || !leaderboard.data ? (
            <div className="rounded-lg border border-danger-subtle bg-danger-subtle p-6 text-sm text-danger">
              Žebříček obchodníků se nepodařilo načíst.
            </div>
          ) : (
            <LeaderboardSection
              data={leaderboard.data}
              locale={locale}
              teamFilter={teamFilter}
              onTeamFilterChange={setTeamFilter}
              teamOptions={teamOptions}
            />
          )
        ) : null}

        {showMySummary ? (
          mySummary.isPending ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
              Načítání mých výsledků…
            </div>
          ) : mySummary.isError || !mySummary.data ? (
            <div className="rounded-lg border border-danger-subtle bg-danger-subtle p-6 text-sm text-danger">
              Mé výsledky se nepodařilo načíst.
            </div>
          ) : (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Moje výsledky</h2>
              <p className="mb-4 inline-flex items-center gap-2 text-sm text-text-tertiary">
                <PiggyBank size={14} strokeWidth={1.75} aria-hidden /> Výkon za
                vybrané období.
              </p>
              <MySummarySection data={mySummary.data} locale={locale} />
            </div>
          )
        ) : null}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {loss.isPending ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
              Načítání důvodů proher…
            </div>
          ) : loss.isError || !loss.data ? (
            <div className="rounded-lg border border-danger-subtle bg-danger-subtle p-6 text-sm text-danger">
              Důvody proher se nepodařilo načíst.
            </div>
          ) : (
            <LossReasonsSection data={loss.data} locale={locale} />
          )}

          {velocity.isPending ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
              Načítání rychlosti pipeline…
            </div>
          ) : velocity.isError || !velocity.data ? (
            <div className="rounded-lg border border-danger-subtle bg-danger-subtle p-6 text-sm text-danger">
              Rychlost pipeline se nepodařilo načíst.
            </div>
          ) : (
            <VelocitySection data={velocity.data} />
          )}
        </div>
      </div>
    </div>
  );
}
