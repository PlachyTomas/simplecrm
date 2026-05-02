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
  /** Inline trend chart. Hidden when fewer than 2 buckets. */
  sparkline?: SparklineBucket[];
  /** Aria description for the sparkline (e.g. "Trend hodnoty pipeline"). */
  sparklineLabel?: string;
  /** Optional context — used by widgets like sales_cycle_length to hint at sample size. */
  hint?: ReactNode;
}

/**
 * Body shape every KPI tile widget shares: the headline number,
 * an optional secondary line, an optional inline sparkline, and a
 * tertiary hint. Lives inside `WidgetFrame.children`; the comparison
 * delta belongs in `WidgetFrame.footer` via `DeltaBadge`.
 */
export function KPITile({
  value,
  secondary,
  sparkline,
  sparklineLabel,
  hint,
}: KPITileProps) {
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div>
        <p className="text-3xl font-semibold tabular-nums text-text-primary">
          {value}
        </p>
        {secondary ? (
          <p className="mt-1 text-sm text-text-secondary tabular-nums">
            {secondary}
          </p>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        {hint ? (
          <p className="text-xs text-text-tertiary">{hint}</p>
        ) : (
          <span aria-hidden />
        )}
        {sparkline && sparkline.length >= 2 ? (
          <Sparkline buckets={sparkline} ariaLabel={sparklineLabel} />
        ) : null}
      </div>
    </div>
  );
}
