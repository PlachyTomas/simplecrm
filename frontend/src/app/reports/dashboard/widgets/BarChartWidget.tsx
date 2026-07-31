import { useMemo } from "react";
import { useContainerWidth } from "react-grid-layout";
import { useTranslation } from "react-i18next";
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
  /** Already-formatted text for the value (formatted currency, 35 %, etc.). */
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

// Y-axis width estimate — reserves horizontal space for the category
// tick text *before* Recharts has measured actual glyph widths. Tuned
// against 12px Inter (not the 6px/char recharts defaults land on),
// which underestimated width badly enough that names like "1. Eva
// Novakova" or "listopad 2026" wrapped to two lines.
const AXIS_CHAR_WIDTH_PX = 7.5;
const AXIS_LABEL_PADDING_PX = 24;
const AXIS_WIDTH_CAP_PX = 180;
const MIN_LABEL_CHARS = 8;
// Longest name that still fits on one line within the width cap —
// anything longer is truncated with an ellipsis in the chart itself;
// the Tooltip and sr-only table always show the full name.
const MAX_LABEL_CHARS = Math.floor(
  (AXIS_WIDTH_CAP_PX - AXIS_LABEL_PADDING_PX) / AXIS_CHAR_WIDTH_PX,
);

// Each category gets a fixed vertical slot rather than an equal share of
// whatever height the widget happens to have. Recharts spreads N bands
// across the full chart height, so a one-row chart parked its single 16px
// bar in the middle of a band as tall as the widget — reading as enormous
// padding — and a short widget couldn't fit the band at all. A fixed slot
// (16px bar + 8px breathing room either side) keeps the bar rhythm
// identical at every widget size; the container scrolls when the rows
// outgrow it.
const BAND_HEIGHT_PX = 32;
const CHART_VERTICAL_PADDING_PX = 8;

// Right margin reserves room for the LabelList value trailing the
// longest bar ("780 000 Kč") — the old fixed 56px clipped currency
// values at the widget's right edge. 11px tabular-nums digits run
// narrower than the 12px axis text, hence the separate estimate.
const VALUE_CHAR_WIDTH_PX = 6.5;
const VALUE_LABEL_PADDING_PX = 14;
const VALUE_MARGIN_CAP_PX = 120;
const VALUE_MARGIN_MIN_PX = 40;

function truncateLabel(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, Math.max(1, maxChars - 1))}…`;
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
  emptyMessage,
}: BarChartWidgetProps) {
  const { t } = useTranslation("reports");
  const { width: chartWidth, containerRef: chartRef } = useContainerWidth();
  const resolvedEmptyMessage = emptyMessage ?? t("barChart.defaultEmptyMessage");
  const data = useMemo(
    () =>
      rows.map((r, i) => {
        const fullName = r.rank !== undefined ? `${r.rank}. ${r.label}` : r.label;
        return {
          name: truncateLabel(fullName, MAX_LABEL_CHARS),
          fullName,
          value: r.value,
          display: r.display,
          highlighted: i === highlightIndex,
        };
      }),
    [rows, highlightIndex],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-xs text-text-tertiary">
        {resolvedEmptyMessage}
      </div>
    );
  }

  const longestLabelChars = Math.max(MIN_LABEL_CHARS, ...data.map((d) => d.name.length));
  const yAxisWidth = Math.min(
    AXIS_WIDTH_CAP_PX,
    AXIS_LABEL_PADDING_PX + longestLabelChars * AXIS_CHAR_WIDTH_PX,
  );
  const longestDisplayChars = Math.max(...data.map((d) => d.display.length));
  const rightMargin = Math.min(
    VALUE_MARGIN_CAP_PX,
    Math.max(
      VALUE_MARGIN_MIN_PX,
      VALUE_LABEL_PADDING_PX + longestDisplayChars * VALUE_CHAR_WIDTH_PX,
    ),
  );

  const chartHeight = data.length * BAND_HEIGHT_PX + CHART_VERTICAL_PADDING_PX * 2;

  return (
    // `my-auto` (not `justify-center`) centres a short chart in a tall
    // widget: auto margins only claim leftover space, so an overflowing
    // chart still starts at the top instead of having its first rows
    // clipped above the scroll origin.
    <div className="flex h-full w-full flex-col overflow-y-auto" role="img" aria-label={ariaLabel}>
      {/* Visually-hidden data table so screen readers can read the chart
          contents — Recharts itself isn't AT-friendly. Per
          REPORTS_TASK §R9.3. */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t("barChart.columnItem")}</th>
            <th scope="col">{t("barChart.columnValue")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{d.fullName}</td>
              <td>{d.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        ref={chartRef as React.RefObject<HTMLDivElement>}
        className="my-auto w-full shrink-0"
        style={{ height: chartHeight }}
      >
        {/* Recharts warns (width -1) when it mounts before layout — render
            only once the wrapper has a real width. */}
        {chartWidth > 0 ? (
          <ResponsiveContainer>
            <BarChart
              data={data}
              layout="vertical"
              margin={{
                top: CHART_VERTICAL_PADDING_PX,
                right: rightMargin,
                bottom: CHART_VERTICAL_PADDING_PX,
                left: 0,
              }}
            >
              {/* Function form so an all-zero data set (common for
                rep_activity / sales_leaderboard with no activity in the
                period) never degenerates the domain to [0, 0] — that
                collapsed every bar to 0×0 and hid the value labels too. */}
              <XAxis type="number" hide domain={[0, (dataMax: number) => Math.max(dataMax, 1)]} />
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
                labelFormatter={(
                  label: unknown,
                  payload: ReadonlyArray<{ payload?: { fullName?: string } }>,
                ) => String(payload?.[0]?.payload?.fullName ?? label ?? "")}
              />
              <Bar dataKey="value" radius={4} barSize={16} minPointSize={2}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    className={cn(d.highlighted ? "fill-brand-accent" : "fill-accent")}
                  />
                ))}
                <LabelList
                  dataKey="display"
                  position="right"
                  className="fill-text-secondary text-[11px] tabular-nums"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}
