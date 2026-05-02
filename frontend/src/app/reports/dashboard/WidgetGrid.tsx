// react-grid-layout's stylesheet already includes the
// `.react-resizable-handle` positioning rules we need; we don't import
// react-resizable's own sheet because pnpm doesn't hoist it to the
// top-level node_modules and our `widget-grid.css` repaints the handle
// visuals anyway.
import "react-grid-layout/css/styles.css";
import "@/app/reports/dashboard/widget-grid.css";

import { useCallback, useMemo } from "react";
import {
  Responsive as ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
} from "react-grid-layout";

import { useMediaQuery } from "@/lib/useMediaQuery";

import type { DashboardConfig, WidgetEntry } from "@/app/reports/dashboard/types";

const COLS = { lg: 12, md: 6, sm: 1 };
const BREAKPOINTS = { lg: 1024, md: 768, sm: 0 };
const ROW_HEIGHT = 64;

interface WidgetGridProps {
  config: DashboardConfig;
  isEditMode: boolean;
  onLayoutChange: (next: WidgetEntry[]) => void;
  renderWidget: (entry: WidgetEntry) => React.ReactNode;
}

/**
 * Responsive widget grid with three breakpoints per REPORTS_TASK §6.4:
 *
 *  - desktop (≥ 1024px): drag + resize, 12-col grid.
 *  - tablet (768–1023px): drag only, 6-col grid (widget widths clamp).
 *  - mobile (< 768px): bypass the library entirely, render a plain
 *    vertical stack sorted by `(y, x)`. Saves the drag-and-drop bundle
 *    cost on the smallest viewport.
 *
 * react-grid-layout v2.2 dropped the `WidthProvider` HOC in favor of a
 * `useContainerWidth` hook that returns a ref + measured width. The
 * grid itself takes `width` as a prop, so we measure the wrapper and
 * pass it down.
 *
 * Drag is initiated only from elements carrying the
 * `widget-drag-handle` class — that's the GripVertical button in the
 * widget header — so clicking inside a widget body never starts a
 * drag.
 */
export function WidgetGrid({
  config,
  isEditMode,
  onLayoutChange,
  renderWidget,
}: WidgetGridProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { width, containerRef } = useContainerWidth();

  const layouts = useMemo(() => {
    const lg: Layout[] = config.widgets.map((w) => ({
      i: w.id,
      x: w.position.x,
      y: w.position.y,
      w: w.position.w,
      h: w.position.h,
    }));
    const md: Layout[] = config.widgets.map((w) => ({
      i: w.id,
      x: Math.min(w.position.x, 5),
      y: w.position.y,
      w: Math.min(w.position.w, 6),
      h: w.position.h,
    }));
    return { lg, md };
  }, [config.widgets]);

  const handleLayoutChange = useCallback(
    (current: Layout[], all: { lg?: Layout[] }) => {
      // We only persist the desktop layout. Tablet layout is a clamped
      // view; mobile bypasses the grid library entirely.
      const lg = all.lg ?? current;
      const byId = new Map(lg.map((l) => [l.i, l]));
      const next = config.widgets.map((w) => {
        const l = byId.get(w.id);
        if (!l) return w;
        return {
          ...w,
          position: { x: l.x, y: l.y, w: l.w, h: l.h },
        };
      });
      onLayoutChange(next);
    },
    [config.widgets, onLayoutChange],
  );

  if (isMobile) {
    const sorted = [...config.widgets].sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      return a.position.x - b.position.x;
    });
    return (
      <div className="space-y-4">
        {sorted.map((entry) => (
          <div key={entry.id} className="min-h-[200px]">
            {renderWidget(entry)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <ResponsiveGridLayout
        className="layout"
        width={width}
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={handleLayoutChange}
        resizeHandles={["se"]}
      >
        {config.widgets.map((entry) => (
          <div key={entry.id}>{renderWidget(entry)}</div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
