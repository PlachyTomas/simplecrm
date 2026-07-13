import { useMemo } from "react";

const ACCENT = "--color-accent-rgb";
const MAGENTA = "--color-brand-accent-rgb";

function envNum(raw: string | undefined, fallback: number): number {
  const n = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

// Splash behaviour is env-tunable (Vite bakes VITE_* in at build time); every
// knob defaults to the locked design when its variable is unset.
const CONFIG = {
  // "Seek" tuning (2026-07-13): faster, smaller, denser cores so the blobs
  // read as searching rather than ambient fog. Loops land at ~8-12s.
  speed: envNum(import.meta.env.VITE_HERO_SPEED, 3),
  erraticity: envNum(import.meta.env.VITE_HERO_ERRATICITY, 1),
  opacity: envNum(import.meta.env.VITE_HERO_OPACITY, 1),
  count: Math.max(0, Math.min(24, Math.round(envNum(import.meta.env.VITE_HERO_COUNT, 6)))),
  blur: envNum(import.meta.env.VITE_HERO_BLUR, 26),
  size: envNum(import.meta.env.VITE_HERO_SIZE, 0.5),
};

// Base flock: positions are %, sizes rem, durations/delays seconds. erraticity
// jitters these per load; erraticity=0 renders exactly this fixed layout.
const BASE = [
  { anim: "hero-blob-1", token: ACCENT, size: 36, left: -8, top: 6, core: 0.55, dur: 27, delay: 0 },
  {
    anim: "hero-blob-2",
    token: MAGENTA,
    size: 32,
    left: 60,
    top: -6,
    core: 0.5,
    dur: 33,
    delay: -7,
  },
  {
    anim: "hero-blob-3",
    token: ACCENT,
    size: 26,
    left: 16,
    top: 32,
    core: 0.45,
    dur: 29,
    delay: -15,
  },
  {
    anim: "hero-blob-4",
    token: MAGENTA,
    size: 34,
    left: 68,
    top: 24,
    core: 0.5,
    dur: 37,
    delay: -4,
  },
  {
    anim: "hero-blob-2",
    token: ACCENT,
    size: 24,
    left: 38,
    top: 0,
    core: 0.4,
    dur: 41,
    delay: -22,
  },
  {
    anim: "hero-blob-1",
    token: MAGENTA,
    size: 28,
    left: 46,
    top: 30,
    core: 0.48,
    dur: 25,
    delay: -12,
  },
];

// Each blob is invisible at its animation's loop seam, so the restart reads as
// dying and being reborn elsewhere rather than snapping back to its start.
export function HeroPlasma() {
  const blobs = useMemo(() => {
    const e = CONFIG.erraticity;
    const jitter = (amount: number) => (Math.random() * 2 - 1) * amount * e;
    return Array.from({ length: CONFIG.count }, (_, i) => {
      const b = BASE[i % BASE.length]!;
      const dur = (b.dur * (1 + jitter(0.2))) / (CONFIG.speed || 1);
      // A random start phase (negative delay) is what makes start positions
      // semi-random; e=0 keeps the base delay so the layout is reproducible.
      const delay = e > 0 ? -Math.random() * dur : b.delay;
      return {
        anim: b.anim,
        token: b.token,
        left: `${(b.left + jitter(12)).toFixed(2)}%`,
        top: `${(b.top + jitter(9)).toFixed(2)}%`,
        size: `${(b.size * CONFIG.size).toFixed(2)}rem`,
        core: Math.min(1, Math.max(0, b.core * CONFIG.opacity)),
        dur: `${dur.toFixed(2)}s`,
        delay: `${delay.toFixed(2)}s`,
      };
    });
  }, []);

  return (
    <>
      {blobs.map((b, i) => (
        <div
          key={i}
          className="hero-blob"
          style={{
            left: b.left,
            top: b.top,
            width: b.size,
            height: b.size,
            opacity: Math.min(1, 0.85 * CONFIG.opacity),
            filter: `blur(${CONFIG.blur}px)`,
            background: `radial-gradient(circle at center, rgb(var(${b.token}) / ${b.core}), rgb(var(${b.token}) / 0) 68%)`,
            animation: `${b.anim} ${b.dur} ease-in-out ${b.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}
