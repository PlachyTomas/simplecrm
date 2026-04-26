import confetti from "canvas-confetti";

/**
 * Fire the standard win-celebration confetti burst. Origin defaults to the
 * bottom-center of the viewport; pass an HTMLElement to anchor it at that
 * element's center. Suppressed under `prefers-reduced-motion: reduce`.
 *
 * Tuned per the brief: tight spread, short particle life, off-the-shelf
 * scalar so the burst reads as celebration not as fireworks demo.
 */
export function celebrateWin(anchor?: HTMLElement | null): void {
  if (typeof window === "undefined") return;
  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (reducedMotion) return;

  const origin = anchorOrigin(anchor);
  void confetti({
    particleCount: 120,
    spread: 80,
    startVelocity: 38,
    ticks: 150,
    scalar: 0.9,
    origin,
    disableForReducedMotion: true,
    colors: ["#EC4899", "#F472B6", "#5B5BD6", "#A1A1AA"],
  });
}

function anchorOrigin(anchor: HTMLElement | null | undefined): { x: number; y: number } {
  if (!anchor) return { x: 0.5, y: 0.7 };
  const rect = anchor.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  return { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
}
