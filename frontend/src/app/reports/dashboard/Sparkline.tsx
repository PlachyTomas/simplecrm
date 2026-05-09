import { useId } from "react";

import type { components } from "@/types/api.generated";

type SparklineBucket = components["schemas"]["SparklineBucket"];

interface SparklineProps {
  buckets: SparklineBucket[];
  width?: number;
  height?: number;
  /** Aria description so screen readers can announce the trend. */
  ariaLabel?: string;
}

/**
 * Inline SVG sparkline. We intentionally don't pull in Recharts for
 * tile widgets — the bar/list widgets already pay that cost; tiles
 * keep the bundle lean.
 *
 * Renders nothing when there are < 2 points (a single dot reads as
 * noise next to a big number).
 */
export function Sparkline({ buckets, width = 80, height = 24, ariaLabel }: SparklineProps) {
  const gradId = useId();
  if (buckets.length < 2) {
    return <div className="h-6 w-20" aria-hidden />;
  }
  const values = buckets.map((b) => Number(b.value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // `buckets.length >= 2` guard above guarantees these indices exist; the
  // non-null assertions are needed under `noUncheckedIndexedAccess`.
  const lastY = height - ((values[values.length - 1]! - min) / span) * height;
  const firstY = height - ((values[0]! - min) / span) * height;
  const trendingUp = lastY <= firstY;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="overflow-visible"
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            stopColor={
              trendingUp
                ? "rgb(var(--color-success-rgb, 34 197 94))"
                : "rgb(var(--color-danger-rgb, 239 68 68))"
            }
            stopOpacity="0.3"
          />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#${gradId})`} />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={trendingUp ? "text-success" : "text-danger"}
      />
    </svg>
  );
}
