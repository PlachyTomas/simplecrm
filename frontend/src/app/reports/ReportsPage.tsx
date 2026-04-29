import { Crown, Download, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

import {
  type Leaderboard,
  type LossReasons,
  type Velocity,
  buildExportCsvUrl,
  useLeaderboard,
  useLossReasons,
  useVelocity,
} from "@/app/reports/useReports";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { EmptyState } from "@/components/ui/empty-state";
import { csNoun } from "@/lib/i18n/nouns";
import { usePageTitle } from "@/lib/usePageTitle";

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 89);
  return { from: fromDate.toISOString().slice(0, 10), to };
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

function LeaderboardSection({
  data,
  locale,
}: {
  data: Leaderboard;
  locale: string;
}) {
  const max = data.rows.length ? Number(data.rows[0].won_value) || 1 : 1;
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Leaderboard</h2>
      <p className="mt-1 text-sm text-text-tertiary">
        Vítězné obchody obchodníků za vybrané období.
      </p>
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

  const range = useMemo(() => ({ from, to }), [from, to]);
  const leaderboard = useLeaderboard(range);
  const loss = useLossReasons(range);
  const velocity = useVelocity(range);

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
            Výkonnost týmu, důvody proher a rychlost pipeline.
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {leaderboard.isPending ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
            Načítání leaderboardu…
          </div>
        ) : leaderboard.isError || !leaderboard.data ? (
          <div className="rounded-lg border border-danger-subtle bg-danger-subtle p-6 text-sm text-danger">
            Leaderboard se nepodařilo načíst.
          </div>
        ) : (
          <LeaderboardSection data={leaderboard.data} locale={locale} />
        )}

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

        <div className="xl:col-span-2">
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
