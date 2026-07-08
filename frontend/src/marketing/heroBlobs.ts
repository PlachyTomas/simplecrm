/**
 * Tuning knobs for the landing hero's "mold-colony" blob animation.
 *
 * Three optional Vite env vars let us tune the glows without touching CSS.
 * Every knob has a numeric default, so the hero animates correctly with NO
 * env set. The resolved values are written as CSS custom properties on the
 * hero glow container (see `Hero` in LandingPage.tsx); the @keyframes in
 * index.css consume them via `var()` / `calc()`:
 *
 *   --hero-blob-speed       global speed multiplier (higher = faster)
 *   --hero-blob-erraticity  morph amplitude (how much blobs bloom/shrink)
 *   --hero-blob-travel      drift distance (how far blobs roam)
 *
 * Env vars are read once at build time (Vite inlines `import.meta.env`), so
 * the parsing lives in a pure helper that we can unit-test with a fake env.
 */
import type { CSSProperties } from "react";

export interface HeroBlobConfig {
  /** Global speed multiplier — higher makes every blob cycle faster. */
  speed: number;
  /** Morph amplitude multiplier — how far each blob's scale departs from 1. */
  erraticity: number;
  /** Travel multiplier — how far each blob drifts across the hero. */
  travel: number;
}

/**
 * Defaults. `speed` 2.5 makes the colony ~2.5x faster than the original
 * 22/29/34s cadence (→ ~8.8/11.6/13.6s) — noticeably livelier but still
 * organic, not frantic. `erraticity` / `travel` at 1 preserve the original
 * morph + drift character.
 */
export const HERO_BLOB_DEFAULTS: HeroBlobConfig = {
  speed: 2.5,
  erraticity: 1,
  travel: 1,
};

/** Guard rails so a stray env value can never break the animation. */
const RANGES: Record<keyof HeroBlobConfig, { min: number; max: number }> = {
  // Lower bound stays above 0 to avoid dividing the duration by zero.
  speed: { min: 0.25, max: 10 },
  erraticity: { min: 0, max: 3 },
  travel: { min: 0, max: 3 },
};

function parseKnob(
  raw: unknown,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  const n = typeof raw === "string" ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Resolve the hero blob knobs from a Vite-style env object. Missing,
 * empty, non-numeric, or out-of-range values fall back to / clamp to the
 * defaults, so the return value is always safe to feed into CSS.
 */
export function resolveHeroBlobConfig(env: Record<string, unknown>): HeroBlobConfig {
  return {
    speed: parseKnob(env.VITE_HERO_BLOB_SPEED, HERO_BLOB_DEFAULTS.speed, RANGES.speed),
    erraticity: parseKnob(
      env.VITE_HERO_BLOB_ERRATICITY,
      HERO_BLOB_DEFAULTS.erraticity,
      RANGES.erraticity,
    ),
    travel: parseKnob(env.VITE_HERO_BLOB_TRAVEL, HERO_BLOB_DEFAULTS.travel, RANGES.travel),
  };
}

/** CSS custom properties for the hero glow container. */
export function heroBlobStyle(config: HeroBlobConfig): CSSProperties {
  return {
    "--hero-blob-speed": String(config.speed),
    "--hero-blob-erraticity": String(config.erraticity),
    "--hero-blob-travel": String(config.travel),
  } as CSSProperties;
}
