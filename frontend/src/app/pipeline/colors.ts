/**
 * Progressive stage palette aligned to stage *index*, not stage *name*.
 * Cold → warm → magenta-celebration → red-loss; the order matters more
 * than admin-renamed labels (a custom "Triage" stage at position 1 still
 * gets cool zinc, etc.).
 *
 * Brief §4: green is reserved for the persisted "Vyhráno" record state.
 * Magenta is the celebration color reserved for the moment of winning,
 * not the column tint — but the seeded Vyhráno stage column accent still
 * uses magenta so the leftmost cue (the dot in the column header) is
 * legible. Lost columns, if rendered, get pure red `#DC2626`.
 *
 * Falls back to the stage's own configured color when the index is out
 * of range (large pipelines, or admin-added stages beyond seed).
 */
// Indices map to position in the pipeline. The default seed uses 4 stages
// (Nový lead → Osloveno → Jednání → Vyhráno), but admins can add more —
// keep a longer palette so extra columns still get a stable color from
// the same scheme. Last entry is reserved for the won stage (magenta
// brand-accent).
const STAGE_PALETTE = [
  "#A1A1AA", // zinc-400 — Stage 1 (cold intake)
  "#0EA5E9", // sky-500 — Stage 2
  "#6366F1", // indigo-500 — Stage 3
  "#8B5CF6", // violet-500 — Stage 4
  "#F59E0B", // amber-500 — Stage 5 (hot)
  "#EC4899", // brand magenta — won
];

export function stageColor(orderIndex: number, fallback?: string | null): string {
  if (orderIndex >= 0 && orderIndex < STAGE_PALETTE.length) {
    // bounds checked above; non-null satisfies noUncheckedIndexedAccess.
    return STAGE_PALETTE[orderIndex]!;
  }
  return fallback ?? "#71717A"; // zinc-500
}
