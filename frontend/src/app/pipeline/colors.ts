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
const STAGE_PALETTE = [
  "#A1A1AA", // zinc-400 — Stage 1 (Nový lead / cold intake)
  "#0EA5E9", // sky-500 — Stage 2 (Kontaktováno)
  "#6366F1", // indigo-500 — Stage 3 (Schůzka)
  "#8B5CF6", // violet-500 — Stage 4 (Nabídka)
  "#F59E0B", // amber-500 — Stage 5 (Jednání / hot)
  "#EC4899", // brand magenta — Stage 6 (Vyhráno)
];

export function stageColor(orderIndex: number, fallback?: string | null): string {
  if (orderIndex >= 0 && orderIndex < STAGE_PALETTE.length) {
    return STAGE_PALETTE[orderIndex];
  }
  return fallback ?? "#71717A"; // zinc-500
}
