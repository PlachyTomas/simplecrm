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

import type { ParseKeys } from "i18next";
import { Crown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

const PRESETS = ["last_7_days", "last_30_days", "this_quarter"] as const;
type Preset = (typeof PRESETS)[number];

const PRESET_LABEL_KEY: Record<Preset, ParseKeys<"marketing">> = {
  last_7_days: "reports.presetLast7",
  last_30_days: "reports.presetLast30",
  this_quarter: "reports.presetQuarter",
};

interface DemoData {
  pipelineValue: number;
  pipelineDeltaPct: number;
  leaderboard: { nameKey: ParseKeys<"marketing">; value: number }[];
  lostReasons: { reasonKey: ParseKeys<"marketing">; count: number }[];
  staleDeals: {
    nameKey: ParseKeys<"marketing">;
    companyKey: ParseKeys<"marketing">;
    days: number;
    value: number;
  }[];
}

const FAKE_DATA: Record<Preset, DemoData> = {
  last_7_days: {
    pipelineValue: 480_000,
    pipelineDeltaPct: 8.4,
    leaderboard: [
      { nameKey: "reports.people.eva", value: 220_000 },
      { nameKey: "reports.people.jakub", value: 145_000 },
      { nameKey: "reports.people.tereza", value: 90_000 },
    ],
    lostReasons: [
      { reasonKey: "reports.reasons.price", count: 3 },
      { reasonKey: "reports.reasons.competition", count: 2 },
      { reasonKey: "reports.reasons.timing", count: 1 },
    ],
    staleDeals: [
      {
        nameKey: "reports.dealNames.warehouse",
        companyKey: "reports.companies.alk",
        days: 32,
        value: 180_000,
      },
      {
        nameKey: "reports.dealNames.annualLicense",
        companyKey: "reports.companies.brnoIt",
        days: 28,
        value: 96_000,
      },
    ],
  },
  last_30_days: {
    pipelineValue: 1_245_000,
    pipelineDeltaPct: 27.0,
    leaderboard: [
      { nameKey: "reports.people.eva", value: 612_000 },
      { nameKey: "reports.people.jakub", value: 388_000 },
      { nameKey: "reports.people.tereza", value: 245_000 },
    ],
    lostReasons: [
      { reasonKey: "reports.reasons.price", count: 11 },
      { reasonKey: "reports.reasons.competition", count: 7 },
      { reasonKey: "reports.reasons.timing", count: 4 },
      { reasonKey: "reports.reasons.noBudget", count: 3 },
    ],
    staleDeals: [
      {
        nameKey: "reports.dealNames.warehouse",
        companyKey: "reports.companies.alk",
        days: 67,
        value: 180_000,
      },
      {
        nameKey: "reports.dealNames.annualLicense",
        companyKey: "reports.companies.brnoIt",
        days: 54,
        value: 96_000,
      },
      {
        nameKey: "reports.dealNames.cloudAudit",
        companyKey: "reports.companies.prahaStudios",
        days: 43,
        value: 240_000,
      },
    ],
  },
  this_quarter: {
    pipelineValue: 3_120_000,
    pipelineDeltaPct: 18.6,
    leaderboard: [
      { nameKey: "reports.people.eva", value: 1_420_000 },
      { nameKey: "reports.people.jakub", value: 980_000 },
      { nameKey: "reports.people.tereza", value: 720_000 },
    ],
    lostReasons: [
      { reasonKey: "reports.reasons.price", count: 24 },
      { reasonKey: "reports.reasons.competition", count: 15 },
      { reasonKey: "reports.reasons.timing", count: 11 },
      { reasonKey: "reports.reasons.noBudget", count: 8 },
      { reasonKey: "reports.reasons.wrongProduct", count: 4 },
    ],
    staleDeals: [
      {
        nameKey: "reports.dealNames.warehouse",
        companyKey: "reports.companies.alk",
        days: 92,
        value: 180_000,
      },
      {
        nameKey: "reports.dealNames.annualLicense",
        companyKey: "reports.companies.brnoIt",
        days: 78,
        value: 96_000,
      },
      {
        nameKey: "reports.dealNames.cloudAudit",
        companyKey: "reports.companies.prahaStudios",
        days: 64,
        value: 240_000,
      },
      {
        nameKey: "reports.dealNames.hardwareRefresh",
        companyKey: "reports.companies.plzenTech",
        days: 51,
        value: 320_000,
      },
    ],
  },
};

export function ReportsDemoSection() {
  const { t } = useTranslation("marketing");
  const [preset, setPreset] = useState<Preset>("last_30_days");

  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            {t("reports.eyebrow")}
          </p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">{t("reports.title")}</h2>
          <p className="mt-4 text-base text-text-secondary md:text-lg">{t("reports.subtitle")}</p>
        </div>

        <div className="mt-8 flex justify-center">
          <div
            role="tablist"
            aria-label={t("reports.periodTablistAria")}
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
                {t(PRESET_LABEL_KEY[p])}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-[1100px]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DemoTile label={t("reports.tilePipeline")} data={FAKE_DATA[preset]} variant="pipeline" />
            <DemoTile
              label={t("reports.tileLeaderboard")}
              data={FAKE_DATA[preset]}
              variant="leaderboard"
            />
            <DemoTile
              label={t("reports.tileLostReasons")}
              data={FAKE_DATA[preset]}
              variant="lost_reasons"
            />
            <DemoTile label={t("reports.tileStale")} data={FAKE_DATA[preset]} variant="stale_deals" />
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
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  const animated = useCountUp(data.pipelineValue);
  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums text-text-primary">
        {formatMoney(animated, "CZK", locale)}
      </p>
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <TrendingUp size={12} strokeWidth={2} aria-hidden />+{data.pipelineDeltaPct.toFixed(1)} %
        <span className="font-normal text-text-tertiary">{t("reports.vsPrevPeriod")}</span>
      </p>
    </div>
  );
}

function LeaderboardBody({ data }: { data: DemoData }) {
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  const max = data.leaderboard[0]?.value ?? 1;
  return (
    <ol className="space-y-2">
      {data.leaderboard.map((row, i) => {
        const pct = Math.max(8, Math.round((row.value / max) * 100));
        const isLeader = i === 0;
        return (
          <li key={row.nameKey} className="flex items-center gap-3 text-xs">
            {isLeader ? (
              <span
                aria-label={t("reports.leaderAria")}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-accent text-text-on-brand-accent"
              >
                <Crown size={10} strokeWidth={2} aria-hidden />
              </span>
            ) : (
              <span className="w-5 text-right tabular-nums text-text-tertiary">{i + 1}.</span>
            )}
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-text-primary">{t(row.nameKey)}</span>
                <span className="tabular-nums text-text-secondary">
                  {formatMoney(row.value, "CZK", locale)}
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
  const { t } = useTranslation("marketing");
  const max = data.lostReasons[0]?.count ?? 1;
  return (
    <ul className="space-y-2">
      {data.lostReasons.map((row) => {
        const pct = Math.max(10, Math.round((row.count / max) * 100));
        return (
          <li key={row.reasonKey} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-text-secondary">{t(row.reasonKey)}</span>
              <span className="tabular-nums text-text-tertiary">{row.count}×</span>
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
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wider text-text-tertiary">
          <th className="py-1.5 font-medium">{t("reports.colDeal")}</th>
          <th className="py-1.5 text-right font-medium">{t("reports.colValue")}</th>
          <th className="py-1.5 text-right font-medium">{t("reports.colDays")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle">
        {data.staleDeals.map((row) => (
          <tr key={row.nameKey}>
            <td className="py-1.5 text-text-primary">
              <div className="font-medium">{t(row.nameKey)}</div>
              <div className="text-text-tertiary">{t(row.companyKey)}</div>
            </td>
            <td className="py-1.5 text-right tabular-nums text-text-secondary">
              {formatMoney(row.value, "CZK", locale)}
            </td>
            <td
              className={cn(
                "py-1.5 text-right font-medium tabular-nums",
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
