// react-grid-layout's stylesheet already includes the
// `.react-resizable-handle` positioning rules we need; we don't import
// react-resizable's own sheet because pnpm doesn't hoist it to the
// top-level node_modules and our `widget-grid.css` repaints the handle
// visuals anyway.
import "react-grid-layout/css/styles.css";
import "./widget-grid.css";

import { useCallback, useMemo } from "react";
import {
  Responsive as ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout";

import { useMediaQuery } from "@/lib/useMediaQuery";

const COLS = { lg: 12, md: 6, sm: 1 };
// CONTAINER-width thresholds, not viewport. With the expanded sidebar
// (~256px) + page padding, a 1280px viewport leaves a ~960px container —
// the original lg:1024 threshold silently put common laptops on the
// "tablet" 6-col grid, whose drags didn't persist (review P1). 900 keeps
// 12-col + full persistence for any viewport from ~1220px up.
const BREAKPOINTS = { lg: 900, md: 600, sm: 0 };
const ROW_HEIGHT = 64;

/**
 * Structural shape the grid needs from every widget: a stable id and a
 * 2D position. Kept local (not imported from the Reports domain types)
 * so both dashboards — Reports and Home — can drive the same grid with
 * their own richer entry types. Callers pass their full entry type as
 * the generic `W`; `renderWidget`/`onLayoutChange` see it unchanged.
 */
export interface WidgetGridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetGridItem {
  id: string;
  position: WidgetGridPosition;
}

interface WidgetGridProps<W extends WidgetGridItem> {
  widgets: W[];
  isEditMode: boolean;
  onLayoutChange: (next: W[]) => void;
  renderWidget: (entry: W) => React.ReactNode;
}

/**
 * Map a react-grid-layout change back onto the widgets' stored 12-col
 * positions. RGL's Responsive wrapper only refreshes the ACTIVE
 * breakpoint's entry in `all` — the others keep the (possibly stale)
 * prop-derived layouts — so reading `all.lg` while the user edits the
 * 6-col md view discards their changes (review P1).
 *
 *  - lg (12-col): take x/y/w/h verbatim — it's the persisted model.
 *  - md (6-col clamped view): take the row order (y) and height, keep the
 *    stored 12-col x/w so sizes never get corrupted by the clamp.
 *
 * Exported for unit tests (jsdom can't render RGL — no ResizeObserver).
 */
export function applyLayoutToWidgets<W extends WidgetGridItem>(
  widgets: W[],
  current: Layout,
  all: ResponsiveLayouts<"lg" | "md">,
  breakpoint: "lg" | "md",
): W[] {
  const source = (breakpoint === "lg" ? all.lg : all.md) ?? current;
  const byId = new Map<string, LayoutItem>(source.map((l) => [l.i, l]));
  return widgets.map((w) => {
    const l = byId.get(w.id);
    if (!l) return w;
    const position =
      breakpoint === "lg"
        ? { x: l.x, y: l.y, w: l.w, h: l.h }
        : { x: w.position.x, y: l.y, w: w.position.w, h: l.h };
    return { ...w, position };
  });
}

/**
 * Responsive widget grid with three breakpoints per REPORTS_TASK §6.4:
 *
 *  - desktop (container ≥ 900px): drag + resize, 12-col grid.
 *  - tablet (container 600–899px): 6-col clamped view; drags persist as
 *    row reordering (y/h), stored 12-col x/w stay untouched.
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
export function WidgetGrid<W extends WidgetGridItem>({
  widgets,
  isEditMode,
  onLayoutChange,
  renderWidget,
}: WidgetGridProps<W>) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { width, containerRef } = useContainerWidth();

  const layouts = useMemo<ResponsiveLayouts<"lg" | "md">>(() => {
    const lg: LayoutItem[] = widgets.map((w) => ({
      i: w.id,
      x: w.position.x,
      y: w.position.y,
      w: w.position.w,
      h: w.position.h,
    }));
    const md: LayoutItem[] = widgets.map((w) => ({
      i: w.id,
      x: Math.min(w.position.x, 5),
      y: w.position.y,
      w: Math.min(w.position.w, 6),
      h: w.position.h,
    }));
    return { lg, md };
  }, [widgets]);

  const handleLayoutChange = useCallback(
    (current: Layout, all: ResponsiveLayouts<"lg" | "md">) => {
      // Persist from whichever breakpoint the user actually edited —
      // see applyLayoutToWidgets. Mobile bypasses the grid entirely.
      const breakpoint = width >= BREAKPOINTS.lg ? "lg" : "md";
      onLayoutChange(applyLayoutToWidgets(widgets, current, all, breakpoint));
    },
    [widgets, onLayoutChange, width],
  );

  if (isMobile) {
    const sorted = [...widgets].sort((a, b) => {
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
    // RGL's `useContainerWidth` returns `RefObject<HTMLDivElement | null>`,
    // which @types/react@18 treats as nominally distinct from the
    // `RefObject<HTMLDivElement>` that `<div ref=...>` expects. The runtime
    // shape is identical; cast to make the types line up.
    <div ref={containerRef as React.RefObject<HTMLDivElement>}>
      <ResponsiveGridLayout
        className="layout"
        width={width}
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        dragConfig={{
          enabled: isEditMode,
          handle: ".widget-drag-handle",
        }}
        resizeConfig={{
          enabled: isEditMode,
          handles: ["se"],
        }}
        onLayoutChange={handleLayoutChange}
      >
        {widgets.map((entry) => (
          <div key={entry.id}>{renderWidget(entry)}</div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
