import { Crown, RefreshCw, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DEMO_DEALS_INITIAL,
  DEMO_SALES,
  DEMO_STAGES,
  DEMO_TEAMS,
  type DemoDeal,
} from "@/marketing/demo-data";

const moneyFmt = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

const TEAM_BY_ID = new Map(DEMO_TEAMS.map((t) => [t.id, t]));
const SALES_BY_ID = new Map(DEMO_SALES.map((s) => [s.id, s]));

const ALL_TEAMS = "__all__";

function ownerTeamId(deal: DemoDeal): string {
  return SALES_BY_ID.get(deal.owner_id)?.team_id ?? "";
}

function ownerName(deal: DemoDeal): string {
  return SALES_BY_ID.get(deal.owner_id)?.name ?? "—";
}

function StatTile({
  label,
  value,
  hint,
  highlight = false,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border p-4 transition-colors duration-fast " +
        (highlight
          ? "border-brand-accent-subtle bg-brand-accent-subtle"
          : "border-border-subtle bg-surface")
      }
    >
      <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      <p
        className={
          "mt-2 break-words text-base font-semibold tabular-nums sm:text-xl " +
          (highlight ? "text-brand-accent" : "text-text-primary")
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-text-tertiary">{hint}</p> : null}
    </div>
  );
}

function DealCard({
  deal,
  onWin,
  onDragStart,
  draggable,
}: {
  deal: DemoDeal;
  onWin?: () => void;
  onDragStart: (id: string) => void;
  draggable: boolean;
}) {
  const team = TEAM_BY_ID.get(ownerTeamId(deal));
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", deal.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(deal.id);
      }}
      className={
        "group relative rounded-md border border-border bg-surface p-2.5 text-left shadow-sm transition-all duration-fast " +
        (draggable ? "cursor-grab active:cursor-grabbing hover:border-accent-border" : "")
      }
    >
      <p className="pr-1 text-xs font-medium leading-snug text-text-primary">{deal.name}</p>
      <p className="truncate text-[11px] text-text-tertiary">{deal.company}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-mono text-[11px] tabular-nums text-text-secondary">
          {moneyFmt.format(deal.value)}
        </span>
        {team ? (
          <span
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: `${team.color}1a`,
              color: team.color,
            }}
            title={`${team.name} · ${ownerName(deal)}`}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: team.color }}
            />
            <span className="truncate">{team.name}</span>
          </span>
        ) : null}
      </div>
      {onWin ? (
        <button
          type="button"
          onClick={onWin}
          aria-label={`Označit obchod ${deal.name} jako vyhraný`}
          className="absolute right-1.5 top-1.5 inline-flex h-5 items-center gap-1 rounded-full bg-brand-accent px-1.5 text-[10px] font-semibold text-text-on-brand-accent opacity-0 transition-opacity duration-fast hover:bg-brand-accent-hover group-hover:opacity-100 focus:opacity-100"
        >
          <Crown size={9} strokeWidth={2} aria-hidden /> Win
        </button>
      ) : null}
    </div>
  );
}

export function InteractivePipeline() {
  const [deals, setDeals] = useState<DemoDeal[]>(DEMO_DEALS_INITIAL);
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const visibleDeals = useMemo(
    () =>
      teamFilter === ALL_TEAMS
        ? deals
        : deals.filter((d) => ownerTeamId(d) === teamFilter),
    [deals, teamFilter],
  );

  const dealsByStage = useMemo(() => {
    const grouped = new Map<string, DemoDeal[]>();
    for (const stage of DEMO_STAGES) grouped.set(stage.id, []);
    for (const deal of visibleDeals) {
      grouped.get(deal.stage_id)?.push(deal);
    }
    return grouped;
  }, [visibleDeals]);

  const stats = useMemo(() => {
    let openCount = 0;
    let openValue = 0;
    let wonCount = 0;
    let wonValue = 0;
    for (const deal of visibleDeals) {
      const stage = DEMO_STAGES.find((s) => s.id === deal.stage_id);
      if (!stage) continue;
      if (stage.type === "won") {
        wonCount += 1;
        wonValue += deal.value;
      } else {
        openCount += 1;
        openValue += deal.value;
      }
    }
    const totalClosed = wonCount; // demo has no lost-state
    const conversion = totalClosed + openCount === 0 ? 0 : wonCount / (wonCount + openCount);
    return { openCount, openValue, wonCount, wonValue, conversion };
  }, [visibleDeals]);

  const teamLeaderboard = useMemo(() => {
    const wonByTeam = new Map<string, { count: number; value: number }>();
    for (const team of DEMO_TEAMS) wonByTeam.set(team.id, { count: 0, value: 0 });
    for (const deal of deals) {
      const stage = DEMO_STAGES.find((s) => s.id === deal.stage_id);
      if (stage?.type !== "won") continue;
      const tid = ownerTeamId(deal);
      const bucket = wonByTeam.get(tid);
      if (!bucket) continue;
      bucket.count += 1;
      bucket.value += deal.value;
    }
    return DEMO_TEAMS.map((t) => ({ team: t, ...wonByTeam.get(t.id)! })).sort(
      (a, b) => b.value - a.value,
    );
  }, [deals]);

  const maxTeamValue = Math.max(1, ...teamLeaderboard.map((r) => r.value));

  const salesLeaderboard = useMemo(() => {
    const wonBySales = new Map<string, { count: number; value: number }>();
    for (const sales of DEMO_SALES) wonBySales.set(sales.id, { count: 0, value: 0 });
    for (const deal of deals) {
      const stage = DEMO_STAGES.find((s) => s.id === deal.stage_id);
      if (stage?.type !== "won") continue;
      const bucket = wonBySales.get(deal.owner_id);
      if (!bucket) continue;
      bucket.count += 1;
      bucket.value += deal.value;
    }
    return DEMO_SALES.map((s) => {
      const team = TEAM_BY_ID.get(s.team_id);
      return { sales: s, team, ...wonBySales.get(s.id)! };
    })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.value - a.value);
  }, [deals]);

  const maxSalesValue = Math.max(1, ...salesLeaderboard.map((r) => r.value));

  function moveDealToStage(dealId: string, stageId: string) {
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage_id: stageId } : d)),
    );
  }

  function handleDrop(stageId: string) {
    if (draggingId) moveDealToStage(draggingId, stageId);
    setDraggingId(null);
    setDragOverStageId(null);
  }

  function reset() {
    setDeals(DEMO_DEALS_INITIAL);
    setTeamFilter(ALL_TEAMS);
  }

  const wonStage = DEMO_STAGES.find((s) => s.type === "won")!;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Živá ukázka
          </p>
          <h3 className="mt-1 text-lg font-semibold">Přesouvejte obchody — statistiky reagují</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Zkuste přetáhnout kartu mezi sloupci nebo kliknout na <em>Vyhráno</em>.
            Žebříček týmů a hodnota pipeline se přepočítají v reálném čase.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-overlay px-3 text-xs font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
        >
          <RefreshCw size={12} strokeWidth={1.75} /> Reset
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTeamFilter(ALL_TEAMS)}
          className={
            "inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors duration-fast " +
            (teamFilter === ALL_TEAMS
              ? "bg-accent text-text-on-accent"
              : "border border-border-subtle bg-surface-overlay text-text-secondary hover:text-text-primary")
          }
        >
          Všechny týmy
        </button>
        {DEMO_TEAMS.map((team) => {
          const active = teamFilter === team.id;
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => setTeamFilter(team.id)}
              className={
                "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-fast " +
                (active
                  ? "text-text-on-accent"
                  : "border border-border-subtle bg-surface-overlay text-text-secondary hover:text-text-primary")
              }
              style={
                active
                  ? { backgroundColor: team.color }
                  : undefined
              }
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              {team.name}
            </button>
          );
        })}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatTile
          label="Otevřené"
          value={String(stats.openCount)}
          hint="V probíhající pipeline"
        />
        <StatTile
          label="Hodnota pipeline"
          value={moneyFmt.format(stats.openValue)}
          hint="Otevřené obchody"
        />
        <StatTile label="Vyhráno" value={String(stats.wonCount)} hint="V tomto sloupci" />
        <StatTile
          label="Výnosy"
          value={moneyFmt.format(stats.wonValue)}
          hint="Součet vyhraných"
          highlight
        />
        <StatTile
          label="Konverze"
          value={`${Math.round(stats.conversion * 100)} %`}
          hint="Vyhrané / všechny"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {DEMO_STAGES.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) ?? [];
          const total = stageDeals.reduce((sum, d) => sum + d.value, 0);
          const isHover = dragOverStageId === stage.id;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
              }}
              onDragLeave={() => {
                if (dragOverStageId === stage.id) setDragOverStageId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stage.id);
              }}
              className={
                "rounded-md border bg-surface-overlay p-2.5 transition-colors duration-fast " +
                (isHover
                  ? "border-accent bg-accent-subtle"
                  : "border-border-subtle")
              }
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-subtle pb-2">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="min-w-0 truncate text-xs font-semibold text-text-primary">
                  {stage.name}
                </span>
                <span className="ml-auto whitespace-nowrap font-mono text-[10px] tabular-nums text-text-tertiary">
                  {stageDeals.length} · {moneyFmt.format(total)}
                </span>
              </div>
              <div className="mt-2 min-h-[60px] space-y-1.5">
                {stageDeals.length === 0 ? (
                  <p className="py-3 text-center text-[10px] text-text-tertiary">
                    Sem přetáhněte obchod
                  </p>
                ) : (
                  stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      draggable
                      onDragStart={setDraggingId}
                      onWin={
                        stage.type === "won"
                          ? undefined
                          : () => moveDealToStage(deal.id, wonStage.id)
                      }
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border-subtle bg-surface-overlay p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Trophy size={14} strokeWidth={1.75} className="text-brand-accent" />
            <h4 className="text-sm font-semibold">Žebříček týmů</h4>
            <span className="text-xs text-text-tertiary">podle hodnoty výhry</span>
          </div>
          <ol className="space-y-2">
            {teamLeaderboard.map((row, idx) => {
              const pct = Math.max(4, Math.round((row.value / maxTeamValue) * 100));
              const leader = idx === 0 && row.value > 0;
              return (
                <li key={row.team.id} className="flex items-center gap-3">
                  {leader ? (
                    <span
                      aria-label="Vedoucí žebříčku"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-accent text-text-on-brand-accent"
                    >
                      <Crown size={11} strokeWidth={2} aria-hidden />
                    </span>
                  ) : (
                    <span className="w-5 shrink-0 text-right text-xs font-medium text-text-tertiary tabular-nums">
                      {idx + 1}.
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-text-primary">
                        {row.team.name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-secondary">
                        {row.count} · {moneyFmt.format(row.value)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-elevated" aria-hidden>
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: leader ? "var(--color-brand-accent)" : row.team.color,
                        }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="rounded-md border border-border-subtle bg-surface-overlay p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Trophy size={14} strokeWidth={1.75} className="text-brand-accent" />
            <h4 className="text-sm font-semibold">Žebříček obchodníků</h4>
            <span className="text-xs text-text-tertiary">podle hodnoty výhry</span>
          </div>
          {salesLeaderboard.length === 0 ? (
            <p className="py-3 text-xs text-text-tertiary">
              Zatím žádný obchodník nevyhrál obchod. Přesuňte kartu do sloupce <em>Vyhráno</em>.
            </p>
          ) : (
            <ol className="space-y-2">
              {salesLeaderboard.map((row, idx) => {
                const pct = Math.max(4, Math.round((row.value / maxSalesValue) * 100));
                const leader = idx === 0 && row.value > 0;
                const teamColor = row.team?.color ?? "var(--color-accent)";
                return (
                  <li key={row.sales.id} className="flex items-center gap-3">
                    {leader ? (
                      <span
                        aria-label="Vedoucí žebříčku"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-accent text-text-on-brand-accent"
                      >
                        <Crown size={11} strokeWidth={2} aria-hidden />
                      </span>
                    ) : (
                      <span className="w-5 shrink-0 text-right text-xs font-medium text-text-tertiary tabular-nums">
                        {idx + 1}.
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate text-xs font-medium text-text-primary">
                            {row.sales.name}
                          </span>
                          {row.team ? (
                            <span className="hidden shrink-0 truncate text-[10px] text-text-tertiary sm:inline">
                              · {row.team.name}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-secondary">
                          {row.count} · {moneyFmt.format(row.value)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-elevated" aria-hidden>
                        <div
                          className="h-full rounded-full transition-all duration-200"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: leader ? "var(--color-brand-accent)" : teamColor,
                          }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
