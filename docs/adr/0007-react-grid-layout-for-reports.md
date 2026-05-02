# ADR 0007 — react-grid-layout for the Reports widget dashboard

## Context

The configurable Reports dashboard (REPORTS_TASK Phase R5+) needs:

- A 12-column grid where each widget occupies a `(x, y, w, h)`
  rectangle.
- Drag-and-drop reordering on desktop.
- Resize handles on desktop.
- Reflow at the tablet breakpoint (clamp widths to 6 cols).
- Single-column vertical stack on mobile, no drag/resize.
- Persistence of the layout to a per-user JSONB column.

We need this to feel solid without rebuilding what already exists.

## Options considered

1. **dnd-kit** — modern, accessible drag library. Excellent for
   sortable lists and free-form drag, but does not handle resize or
   grid reflow out of the box. Building those on top would re-invent
   the work.
2. **react-grid-layout** — purpose-built for exactly this shape (drag
   + resize + responsive breakpoints + grid math). Mature
   (originally 2015), still receives maintenance, has Tailwind-friendly
   class hooks. Bundle size ~50 kB gzipped.
3. **Hand-rolled CSS grid + manual drag handlers** — full control,
   no dependency, but every behavior (collision avoidance, resize,
   reflow, breakpoints) becomes our problem. Reports is a
   high-iteration surface; we don't want this one to slow us down.

## Decision

Use **`react-grid-layout`**. Its `Responsive` + `WidthProvider`
HOCs solve the breakpoint reflow we need; the `RGL` `onLayoutChange`
fires the persisted PUT call. Its CSS classes are stable enough that
Tailwind theming just attaches via `className`.

## Consequences

- One more direct dependency. The package's TypeScript types are
  separately published (`@types/react-grid-layout`); we accept the
  deprecation warning on the types package — its type signatures are
  still accurate enough and the runtime library is healthy.
- The default `react-grid-layout/css/styles.css` and
  `react-resizable/css/styles.css` need to load for the resize
  handles to render — imported at the top of `WidgetGrid.tsx`.
- On mobile (`< 768px`) we bypass the library entirely and render a
  plain vertical stack sorted by `y` then `x`. This keeps the mobile
  bundle from paying the drag-and-drop cost.

## Out of scope

- Embedding individual widgets elsewhere in the app. Until that
  surfaces, we don't optimize for non-grid placements.
- Custom collision rules — RGL's default "compact vertical" packing
  is fine for the dashboards we're building.
