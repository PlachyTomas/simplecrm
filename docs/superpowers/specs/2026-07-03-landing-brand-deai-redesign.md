# Landing page & brand: kill the AI look

Date: 2026-07-03
Status: draft — design phase only, no implementation until the design file is approved
Owner: Tomáš + Claude (Fable 5)

## 1. Problem

The landing page (`frontend/src/marketing/LandingPage.tsx`) works, but it looks
like the median output of every AI coding tool in 2026. A prospect who has seen
three other AI-built SaaS pages this week will subconsciously file SimpleCRM
under "another vibe-coded tool" — which directly undercuts the pitch of a paid,
trustworthy CRM (99 Kč/user/month, GDPR, data in EU).

## 2. Evidence — the AI-look bingo card (current state audit)

Every item below is present today and every item is on the **blacklist** for
the redesign. There are **8** blacklisted tropes:

1. **Inter** as the only typeface (`tokens.css` `--font-sans`).
2. **Indigo accent** (`#818CF8` / `#6366F1`) — the default "AI SaaS blue-purple".
3. **Magenta/indigo radial glow blobs** behind the hero (`Hero()`, blur-3xl circles).
4. **✨ Sparkles lucide icon as the logo** (nav + footer).
5. **Uppercase `tracking-wider` eyebrow labels** above every section heading.
6. **Icon-in-tinted-rounded-square** feature cards (`Differentiators()`).
7. **Everything centered** — hero, section intros, CTA stack; no asymmetry anywhere.
8. **`rounded-lg border shadow-sm` card sameness** — cards, pricing, FAQ all
   the same generic container.

## 3. Goals

- A landing page a Czech sales manager remembers after closing the tab.
- A brand identity with a *story* we can extend into the app later (the app
  shell is out of scope for this task).
- Bold ≠ noisy: the page must still read as trustworthy for a paid B2B tool.

## Non-goals

- No copy rewrite (Czech texts stay as-is, including "CRM pro prodej. Nic víc,
  nic míň.").
- No route/section changes — Nav, Hero, Differentiators, ARES demo, HowItWorks,
  Reports demo, Calendar demo, Pricing, FAQ, Footer all survive.
- No accessibility regressions: contrast AA, focus-visible, drawer focus trap stay.
- No implementation in this task — design file first, code later.

## 4. Design directions (pick one at review)

### A. SUTNAR — recommended

Named after **Ladislav Sutnar**, the Czech pioneer of information design.
The story writes itself: a Czech CRM that treats sales data the way Sutnar
treated catalogs — ruthless clarity, bold functional color, numbers as heroes.

- **Palette:** warm paper `#FAF6EF`, ink `#141414`, **Sutnar red-orange
  `#E8420C`** as the single accent, cobalt `#1D4ED8` as a rare secondary.
  Dark theme = ink background, paper text, same red.
- **Type:** display **Bricolage Grotesque** (Google Fonts, Latin Ext — Czech
  diacritics OK) at heavy weights; body **Instrument Sans**; numbers/data in
  **IBM Plex Mono** (tabular). Inter is deleted, not demoted.
- **Layout:** left-aligned asymmetric hero on a visible 12-col grid with
  hairline rules; section numbers ("01 — Funkce") replace eyebrow labels.
- **Motif:** the 365-day company-release clock becomes the brand's visual
  signature — a circular countdown mark used as logo, favicon, and the hero
  illustration. No other CRM can copy that motif because no other CRM has
  the feature.
- **Cards:** flat, hairline 1px ink borders, no shadows, no rounded-lg —
  radius 2px max. Hover = red underline/rule, not shadow-md.

### B. BETON

Euro-brutalist: near-black + off-white, one signal color, oversized Space
Grotesk, thick 2px borders, hard offset shadows, marquee strip. Louder than A,
higher risk of feeling like a design-agency portfolio rather than a CRM.

### C. ATELIÉR

Warm editorial: Fraunces serif display, cream/terracotta, generous whitespace,
photography-friendly. Safest, but closest to "tasteful template" — weakest
answer to the actual complaint.

### D. CENOVKA — added at variant review round (2026-07-03 evening)

Price leadership as the identity: leaflet red `#E30613`, price-tag yellow
`#FFD400`, Anton display type, a printed-receipt hero visual comparing
SimpleCRM (99 Kč) against Raynet/Pipedrive, comparison table above the fold.
Voice: "schválně si to přepočítejte". ⚠️ The price-match guarantee copy in the
mock ("dorovnáme + měsíc zdarma") needs business sign-off before shipping;
competitor prices marked as of 07/2026 need verification.

**Variant round (requested after SUTNAR approval-in-principle):** each
direction now lives as a hero-level concept in its own file —
`design/landing-beton.pen`, `design/landing-atelier.pen`,
`design/landing-cenovka.pen` — alongside the full-fidelity SUTNAR master in
`design/landing-redesign.pen`. Winner gets built out to full fidelity and
becomes the app-wide direction.

## 5. Deliverable

A **`.pen` design file** at `design/landing-redesign.pen` containing:

1. **Brand board** — palette swatches, type scale, the 365 clock logo mark,
   spacing/grid rules.
2. **Hero, desktop 1440px** — full fidelity.
3. **Full landing, desktop** — all sections in the new system.
4. **Hero, mobile 390px** — nav drawer closed state.

Tooling note: `.pen` requires the Pencil MCP plugin. If Pencil is not
available in the session, fallback order is: (1) high-fidelity HTML mock in
`design/landing-redesign.html` rendered via Playwright screenshots, (2) Figma
via the Figma MCP. The deliverable format changes; the acceptance criteria do
not.

## 6. Acceptance criteria

- **Squint test:** a blurred screenshot of the new hero is distinguishable
  from a blurred screenshot of the current one and from a generic shadcn page.
- **Blacklist test:** zero of the 8 §2 tropes present.
- **Diacritics test:** all chosen fonts render `ěščřžýáíéůú` correctly at
  display sizes (check "Vyzkoušet zdarma", "Ceník", "Časté otázky").
- **Contrast:** all text AA on its background in both light and dark theme.
- **3-second test:** hero communicates "jednoduchý český CRM pro prodej"
  without scrolling.

## 7. Process

1. Design review of the `.pen`/mock file against §6 — Tomáš approves a direction.
2. Only then: implementation task (tokens.css rework + LandingPage restyle),
   spec'd separately.
