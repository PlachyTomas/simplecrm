import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ListColumn<T> {
  /** Header label. */
  header: string;
  /** Render the cell for one row. */
  render: (row: T) => ReactNode;
  /** Right-align numeric / status columns. */
  align?: "left" | "right";
  /**
   * Add `whitespace-nowrap` so values like dates / day counts don't wrap
   * mid-text inside narrow widget bodies.
   */
  nowrap?: boolean;
  /** Tailwind width hint, e.g. "w-12" for rank columns. */
  className?: string;
}

interface ListWidgetProps<T> {
  rows: T[];
  columns: ListColumn<T>[];
  /** Click handler — navigates to detail page in the calling widget. */
  onRowClick?: (row: T) => void;
  /** Used as React key for each row. */
  rowKey: (row: T) => string;
  emptyMessage: string;
}

/**
 * Compact, scrollable table — the body for `stale_deals` and
 * `companies_at_risk`. Up to 20 rows (the backend caps; we just
 * render whatever we get). Sticky header so headers stay readable
 * during overflow scroll inside small widget heights.
 */
export function ListWidget<T>({
  rows,
  columns,
  onRowClick,
  rowKey,
  emptyMessage,
}: ListWidgetProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-xs text-text-tertiary">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-[11px] uppercase tracking-wider text-text-tertiary">
            {columns.map((col, i) => (
              <th
                key={i}
                className={cn(
                  "py-2 font-medium",
                  col.align === "right" ? "text-right" : "text-left",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "transition-colors duration-fast",
                onRowClick
                  ? "cursor-pointer hover:bg-surface-overlay"
                  : undefined,
              )}
            >
              {columns.map((col, i) => (
                <td
                  key={i}
                  className={cn(
                    "py-2",
                    col.align === "right"
                      ? "text-right"
                      : "text-left",
                    col.nowrap ? "whitespace-nowrap" : undefined,
                    col.className,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
