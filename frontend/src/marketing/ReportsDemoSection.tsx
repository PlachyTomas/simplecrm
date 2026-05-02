/**
 * Landing-page interactive demo for the Reports widget dashboard.
 *
 * REPORTS_TASK §R8: a glassless, fake-data preview of four widgets
 * — `pipeline_value`, `sales_leaderboard`, `lost_reasons_breakdown`,
 * `stale_deals` — with a 3-preset segmented control. Switching
 * presets count-animates the numbers; we honor
 * `prefers-reduced-motion: reduce` by swapping instantly.
 *
 * Recharts isn't loaded here on purpose — landing budget matters.
 * The leaderboard / lost-reasons "bars" are CSS-width divs and
 * stale-deals is a tiny static table.
 */

import { Crown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

const PRESETS = ["last_7_days", "last_30_days", "this_quarter"] as const;
type Preset = (typeof PRESETS)[number];

const PRESET_LABEL: Record<Preset, string> = {
  last_7_days: "Posledních 7 dní",
  last_30_days: "Posledních 30 dní",
  this_quarter: "Tento kvartál",
};

interface DemoData {
  pipelineValue: number;
  pipelineDeltaPct: number;
  leaderboard: { name: string; value: number }[];
  lostReasons: { reason: string; count: number }[];
  staleDeals: {
    name: string;
    company: string;
    days: number;
    value: number;
  }[];
}

const FAKE_DATA: Record<Preset, DemoData> = {
  last_7_days: {
    pipelineValue: 480_000,
    pipelineDeltaPct: 8.4,
    leaderboard: [
      { name: "Eva Novotná", value: 220_000 },
      { name: "Jakub Veselý", value: 145_000 },
      { name: "Tereza Horáková", value: 90_000 },
    ],
    lostReasons: [
      { reason: "Cena", count: 3 },
      { reason: "Konkurence", count: 2 },
      { reason: "Časování", count: 1 },
    ],
    staleDeals: [
      { name: "Modernizace skladu", company: "ALK Logistics", days: 32, value: 180_000 },
      { name: "Roční licence", company: "Brno IT", days: 28, value: 96_000 },
    ],
  },
  last_30_days: {
    pipelineValue: 1_245_000,
    pipelineDeltaPct: 27.0,
    leaderboard: [
      { name: "Eva Novotná", value: 612_000 },
      { name: "Jakub Veselý", value: 388_000 },
      { name: "Tereza Horáková", value: 245_000 },
    ],
    lostReasons: [
      { reason: "Cena", count: 11 },
      { reason: "Konkurence", count: 7 },
      { reason: "Časování", count: 4 },
      { reason: "Bez rozpočtu", count: 3 },
    ],
    staleDeals: [
      { name: "Modernizace skladu", company: "ALK Logistics", days: 67, value: 180_000 },
      { name: "Roční licence", company: "Brno IT", days: 54, value: 96_000 },
      { name: "Cloud audit", company: "Praha Studios", days: 43, value: 240_000 },
    ],
  },
  this_quarter: {
    pipelineValue: 3_120_000,
    pipelineDeltaPct: 18.6,
    leaderboard: [
      { name: "Eva Novotná", value: 1_420_000 },
      { name: "Jakub Veselý", value: 980_000 },
      { name: "Tereza Horáková", value: 720_000 },
    ],
    lostReasons: [
      { reason: "Cena", count: 24 },
      { reason: "Konkurence", count: 15 },
      { reason: "Časování", count: 11 },
      { reason: "Bez rozpočtu", count: 8 },
      { reason: "Špatný produkt", count: 4 },
    ],
    staleDeals: [
      { name: "Modernizace skladu", company: "ALK Logistics", days: 92, value: 180_000 },
      { name: "Roční licence", company: "Brno IT", days: 78, value: 96_000 },
      { name: "Cloud audit", company: "Praha Studios", days: 64, value: 240_000 },
      { name: "Refresh hardwaru", company: "Plzeň Tech", days: 51, value: 320_000 },
    ],
  },
};

const CZK_FORMATTER = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("cs-CZ", {
  maximumFractionDigits: 0,
});

export function ReportsDemoSection() {
  const [preset, setPreset] = useState<Preset>("last_30_days");

  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            Reporty
          </p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">
            Sledujte přesně to, co potřebujete
          </h2>
          <p className="mt-4 text-base text-text-secondary md:text-lg">
            Přizpůsobte si dashboard. Vyberte z 12 widgetů, vytvořte si vlastní
            rozložení, sdílejte výsledky CSV exportem.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div
            role="tablist"
            aria-label="Vybrat období v ukázce"
            className="inline-flex flex-wrap gap-1 overflow-x-auto rounded-md border border-border bg-surface-overlay p-1"
          >
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={preset === p}
                onClick={() => setPreset(p)}
                className={cn(
                  "h-8 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors duration-fast",
                  preset === p
                    ? "bg-accent text-text-on-accent"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-[1100px]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DemoTile
              label="Hodnota pipeline"
              data={FAKE_DATA[preset]}
              variant="pipeline"
            />
            <DemoTile
              label="Žebříček obchodníků"
              data={FAKE_DATA[preset]}
              variant="leaderboard"
            />
            <DemoTile
              label="Důvody prohraných obchodů"
              data={FAKE_DATA[preset]}
              variant="lost_reasons"
            />
            <DemoTile
              label="Stagnující obchody"
              data={FAKE_DATA[preset]}
              variant="stale_deals"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

interface DemoTileProps {
  label: string;
  data: DemoData;
  variant: "pipeline" | "leaderboard" | "lost_reasons" | "stale_deals";
}

function DemoTile({ label, data, variant }: DemoTileProps) {
  return (
    <article className="rounded-lg border border-border bg-surface-overlay p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
      </header>
      {variant === "pipeline" && <PipelineBody data={data} />}
      {variant === "leaderboard" && <LeaderboardBody data={data} />}
      {variant === "lost_reasons" && <LostReasonsBody data={data} />}
      {variant === "stale_deals" && <StaleDealsBody data={data} />}
    </article>
  );
}

function PipelineBody({ data }: { data: DemoData }) {
  const animated = useCountUp(data.pipelineValue);
  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums text-text-primary">
        {CZK_FORMATTER.format(animated)}
      </p>
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <TrendingUp size={12} strokeWidth={2} aria-hidden />+
        {data.pipelineDeltaPct.toFixed(1)} %
        <span className="font-normal text-text-tertiary">
          oproti předchozímu období
        </span>
      </p>
    </div>
  );
}

function LeaderboardBody({ data }: { data: DemoData }) {
  const max = data.leaderboard[0]?.value ?? 1;
  return (
    <ol className="space-y-2">
      {data.leaderboard.map((row, i) => {
        const pct = Math.max(8, Math.round((row.value / max) * 100));
        const isLeader = i === 0;
        return (
          <li key={row.name} className="flex items-center gap-3 text-xs">
            {isLeader ? (
              <span
                aria-label="Vedoucí"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-accent text-text-on-brand-accent"
              >
                <Crown size={10} strokeWidth={2} aria-hidden />
              </span>
            ) : (
              <span className="w-5 text-right text-text-tertiary tabular-nums">
                {i + 1}.
              </span>
            )}
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-text-primary">{row.name}</span>
                <span className="tabular-nums text-text-secondary">
                  {CZK_FORMATTER.format(row.value)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    isLeader ? "bg-brand-accent" : "bg-accent",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function LostReasonsBody({ data }: { data: DemoData }) {
  const max = data.lostReasons[0]?.count ?? 1;
  return (
    <ul className="space-y-2">
      {data.lostReasons.map((row) => {
        const pct = Math.max(10, Math.round((row.count / max) * 100));
        return (
          <li key={row.reason} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-text-secondary">{row.reason}</span>
              <span className="tabular-nums text-text-tertiary">
                {row.count}×
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-warning transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StaleDealsBody({ data }: { data: DemoData }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wider text-text-tertiary">
          <th className="py-1.5 font-medium">Obchod</th>
          <th className="py-1.5 text-right font-medium">Hodnota</th>
          <th className="py-1.5 text-right font-medium">Dní</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle">
        {data.staleDeals.map((row) => (
          <tr key={row.name}>
            <td className="py-1.5 text-text-primary">
              <div className="font-medium">{row.name}</div>
              <div className="text-text-tertiary">{row.company}</div>
            </td>
            <td className="py-1.5 text-right tabular-nums text-text-secondary">
              {NUMBER_FORMATTER.format(row.value)} Kč
            </td>
            <td
              className={cn(
                "py-1.5 text-right tabular-nums font-medium",
                row.days >= 90 && "text-danger",
                row.days >= 60 && row.days < 90 && "text-warning",
                row.days < 60 && "text-text-secondary",
              )}
            >
              {row.days}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Smoothly tween from the previous value to a new target. Returns the
 * animated value each frame. Suppressed under
 * `prefers-reduced-motion: reduce` — the new value is returned
 * immediately so the demo still updates, just without animation.
 */
function useCountUp(target: number, durationMs = 600): number {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (reduce) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = value;
    const delta = target - from;
    if (delta === 0) return;

    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / durationMs);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + delta * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce, durationMs]);

  return value;
}
