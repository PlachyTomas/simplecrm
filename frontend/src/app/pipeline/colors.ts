/**
 * Resolve the accent color for a pipeline stage.
 *
 * Precedence:
 *   1. The admin-configured `stage.color` (set in Settings → Pipeline).
 *   2. A position-indexed default palette for stages that have never had
 *      a color set (e.g. legacy rows or a fresh seed with placeholder color).
 *   3. Zinc fallback for stages beyond the palette.
 *
 * The default palette walks cold → warm → magenta-celebration so the
 * leftmost (cold intake) and rightmost (won) seeded stages have a
 * legible cue out of the box, but the admin's explicit choice always
 * wins — the previous "palette overrides custom color" behavior was a
 * bug: admins changed colors in Settings and the kanban kept rendering
 * the palette.
 */
const STAGE_PALETTE = [
  "#A1A1AA", // zinc-400 — Stage 1 (cold intake)
  "#0EA5E9", // sky-500 — Stage 2
  "#6366F1", // indigo-500 — Stage 3
  "#8B5CF6", // violet-500 — Stage 4
  "#F59E0B", // amber-500 — Stage 5 (hot)
  "#EC4899", // brand magenta — won
];

export function stageColor(orderIndex: number, configured?: string | null): string {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed;
  if (orderIndex >= 0 && orderIndex < STAGE_PALETTE.length) {
    // bounds checked above; non-null satisfies noUncheckedIndexedAccess.
    return STAGE_PALETTE[orderIndex]!;
  }
  return "#71717A"; // zinc-500
}
