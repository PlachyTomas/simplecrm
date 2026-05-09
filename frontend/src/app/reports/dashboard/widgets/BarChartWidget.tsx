import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

export interface BarRow {
  /** Y-axis label. */
  label: string;
  /** Numeric value the bar represents. */
  value: number;
  /** Already-formatted text for the value (Kč 12 000, 35 %, etc.). */
  display: string;
  /** Optional rank shown left of the label (1., 2., …). */
  rank?: number;
}

interface BarChartWidgetProps {
  rows: BarRow[];
  /**
   * If set, the bar at this index is painted with the brand magenta
   * accent — used by `sales_leaderboard` for the leader. Pair with
   * `Crown`/rank in the label so we don't communicate via color
   * alone.
   */
  highlightIndex?: number;
  /** Aria description for the chart. */
  ariaLabel: string;
  /** Optional empty-state message when `rows.length === 0`. */
  emptyMessage?: string;
}

/**
 * Horizontal bar chart shared by `lost_reasons_breakdown`,
 * `sales_leaderboard`, and `rep_activity`. Recharts handles the
 * scaling and axes; the parent widget passes pre-formatted `display`
 * strings so currency / percent / count formatting stays in one
 * place per widget.
 *
 * Rank + label render as the Y-axis tick; the formatted value
 * renders as a `LabelList` trailing each bar.
 */
export function BarChartWidget({
  rows,
  highlightIndex,
  ariaLabel,
  emptyMessage = "Žádná data v tomto období.",
}: BarChartWidgetProps) {
  const data = useMemo(
    () =>
      rows.map((r, i) => ({
        name: r.rank !== undefined ? `${r.rank}. ${r.label}` : r.label,
        value: r.value,
        display: r.display,
        highlighted: i === highlightIndex,
      })),
    [rows, highlightIndex],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-xs text-text-tertiary">
        {emptyMessage}
      </div>
    );
  }

  const longestLabelChars = Math.max(8, ...data.map((d) => d.name.length));
  const yAxisWidth = Math.min(160, 8 + longestLabelChars * 6);

  return (
    // minHeight floor here keeps ResponsiveContainer happy on the first
    // paint before react-grid-layout measures the row — without it,
    // Recharts logs a width(-1)/height(-1) warning that only clears
    // after the second render.
    <div className="h-full w-full" style={{ minHeight: 160 }} role="img" aria-label={ariaLabel}>
      {/* Visually-hidden data table so screen readers can read the chart
          contents — Recharts itself isn't AT-friendly. Per
          REPORTS_TASK §R9.3. */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Položka</th>
            <th scope="col">Hodnota</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{d.name}</td>
              <td>{d.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 0 }}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="name"
            width={yAxisWidth}
            tick={{ fontSize: 12, fill: "currentColor" }}
            axisLine={false}
            tickLine={false}
            className="text-text-secondary"
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-overlay, transparent)" }}
            formatter={(_v: unknown, _n: unknown, ctx: { payload?: { display?: string } }) =>
              ctx.payload?.display ?? "—"
            }
            labelFormatter={(label: string) => label}
          />
          <Bar dataKey="value" radius={4} barSize={16}>
            {data.map((d, i) => (
              <Cell key={i} className={cn(d.highlighted ? "fill-brand-accent" : "fill-accent")} />
            ))}
            <LabelList
              dataKey="display"
              position="right"
              className="fill-text-secondary text-[11px] tabular-nums"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
