---
name: simplecrm-ui-design
description: Concrete UI design rules for SimpleCRM. Load this skill whenever writing or reviewing frontend code that produces visible UI — screens, components, marketing sections, emails, error pages, loading states. Covers the design token system for both dark (default) and light themes, component rules, density, color semantics (when to use electric blue vs neon lime), motion, responsive behavior, and anti-patterns.
---

# SimpleCRM UI Design — Concrete Rules

SimpleCRM's look: **confident, modern, slightly electric**. Inspired by premium dark-mode product apps (Linear, Arc, Tesla's product UIs) adapted to a Czech B2B sales context. Dark is default because the product is for people staring at it all day; light is provided for those who prefer it.

The product is a working tool, not a flashy demo. Every visual choice should serve data legibility, interaction speed, or brand personality — ideally at least two of those.

---

## 1. Aesthetic anchors

When in doubt, imagine the page sitting next to these references:
- **Linear** — ruthless alignment, restrained color, meaningful micro-animation.
- **Arc browser** — playful electric accents against quiet surfaces.
- **Pipedrive** — dense sales data made legible.
- **Tesla app** — confident black + accent combinations, big numbers, map aesthetics.

It must **not** look like:
- A generic shadcn demo (use shadcn as foundation, but tune tokens and spacing).
- A crypto dashboard (no gradient overload).
- A corporate SaaS (no baby blue, no rounded cartoon illustrations).
- A Notion clone (we are denser and more decisive).

---

## 2. Design tokens — both themes

All tokens live in `frontend/src/theme/tokens.css`. Components reference semantic tokens only. **Never hardcode colors, font sizes, spacing, or radii in component files.**

### 2.1 Dark theme (default)

```css
:root,
:root[data-theme="dark"] {
  /* Surfaces — going from lowest to most elevated */
  --color-bg: #0A0A0B;                 /* page background, just off pure black */
  --color-surface: #141416;            /* cards, sidebar */
  --color-surface-elevated: #1C1C20;   /* modals, popovers, hovered cards */
  --color-surface-overlay: #26262B;    /* nested elevation, input backgrounds */

  /* Borders */
  --color-border: #26262B;             /* default separators */
  --color-border-strong: #3A3A42;      /* emphasized borders */
  --color-border-subtle: #1C1C20;      /* barely-there dividers */

  /* Text */
  --color-text-primary: #F5F5F7;       /* headings, critical numbers */
  --color-text-secondary: #A8A8B3;     /* body text, labels */
  --color-text-tertiary: #6B6B76;      /* captions, metadata, disabled */
  --color-text-on-accent: #0A0A0B;     /* text on top of accent-primary or lime */

  /* Accent — Electric Blue (PRIMARY INTERACTIVE) */
  --color-accent: #3D5AFE;
  --color-accent-hover: #5470FF;
  --color-accent-active: #2F47E5;
  --color-accent-subtle: rgba(61, 90, 254, 0.12);   /* backgrounds for selected states */
  --color-accent-border: rgba(61, 90, 254, 0.3);

  /* Highlight — Neon Lime (RESERVED for wins, success highlights, brand moments) */
  --color-highlight: #C9F24E;
  --color-highlight-hover: #D6FF5E;
  --color-highlight-subtle: rgba(201, 242, 78, 0.12);
  --color-highlight-border: rgba(201, 242, 78, 0.3);

  /* Semantic */
  --color-success: #10B981;
  --color-success-subtle: rgba(16, 185, 129, 0.12);
  --color-warning: #F59E0B;
  --color-warning-subtle: rgba(245, 158, 11, 0.12);
  --color-danger: #EF4444;
  --color-danger-subtle: rgba(239, 68, 68, 0.12);
  --color-info: #3D5AFE;
  --color-info-subtle: rgba(61, 90, 254, 0.12);

  /* Shadows — on dark, use pure-black shadows slightly diffused */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.5);

  /* Rings (focus) — always accent, 2px, 2px offset from target */
  --ring-color: var(--color-accent);
  --ring-offset: var(--color-bg);
}
```

### 2.2 Light theme

```css
:root[data-theme="light"] {
  /* Surfaces — warm off-white, not clinical pure-white */
  --color-bg: #FAFAFB;
  --color-surface: #FFFFFF;
  --color-surface-elevated: #FFFFFF;
  --color-surface-overlay: #F4F4F6;

  /* Borders */
  --color-border: #E8E8EC;
  --color-border-strong: #D4D4DA;
  --color-border-subtle: #F0F0F3;

  /* Text */
  --color-text-primary: #0A0A0B;
  --color-text-secondary: #4A4A55;
  --color-text-tertiary: #8A8A95;
  --color-text-on-accent: #FFFFFF;     /* white text on blue fill */

  /* Accent — Electric Blue, slightly darkened for light-bg contrast */
  --color-accent: #2F47E5;
  --color-accent-hover: #3D5AFE;
  --color-accent-active: #243BC4;
  --color-accent-subtle: rgba(47, 71, 229, 0.08);
  --color-accent-border: rgba(47, 71, 229, 0.25);

  /* Highlight — Neon Lime.
     Critical rule for light mode: lime must NEVER appear as text or thin strokes
     on a white background — contrast is terrible. It appears ONLY as a fill,
     always with dark text on top. See Section 4 for usage rules. */
  --color-highlight: #C9F24E;
  --color-highlight-hover: #D6FF5E;
  --color-highlight-subtle: rgba(201, 242, 78, 0.2);
  --color-highlight-border: #A8D03A;    /* darker, for border use on white */

  /* Semantic */
  --color-success: #059669;
  --color-success-subtle: rgba(5, 150, 105, 0.08);
  --color-warning: #D97706;
  --color-warning-subtle: rgba(217, 119, 6, 0.08);
  --color-danger: #DC2626;
  --color-danger-subtle: rgba(220, 38, 38, 0.08);
  --color-info: #2F47E5;
  --color-info-subtle: rgba(47, 71, 229, 0.08);

  /* Shadows — tinted, softer than pure black for warmth */
  --shadow-sm: 0 1px 2px rgba(15, 15, 20, 0.06);
  --shadow-md: 0 4px 12px rgba(15, 15, 20, 0.08);
  --shadow-lg: 0 12px 32px rgba(15, 15, 20, 0.1);

  --ring-color: var(--color-accent);
  --ring-offset: var(--color-bg);
}
```

### 2.3 Shared tokens (theme-independent)

```css
:root {
  /* Spacing scale — USE ONLY THESE VALUES */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* Radii */
  --radius-sm: 6px;    /* inputs, small badges */
  --radius-md: 10px;   /* buttons, cards */
  --radius-lg: 14px;   /* modals, large cards */
  --radius-xl: 20px;   /* hero elements, feature cards on landing */
  --radius-full: 9999px;

  /* Typography scale — USE ONLY THESE SIZES */
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;
  --font-size-3xl: 30px;
  --font-size-4xl: 36px;
  --font-size-5xl: 48px;
  --font-size-6xl: 64px;   /* marketing hero only */

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  --line-height-tight: 1.2;      /* headings */
  --line-height-snug: 1.35;      /* subheadings */
  --line-height-normal: 1.5;     /* body */

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Motion durations */
  --duration-instant: 100ms;     /* press feedback */
  --duration-fast: 150ms;        /* hover, focus */
  --duration-base: 250ms;        /* modals, dropdowns, tab switches */
  --duration-slow: 400ms;        /* page-level transitions (use sparingly) */

  /* Easing */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);        /* entries */
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);         /* exits */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);    /* state swaps */
}
```

### 2.4 Tailwind wiring

Extend `tailwind.config.ts` to map semantic utilities to these variables:

```ts
theme: {
  extend: {
    colors: {
      bg: 'var(--color-bg)',
      surface: {
        DEFAULT: 'var(--color-surface)',
        elevated: 'var(--color-surface-elevated)',
        overlay: 'var(--color-surface-overlay)',
      },
      border: {
        DEFAULT: 'var(--color-border)',
        strong: 'var(--color-border-strong)',
        subtle: 'var(--color-border-subtle)',
      },
      text: {
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary: 'var(--color-text-tertiary)',
        'on-accent': 'var(--color-text-on-accent)',
      },
      accent: {
        DEFAULT: 'var(--color-accent)',
        hover: 'var(--color-accent-hover)',
        active: 'var(--color-accent-active)',
        subtle: 'var(--color-accent-subtle)',
      },
      highlight: {
        DEFAULT: 'var(--color-highlight)',
        hover: 'var(--color-highlight-hover)',
        subtle: 'var(--color-highlight-subtle)',
      },
      success: { DEFAULT: 'var(--color-success)', subtle: 'var(--color-success-subtle)' },
      warning: { DEFAULT: 'var(--color-warning)', subtle: 'var(--color-warning-subtle)' },
      danger:  { DEFAULT: 'var(--color-danger)',  subtle: 'var(--color-danger-subtle)' },
    },
  },
}
```

Disable Tailwind's default color palette in classnames via an eslint rule or code review — **only** the mapped semantic colors are allowed in application code.

### 2.5 Theme switching

- Default: `dark`.
- Respect `prefers-color-scheme` on first visit; persist user choice in `localStorage['simplecrm-theme']`.
- Apply via `data-theme` attribute on `<html>`.
- Ship a theme toggle in the user menu (bottom of sidebar) and in the landing page nav. Icons: sun/moon.
- Transitions when switching: add `transition-colors duration-base` on `body` so the swap is smooth, not jarring.

---

## 3. Typography rules

### 3.1 Font usage
- **Body + UI**: Inter, weight 400 for body / 500 for labels and buttons / 600 for emphasized labels / 700 only for large display text.
- **Numbers in tables, IČO, DIČ, currency when shown in dense data**: `font-variant-numeric: tabular-nums` so columns align.
- **Monospace (JetBrains Mono)**: only for IČO/DIČ inline, code snippets in docs, copy-able IDs. Never for body.

### 3.2 Hierarchy examples

| Use case | Size | Weight | Color |
|---|---|---|---|
| Page title (app) | 24 | 600 | primary |
| Page title (marketing hero) | 48–64 | 700 | primary |
| Section heading | 20 | 600 | primary |
| Card title | 16 | 600 | primary |
| Body | 14–16 | 400 | secondary |
| Label above input | 13 | 500 | secondary |
| Helper/metadata | 12 | 400 | tertiary |
| KPI number | 30–36 | 700 | primary |
| Button text | 14 | 500 | contextual |

### 3.3 Forbidden
- Never use font-size 10, 11, 13, 15, 17, 19, 22, 26, 28 (off-scale).
- Never use font-weight 800 or 900 (too aggressive against our light backgrounds).
- Never italicize UI chrome. Italic is reserved for inline quotes or emphasis in body copy.
- Never use `text-transform: uppercase` on strings longer than ~10 characters. Small uppercase labels are fine ("AKTIVNÍ", "UVOLNĚNO"); paragraph uppercase is shouting.

---

## 4. Color semantics — the rule that keeps the aesthetic consistent

The brand has two accents with distinct jobs. **Mixing them up is the single fastest way to make the app look amateurish.**

### 4.1 Electric Blue (`--color-accent`) — PRIMARY INTERACTIVE
Used for anything the user clicks, focuses, or selects as the primary path forward.

- Primary buttons
- Links
- Active navigation item (sidebar, tabs)
- Focus rings
- Selected row/card outlines
- Progress bars (pipeline fill)
- Info toasts
- Checkbox and radio checked states
- Slider tracks and handles

Use confidently — blue is workhorse, not special.

### 4.2 Neon Lime (`--color-highlight`) — WIN + BRAND MOMENT
Used sparingly for: moments of accomplishment, brand identity expressions, and rare high-priority highlights. **It should feel like a hit of dopamine when it appears.**

Appropriate:
- "Označit jako vyhráno" button (or "won" confirmation)
- Won-deal indicators (badge on card, row highlight on leaderboard #1)
- Success confetti/celebration on first successful company save via ARES
- Logo mark
- "Most popular" or "Doporučujeme" badge on pricing (if multiple tiers are added later)
- Sparkline trend going up in the user's favor on a dashboard
- Hero accent element on landing page (e.g., underline on one key word)

**Never** use lime for:
- Ordinary primary buttons
- Navigation
- Links
- Generic success toasts (use green `--color-success` for those — lime is stronger, reserved for wins specifically)
- Selection states
- Form validation success (use green)
- Body text, headings, or anything that appears in blocks of text (contrast fails on white)

**Light mode lime rule**: lime in light mode must always be a background fill with dark text on top, or a border against a tinted subtle fill. Never lime text on white. Never lime 1px borders on white (they disappear).

### 4.3 Semantic colors
Standard meanings:
- **Success (green)** — generic positive confirmations (saved, sent, updated), positive numeric trends not related to closing deals.
- **Warning (orange)** — firms approaching the 1-year freeing threshold at < 30 days; non-blocking validation issues; unsaved-changes indicators.
- **Danger (red)** — firms at < 7 days to freeing; destructive action confirmations; failed validation; error toasts; deactivation warnings.
- **Info (blue, same as accent)** — neutral informational callouts.

### 4.4 Ratios on a typical screen
A healthy dashboard has roughly:
- 80% neutral surfaces + text
- 10% accent blue (buttons, active nav, selected state)
- 5% semantic colors as needed
- ≤ 5% lime (one or two elements max — a logo mark, a leaderboard-leader badge)

If a screen looks like a Christmas tree, lime is probably overused.

---

## 5. Component rules

### 5.1 Buttons

| Variant | Use | Style |
|---|---|---|
| `primary` | Main action of a form or card | `bg-accent text-text-on-accent` hover: `bg-accent-hover` |
| `secondary` | Alternative action, cancel-in-pair | `bg-surface-overlay text-text-primary border border-border` hover: `bg-surface-elevated` |
| `ghost` | Tertiary, inline, nav-like | `bg-transparent text-text-secondary` hover: `bg-surface-overlay text-text-primary` |
| `destructive` | Delete, deactivate | `bg-danger text-white` hover: slightly darker |
| `win` | "Mark as won" | `bg-highlight text-text-on-accent` (dark text) hover: `bg-highlight-hover` |

Sizes: `sm` (h-32px, px-12), `md` (h-40px, px-16, **default**), `lg` (h-48px, px-20). Icon-only buttons are square at each size.

Every button must have: `transition-colors duration-fast`, visible focus ring (`ring-2 ring-offset-2 ring-accent`), and a disabled state at 40% opacity with `cursor-not-allowed`.

### 5.2 Inputs
- Background: `surface-overlay`
- Border: 1px `border`
- Focus: border becomes `accent`, ring-2 ring-accent/40
- Radius: `md`
- Height: 40px (matches button `md`)
- Padding: 12px horizontal
- Placeholder: `text-tertiary`
- Error state: border `danger`, helper text `danger`
- Label above input: 13/500/secondary, `space-2` gap to input
- Helper/error text below: 12/regular, `space-1` gap to input

### 5.3 Cards
- Background: `surface`
- Border: 1px `border` (dark mode) / **no border but shadow-sm** (light mode)
- Radius: `lg`
- Padding: `space-5` to `space-6` depending on density
- Hover (if interactive): `bg-surface-elevated` + `shadow-md` + `translate-y-[-1px]`, transition `duration-fast`

### 5.4 Tables
- Dense mode by default: row height 44px, cell padding `space-3` horizontal
- Comfortable mode: row height 56px, cell padding `space-4` horizontal
- Header: `text-tertiary` 12/500, uppercase, letter-spacing 0.05em, `border-b border-border`
- Row: `border-b border-subtle`; no zebra striping; hover `bg-surface-overlay`
- Selected row: left 2px border in `accent`, `bg-accent-subtle`
- Sort indicators: small chevron, visible only on active-sorted column + on hover
- Sticky header when vertical scroll

### 5.5 Badges / pills
Shape: `radius-full`, padding 2px 10px, font 12/500.
- Neutral: `bg-surface-overlay text-text-secondary`
- Accent: `bg-accent-subtle text-accent`
- Success: `bg-success-subtle text-success`
- Warning: `bg-warning-subtle text-warning`
- Danger: `bg-danger-subtle text-danger`
- Win (rare): `bg-highlight text-text-on-accent` — solid fill

Pipeline stage badges use the stage's configured color as `-subtle` background plus the full color text.

### 5.6 Modals
- Width: 480px (small), 640px (medium), 800px (large). Never wider than 800 without explicit reason.
- Background: `surface-elevated`
- Radius: `lg`
- Padding: `space-6`
- Backdrop: `rgba(0, 0, 0, 0.6)` dark / `rgba(15, 15, 20, 0.4)` light
- Animation: backdrop fades (duration-base), panel scales from 0.96 + fades (duration-base, ease-out)
- Close with: X button top-right, Escape key, backdrop click
- Focus trap inside, return focus to trigger on close

### 5.7 Toasts
- Position: top-right, 24px margin, stack with 8px gap
- Width: 360px max
- Duration: 4s for info/success, 6s for warning, sticky for danger until dismissed
- Slide in from right (`duration-base ease-out`), fade out (`duration-fast ease-in`)
- Icon on the left, message, optional action link on the right, close X
- Variant uses the semantic subtle background + matching colored left border (3px)

### 5.8 Avatars
- Circle, radius-full
- Sizes: 24 (xs, inline mentions), 32 (sm, table rows), 40 (md, default), 56 (lg, profile header), 80 (xl, profile page)
- Fallback: initials on a deterministic background color derived from the user's name (use a simple hash → 1-of-8 palette; not the accent colors)
- Online indicator: 8px dot bottom-right, success color, 2px ring in current surface color

### 5.9 Empty states
- Center-aligned in the available space
- Simple line-art illustration (use undraw.co or Blush, re-color to use `text-tertiary` as line color)
- Headline: 18/600/primary (Czech, warm, specific — "Zatím tu nic není. Přidejte první firmu.")
- Subtext: 14/regular/secondary, one sentence
- Primary CTA button
- Never use stock corporate "No data available" text

### 5.10 Loading states
- **Skeletons, not spinners**, for content that's about to appear. Use `bg-surface-overlay` with a subtle shimmer (animated gradient, 1.5s loop).
- **Spinners** only for: button processing state (inline, same size as text), full-page app boot, explicit "refreshing" actions.
- **No spinners for page navigation** — use instant-transition + skeleton.

### 5.11 Trial and billing UI
The pricing model is: 30-day free trial (full features), then 99 Kč/user/month. These UI states must feel **fair and respectful**, not dark-pattern-y.

**Trial active indicator** (visible throughout the trial):
- Small badge in the sidebar footer or top bar: "Zkušební verze · 23 dní zbývá"
- Color: `text-tertiary` when > 7 days remain. `warning` when ≤ 7 days. `danger` when ≤ 3 days.
- Links to the billing/subscription page on click.
- Never intrusive — no modal pop-ups reminding users to pay during the trial period. The badge is sufficient.

**Trial expired gate** (blocks CRM access after 30 days):
- Full-screen centered card (not a modal — the entire app route renders this instead of the normal content).
- Headline: "Vaše zkušební doba skončila" (24/600/primary).
- Subtext: "Pokračujte za 99 Kč/uživatel/měsíc. Vaše data zůstanou v bezpečí." (16/regular/secondary).
- Two buttons: "Přejít na předplatné" (primary, accent) and "Exportovat data" (ghost — users must always be able to get their data out).
- Below: small text "Máte otázky? Napište nám na podpora@simplecrm.cz"
- Background: standard `bg` with the app shell visible but blurred behind the card.
- **Never delete data** when a trial expires. The data persists; only access is blocked.

**Billing summary card** (on settings/user-management page):
- Current plan name and status (trial / active / expired)
- User count: "X uživatelů × 99 Kč = Y Kč/měsíc" — values read from the Plan table config, never hardcoded.
- Format currency with `Intl.NumberFormat` using the org's locale and currency.
- If trial: show days remaining with a progress bar (accent color filling, empty portion is surface-overlay).

### 5.12 Number and currency formatting
- **Always** use `Intl.NumberFormat(orgLocale, { style: 'currency', currency: orgCurrency })` for monetary values.
- **Always** use `Intl.DateTimeFormat(orgLocale)` for dates.
- **Never** hardcode `Kč` suffix, space-separated thousands, or Czech date patterns like `12. 3. 2026` manually. Let `Intl` handle it — the org's locale and currency come from the API.
- For tabular numbers (table columns, KPI cards), always add `font-variant-numeric: tabular-nums` so columns align.

---

## 6. Density and layout rules

### 6.1 Page frame
- Max content width: 1440px, centered.
- Sidebar: 240px expanded, 64px collapsed. Sticky.
- Top bar: 64px tall, sticky.
- Main content padding: `space-8` (32px) on desktop, `space-4` (16px) on mobile.

### 6.2 Dashboards
- 12-column grid with `space-4` gap
- KPI cards span 3 columns each (4 across) on desktop, 6 (2 across) on tablet, 12 (stacked) on mobile
- Chart cards span 6 or 12 columns
- `space-6` vertical rhythm between major sections

### 6.3 Data-dense views (tables, Kanban)
- Breathing room trumps cramming — a row that's too tall is better than one too short to read comfortably.
- Never more than 7 columns visible without horizontal scroll; hide overflow behind a column-visibility menu.
- Kanban column width: 300–320px. Card inner padding `space-3` to `space-4`.

### 6.4 Forms
- Single column by default.
- Two columns only when: fields are obviously paired (first name / last name, IČO / DIČ, from / to).
- `space-5` vertical rhythm between field groups, `space-3` within a group.

### 6.5 Responsive breakpoints
- `sm: 640px` — phones, large
- `md: 768px` — tablets portrait
- `lg: 1024px` — tablets landscape / small laptop
- `xl: 1280px` — desktop
- `2xl: 1440px` — large desktop

Every screen tested at 390, 768, and 1280. On mobile:
- Sidebar → bottom tab bar with 5 items
- Tables → stacked cards
- Kanban → horizontally scrollable, one column visible at a time with snap
- Modals → full-screen sheets
- Touch targets ≥ 44×44

---

## 7. Motion guidelines

Motion should feel **quick, decisive, and never block the user**. Default to simple fades and translations; avoid bouncy spring animations.

- **Hover / focus**: 150ms, property transitions (color, background, border).
- **Modal open**: backdrop fades 250ms; panel fades + scales from 0.96 to 1.0 in 250ms with ease-out.
- **Modal close**: 150ms, ease-in.
- **Dropdown / popover**: 150ms fade + 4px slide from anchor direction.
- **Tab switch**: instant content swap; underline slides 200ms ease-in-out.
- **Stage drag (Kanban)**: card lifts (shadow-lg + scale 1.02) in 100ms, drops in 200ms ease-out.
- **Number counters on dashboards**: count up from 0 to target value over 600ms, ease-out, on first mount only. Not on every re-render.
- **Toast slide-in**: 250ms ease-out from right.

**Never**:
- Attention-seeking pulses or blinks
- Animations longer than 500ms outside of number counters and first-mount effects
- Bounce easings (`cubic-bezier(0.68, -0.55, 0.265, 1.55)` and friends)
- Parallax on the landing page
- Auto-playing carousels

Always respect `prefers-reduced-motion: reduce` — reduce all motion to 0ms duration except essential state transitions (modal open/close at 100ms fades only).

---

## 8. Iconography

- **Library**: Lucide React, exclusively.
- **Sizes**: 14 (inline with sm text), 16 (inline with base text, **default**), 20 (buttons, nav), 24 (feature cards, empty states).
- **Stroke**: 1.75 (the Lucide default is 2; 1.75 reads as slightly more refined).
- **Color**: inherits `currentColor` — set via `text-*` class.
- Never mix icon libraries. If an icon is missing from Lucide, draw an inline SVG in the same stroke style.

---

## 9. Illustrations and imagery

- Empty-state illustrations: line-art, monochromatic, using `text-tertiary` as stroke. Source: undraw.co (set theme color to match) or custom-drawn.
- Landing page visuals: real mock screenshots of the app, not generic stock illustrations. If a screenshot can't be produced yet, use a stylized device frame with a gradient placeholder.
- **Never use stock photography of smiling business people.**
- **Never use AI-generated images** with the typical over-polished gradient style.

---

## 10. Accessibility — non-negotiable baseline

- Contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI chrome. Verify in both themes.
- Every interactive element reachable by keyboard.
- Visible focus indicator on every focusable element (the ring tokens above).
- All form inputs have associated `<label>`. Placeholder is not a label.
- Images have meaningful `alt` or `alt=""` if decorative.
- Icon-only buttons have `aria-label` in Czech.
- Toasts with `role="status"` for success/info, `role="alert"` for errors.
- Color is never the sole conveyor of state — always paired with icon or text (e.g., a red border also carries an error icon and error message).
- Skip link "Přeskočit na obsah" at top of every page, becomes visible on focus.

---

## 11. Czech language and copy voice

- Tone: confident, warm, slightly playful. Never corporate-stiff. Never cutesy.
- Use **vykání** (formal "you" — "Vaše firmy", not "Tvoje firmy") throughout the app.
- Button verbs are always imperative: "Uložit", "Přidat firmu", "Označit jako vyhráno". Not "Uložení".
- Errors are human, not system-voice: "Tuhle firmu jsme nenašli v ARES. Zkuste zkontrolovat IČO." — not "Chyba: Entity not found in ARES database (404)."
- Numbers and currency: always formatted via `Intl.NumberFormat` and `Intl.DateTimeFormat` with the organization's locale and currency. Never hardcode "Kč" suffix, manually insert non-breaking spaces, or hand-format Czech date patterns. The formatters handle it correctly for any locale.
- Don't mix Czech and English in the UI. "Dashboard" is fine (loan word in Czech tech vernacular), but "Sign in" is not — use "Přihlásit se".

---

## 12. Anti-patterns — do not do any of these

- **Do not** import a color from Tailwind's default palette (`bg-blue-500`, `text-gray-400`) in application code. Always use semantic tokens.
- **Do not** hardcode hex codes in component files.
- **Do not** use inline `style={{ color: '#...' }}` for anything that should be themed.
- **Do not** nest shadcn components five levels deep when a custom component would be clearer.
- **Do not** use gradients on surfaces. Gradients are allowed only on: the landing page hero glow, charts, and the loading-skeleton shimmer. That's it.
- **Do not** use pure black (`#000000`) or pure white (`#FFFFFF`) anywhere — always use the token values.
- **Do not** add `border-radius` on the outermost page container. Cards yes, pages no.
- **Do not** use three or more font weights on the same screen. Usually 400 + 500 + 600 is plenty; 700 is for display contexts only.
- **Do not** use more than two accent colors in a single component.
- **Do not** animate on scroll (parallax, reveal-on-scroll) except for one subtle fade-in on landing page sections.
- **Do not** render numbers without `tabular-nums` in tables or dashboards — columns will wiggle.
- **Do not** place primary and destructive buttons next to each other. Destructive goes in a separate area or behind a menu.
- **Do not** hardcode currency symbols (`Kč`, `€`, `$`), thousands separators, or date format strings anywhere in the frontend. Always use `Intl.NumberFormat` / `Intl.DateTimeFormat` with the org's locale and currency from the API.

---

## 13. Quick self-audit before submitting UI code

Before handing a task back for review, check:

1. Does this look right in both dark and light modes? (Toggle and eyeball both.)
2. Does this look right at 390px width?
3. Are all colors semantic tokens? (Grep for `#`, `rgb(`, `bg-gray-`, `bg-blue-` in changed files.)
4. Are all sizes from the spacing/font scale? (No `p-[13px]`, no `text-[15px]`.)
5. Is there a focus-visible state on every interactive element?
6. Does the Czech copy use vykání and feel human?
7. Is lime used for fewer than 3 distinct elements on this screen?
8. Are there empty, loading, and error states for every data-dependent section?
9. Does `prefers-reduced-motion` mute the animations?
10. Are all currency/number/date values formatted via `Intl` with org locale — no hardcoded `Kč` or manual date patterns? (Grep for `Kč`, `.toLocaleDateString()` without params.)
11. If this screen shows money or plan info, does it read from the Plan config / org settings, not hardcoded `99` or `199`?
12. Does this feel like it belongs in the same product as the last screen you built?

If any answer is no, fix before dispatching.

---

## Reference implementation examples

When introducing a new component category, consult these as templates (to be created during Phase 0 and extended throughout):
- `frontend/src/components/ui/button.tsx` — canonical variant setup
- `frontend/src/components/ui/card.tsx` — card with hover
- `frontend/src/components/ui/badge.tsx` — all semantic variants
- `frontend/src/components/ui/input.tsx` — with label + error states
- `frontend/src/app/dashboard/kpi-card.tsx` — first dashboard card built; model all others after it

When in doubt, look at the last good screen built and mirror its patterns.
