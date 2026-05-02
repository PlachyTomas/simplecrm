import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

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
 * Comparison-vs-previous-period delta — sits in `WidgetFrame.footer`
 * for every KPI tile. Hidden entirely when the backend returns
 * `comparison: null` (no closed deals last period, etc.).
 *
 * Empty `delta_pct` (no previous-period data) renders as a flat "—"
 * with the previous-period dates in the secondary text.
 */
export function DeltaBadge({ comparison, inverted = false }: DeltaBadgeProps) {
  if (!comparison) return null;

  const formatRange = formatPreviousRange(comparison);

  if (comparison.delta_pct === null || comparison.delta_pct === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
        <ArrowRight size={12} strokeWidth={1.75} aria-hidden /> {formatRange}
      </span>
    );
  }

  const positive = comparison.delta_pct >= 0;
  const good = inverted ? !positive : positive;
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;
  const sign = positive ? "+" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        good ? "text-success" : "text-danger",
      )}
    >
      <Arrow size={12} strokeWidth={2} aria-hidden />
      {sign}
      {comparison.delta_pct.toFixed(1)} %
      <span className="font-normal text-text-tertiary">
        oproti {formatRange}
      </span>
    </span>
  );
}

function formatPreviousRange(c: Comparison): string {
  try {
    const fmt = new Intl.DateTimeFormat("cs-CZ", {
      day: "numeric",
      month: "numeric",
    });
    return `${fmt.format(new Date(c.previous_from))} – ${fmt.format(
      new Date(c.previous_to),
    )}`;
  } catch {
    return `${c.previous_from} – ${c.previous_to}`;
  }
}
