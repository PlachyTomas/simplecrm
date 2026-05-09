import { type ReactNode } from "react";

import { Sparkline } from "@/app/reports/dashboard/Sparkline";
import type { components } from "@/types/api.generated";

type SparklineBucket = components["schemas"]["SparklineBucket"];

interface KPITileProps {
  /**
   * The headline number, already formatted (the widget owns money /
   * percent / days formatting; this component just renders strings).
   */
  value: string;
  /** Optional second line under the value. */
  secondary?: string;
  /** Inline +/-X.X% delta vs. previous period, rendered next to the value. */
  delta?: ReactNode;
  /** Inline trend chart. Hidden when fewer than 2 buckets. */
  sparkline?: SparklineBucket[];
  /** Aria description for the sparkline (e.g. "Trend hodnoty pipeline"). */
  sparklineLabel?: string;
  /** Optional context — used by widgets like sales_cycle_length to hint at sample size. */
  hint?: ReactNode;
}

/**
 * Body shape every KPI tile widget shares: the headline number,
 * an optional secondary line, an inline comparison delta, an
 * optional sparkline, and a tertiary hint. The previous-period
 * date pair used to live in WidgetFrame.footer; it now lives in the
 * global filter bar, so KPI tiles never render a footer.
 */
export function KPITile({
  value,
  secondary,
  delta,
  sparkline,
  sparklineLabel,
  hint,
}: KPITileProps) {
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div>
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-3xl font-semibold tabular-nums text-text-primary">{value}</p>
          {delta ? <span className="shrink-0">{delta}</span> : null}
        </div>
        {secondary ? (
          <p className="mt-1 text-sm tabular-nums text-text-secondary">{secondary}</p>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        {hint ? <p className="text-xs text-text-tertiary">{hint}</p> : <span aria-hidden />}
        {sparkline && sparkline.length >= 2 ? (
          <Sparkline buckets={sparkline} ariaLabel={sparklineLabel} />
        ) : null}
      </div>
    </div>
  );
}
