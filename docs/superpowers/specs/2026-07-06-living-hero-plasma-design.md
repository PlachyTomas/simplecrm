# Living hero plasma — design spec

**Date:** 2026-07-06
**Goal:** Replace the static "pulsing blob" hero background with a genuinely alive,
non-repeating field of color that moves, morphs, dies out and re-forms elsewhere.
Feel target: mold exploring / flocking flow. Must stay **subtle** (text dominates).

## Decisions (from brainstorming)

- **Technique:** originally a WebGL domain-warped noise shader. **Pivoted during
  implementation** to CSS-animated DOM blobs (see Implementation note) after the
  WebGL canvas silently fell back to a static gradient under React StrictMode.
- **Intensity:** subtle & alive — soft blur, moderate peak alpha, text stays dominant.

## Implementation note (what shipped)

A flock of six blurred radial-gradient `<div>` blobs, each animated by a CSS
`@keyframes` path that translates it across the hero (in `vw`/`vh`), scales it, and
fades it in then out. Because each blob is invisible at its loop seam, the restart
reads as dying and being reborn elsewhere. `mix-blend-mode: screen` (dark) / `multiply`
(light) blends the glows with the page; colours come from `--color-accent-rgb` /
`--color-brand-accent-rgb` so both themes work. `prefers-reduced-motion` freezes them.
Chosen over WebGL because pure DOM cannot silently fall back to a static frame and its
motion is trivially verifiable (compare each blob's computed transform over time).

## Why the old approach felt static

Four blurred divs, each looping `translate→scale→fade` back to `translate(0,0)`. Every
blob was reborn in the *same* spot → reads as pulsing in place. No interaction between
blobs. Fixed 22–34s loops are predictable.

## Component: `src/marketing/HeroPlasma.tsx`

Single `<canvas aria-hidden>` filling the existing masked hero-background container.

- **Shader:** domain-warp `p → q=fbm(p) → r=fbm(p+q) → f=fbm(p+r)`. `f` drives color
  (indigo `--color-accent` ↔ magenta `--color-brand-accent`) and alpha via a soft
  threshold → distinct splashes with transparent gaps (the "reborn elsewhere" read).
- **Brand placement:** positional bias keeps indigo pooling bottom-left, magenta
  top-right, perturbed by the noise.
- **Readability:** alpha eased down toward the centre so headline text keeps contrast.
- **Colors:** read `--color-accent-rgb` / `--color-brand-accent-rgb` (space-separated
  triples) via `getComputedStyle` → uniforms; re-read on `[data-theme]` change
  (MutationObserver) so light/dark both look right.
- **Perf:** internal render at ~0.5× resolution + CSS blur (cheap, soft, hides
  pixelation). `requestAnimationFrame`, paused when scrolled offscreen
  (IntersectionObserver) and when tab hidden (visibilitychange).
- **Reduced motion:** `prefers-reduced-motion: reduce` → paint one static frame, no loop.
- **Fallback:** `getContext("webgl")` null/throws (jsdom test env or unsupported
  browser) → render a static CSS dual-radial-gradient div in the brand colors.

## Edits

- `LandingPage.tsx`: swap the four `animate-hero-mold-*` divs for `<HeroPlasma />`
  inside the existing vertical-mask container.
- `index.css`: remove the now-dead `hero-mold-*` keyframes/classes + reduced-motion block.

## Verification

- `landing.test.tsx` stays green (fallback path handles no-WebGL jsdom).
- Frontend CI gate: lint, typecheck, format, test, build.
- Playwright: screenshot landing at two timestamps to prove it renders **and** moves;
  console checked for WebGL errors.

## Iteration

Art is judged by seeing it. After the prototype renders, tune with the user:
time scale, saturation/peak alpha, blob scale (noise frequency), contrast, center falloff.
