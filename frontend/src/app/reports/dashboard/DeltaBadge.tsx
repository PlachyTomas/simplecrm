import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

import type { components } from "@/types/api.generated";

type Comparison = components["schemas"]["Comparison"];

interface DeltaBadgeProps {
  comparison: Comparison | null | undefined;
  /**
   * If true, "down" = good (e.g. sales_cycle_length: shorter is better).
   * Defaults to false — up arrow = green = good.
   */
  inverted?: boolean;
}

/**
 * Compact "vs. previous period" delta — just the signed percentage
 * with a colored arrow. The previous-period date range used to live
 * here too but the global filter bar now displays the resolved
 * range, so the per-widget echo was redundant noise.
 *
 * Returns `null` when there's nothing to show — no comparison, or a
 * comparison with no `delta_pct` (no previous-period data to divide
 * by). Callers can render it inline without needing to gate on
 * truthiness.
 */
export function DeltaBadge({ comparison, inverted = false }: DeltaBadgeProps) {
  if (!comparison) return null;
  if (comparison.delta_pct === null || comparison.delta_pct === undefined) {
    return null;
  }

  const positive = comparison.delta_pct >= 0;
  const good = inverted ? !positive : positive;
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;
  const sign = positive ? "+" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        good ? "text-success" : "text-danger",
      )}
    >
      <Arrow size={12} strokeWidth={2} aria-hidden />
      {sign}
      {comparison.delta_pct.toFixed(1)} %
    </span>
  );
}
