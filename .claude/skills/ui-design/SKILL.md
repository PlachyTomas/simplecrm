---
name: simplecrm-ui-design
description: Concrete UI design rules for SimpleCRM. Load this skill whenever writing or reviewing frontend code that produces visible UI — screens, components, marketing sections, emails, error pages, loading states. Covers the design token system for both dark (default) and light themes, component rules, density, color semantics (when to use the indigo accent vs the magenta brand accent), motion, responsive behavior, and anti-patterns.
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

All tokens live in `frontend/src/theme/tokens.css`. Components reference semantic tokens only (through the Tailwind utilities in §2.4). **Never hardcode colors, font sizes, spacing, or radii in component files** — the one legitimate exception is data-driven colors (pipeline-stage colors, team colors) passed as inline `style` because they come from the API, not the theme.

### 2.0 Color storage convention

Each base color is stored as a space-separated RGB triple and exposed twice:

```css
--color-x-rgb: <r> <g> <b>;             /* canonical channels */
--color-x:     rgb(var(--color-x-rgb)); /* convenience alias, valid CSS color */
```

The `-rgb` triple is what `tailwind.config.ts` feeds into `rgb(var(--color-x-rgb) / <alpha-value>)`, so utilities like `bg-bg/80` or `border-danger/40` produce a real translucent color. The plain `--color-x` alias is for direct CSS / inline-style use. The `*-subtle` and `*-border` tokens are already-translucent composite washes — apply them as-is (`bg-accent-subtle`); do **not** chain a further `/<alpha>` onto them.

### 2.1 Dark theme (default)

```css
:root,
:root[data-theme="dark"] {
  --color-bg-rgb: 10 10 11;                 /* page background, just off pure black */
  --color-surface-rgb: 20 20 22;            /* cards, sidebar */
  --color-surface-elevated-rgb: 28 28 32;   /* popovers, toasts, hovered cards */
  --color-surface-overlay-rgb: 38 38 43;    /* nested elevation, input backgrounds */

  --color-border-rgb: 38 38 43;             /* default separators */
  --color-border-strong-rgb: 58 58 66;      /* emphasized borders */
  --color-border-subtle-rgb: 28 28 32;      /* barely-there dividers */

  --color-text-primary-rgb: 245 245 247;    /* headings, critical numbers */
  --color-text-secondary-rgb: 168 168 179;  /* body text, labels */
  --color-text-tertiary-rgb: 144 144 160;   /* captions, metadata — AA-bumped */
  --color-text-on-accent-rgb: 10 10 11;     /* near-black text on the indigo accent */
  --color-text-on-brand-accent-rgb: 10 10 11; /* near-black text on magenta — never white */

  /* Accent — indigo (Radix iris-9 #5B5BD6 base; lightened to indigo-400
     #818CF8 in dark mode). PRIMARY INTERACTIVE. */
  --color-accent-rgb: 129 140 248;          /* #818CF8 */
  --color-accent-hover-rgb: 165 180 252;    /* #A5B4FC */
  --color-accent-active-rgb: 99 102 241;    /* #6366F1 */
  --color-accent-subtle: rgb(var(--color-accent-rgb) / 0.16);
  --color-accent-border: rgb(var(--color-accent-rgb) / 0.32);

  /* Brand accent — magenta #EC4899. Celebration / win / logo only. */
  --color-brand-accent-rgb: 236 72 153;
  --color-brand-accent-hover-rgb: 244 114 182;
  --color-brand-accent-subtle: rgb(var(--color-brand-accent-rgb) / 0.12);
  --color-brand-accent-border: rgb(var(--color-brand-accent-rgb) / 0.32);

  /* Win — alias of brand-accent for celebration cues. */
  --color-win-rgb: 236 72 153;
  --color-win-subtle: rgb(var(--color-win-rgb) / 0.12);

  /* Lime is RETIRED. `--color-highlight*` survives only as an alias of the
     magenta brand-accent so leftover `bg-highlight*` callsites flip to magenta
     until they're audited per-screen. */
  --color-highlight-rgb: var(--color-brand-accent-rgb);
  --color-highlight: var(--color-brand-accent);
  --color-highlight-hover: var(--color-brand-accent-hover);
  --color-highlight-subtle: var(--color-brand-accent-subtle);
  --color-highlight-border: var(--color-brand-accent-border);

  --color-success-rgb: 16 185 129;          /* #10B981 */
  --color-warning-rgb: 245 158 11;          /* #F59E0B */
  --color-danger-rgb: 220 38 38;            /* #DC2626 — pure red, kept distinct from magenta */
  --color-info-rgb: 56 189 248;             /* #38BDF8 — cyan, distinct from the indigo accent */
  --color-success-subtle: rgb(var(--color-success-rgb) / 0.16);
  --color-warning-subtle: rgb(var(--color-warning-rgb) / 0.16);
  --color-danger-subtle: rgb(var(--color-danger-rgb) / 0.16);
  --color-info-subtle: rgb(var(--color-info-rgb) / 0.16);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.5);

  --ring-color: var(--color-accent);
  --ring-offset: var(--color-bg);
}
```

### 2.2 Light theme

```css
:root[data-theme="light"] {
  --color-bg-rgb: 250 250 251;              /* warm off-white, not clinical pure-white */
  --color-surface-rgb: 255 255 255;
  --color-surface-elevated-rgb: 255 255 255;
  --color-surface-overlay-rgb: 244 244 246;

  --color-border-rgb: 232 232 236;
  --color-border-strong-rgb: 212 212 218;
  --color-border-subtle-rgb: 240 240 243;

  --color-text-primary-rgb: 10 10 11;
  --color-text-secondary-rgb: 74 74 85;
  --color-text-tertiary-rgb: 90 90 101;     /* AA-bumped from #8a8a95 */
  --color-text-on-accent-rgb: 255 255 255;  /* white text on the darkened indigo */
  --color-text-on-brand-accent-rgb: 10 10 11; /* near-black on magenta — never white */

  /* Accent — Radix iris-9 #5B5BD6, slightly darkened for AA on warm-white. */
  --color-accent-rgb: 91 91 214;            /* #5B5BD6 */
  --color-accent-hover-rgb: 110 110 232;
  --color-accent-active-rgb: 72 72 191;
  --color-accent-subtle: rgb(var(--color-accent-rgb) / 0.1);
  --color-accent-border: rgb(var(--color-accent-rgb) / 0.3);

  /* Brand accent — magenta #EC4899, same hex both themes. Use sparingly in
     light mode (≤1 instance per screen). */
  --color-brand-accent-rgb: 236 72 153;
  --color-brand-accent-hover-rgb: 244 114 182;
  --color-brand-accent-subtle: rgb(251 234 240);  /* Radix pink-50, solid (intentionally opaque) */
  --color-brand-accent-border: rgb(var(--color-brand-accent-rgb) / 0.32);

  --color-win-rgb: 236 72 153;
  --color-win-subtle: rgb(251 234 240);

  --color-highlight-rgb: var(--color-brand-accent-rgb);
  --color-highlight: var(--color-brand-accent);
  --color-highlight-hover: var(--color-brand-accent-hover);
  --color-highlight-subtle: var(--color-brand-accent-subtle);
  --color-highlight-border: var(--color-brand-accent-border);

  --color-success-rgb: 5 150 105;           /* #059669 */
  --color-warning-rgb: 217 119 6;           /* #D97706 */
  --color-danger-rgb: 220 38 38;            /* #DC2626 */
  --color-info-rgb: 14 165 233;             /* #0EA5E9 — cyan */
  --color-success-subtle: rgb(var(--color-success-rgb) / 0.1);
  --color-warning-subtle: rgb(var(--color-warning-rgb) / 0.1);
  --color-danger-subtle: rgb(var(--color-danger-rgb) / 0.1);
  --color-info-subtle: rgb(var(--color-info-rgb) / 0.1);

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
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 20px;  --space-6: 24px;  --space-8: 32px;  --space-10: 40px;
  --space-12: 48px; --space-16: 64px; --space-20: 80px;

  /* Radii */
  --radius-sm: 6px;    /* inputs, small badges */
  --radius-md: 10px;   /* buttons, cards, icon boxes */
  --radius-lg: 14px;   /* modals, large cards */
  --radius-xl: 20px;   /* hero elements, feature cards on landing */
  --radius-full: 9999px;

  /* Typography scale — USE ONLY THESE SIZES */
  --font-size-xs: 12px;  --font-size-sm: 14px;  --font-size-base: 16px;
  --font-size-lg: 18px;  --font-size-xl: 20px;  --font-size-2xl: 24px;
  --font-size-3xl: 30px; --font-size-4xl: 36px; --font-size-5xl: 48px;
  --font-size-6xl: 64px; /* marketing hero only */

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  --line-height-tight: 1.2;      /* headings */
  --line-height-snug: 1.35;      /* subheadings */
  --line-height-normal: 1.5;     /* body */

  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Motion durations */
  --duration-instant: 100ms;     /* press feedback */
  --duration-fast: 150ms;        /* hover, focus */
  --duration-base: 250ms;        /* modals, dropdowns, theme swap */
  --duration-slow: 400ms;        /* page-level transitions (use sparingly) */

  /* Easing */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);        /* entries */
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);         /* exits */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);    /* state swaps */
}
```

Inter and JetBrains Mono are loaded from Google Fonts in `frontend/index.html`; both fall back through the system stack above. `frontend/src/index.css` applies `--font-sans`, `--color-bg`, and `--color-text-primary` on `body`, plus a global `*:focus-visible` outline (`2px solid var(--ring-color)`, `2px` offset).

### 2.4 Tailwind wiring

`tailwind.config.ts` maps semantic utilities to the tokens. Base colors go through `rgb(var(--color-x-rgb) / <alpha-value>)`; the `-subtle`/`-border` keys point at the composite vars directly. Key color families:

```ts
darkMode: ["class", '[data-theme="dark"]'],
theme: { extend: { colors: {
  bg: "rgb(var(--color-bg-rgb) / <alpha-value>)",
  surface: { DEFAULT, elevated, overlay },
  border:  { DEFAULT, strong, subtle },
  text:    { primary, secondary, tertiary, "on-accent", "on-brand-accent" },
  accent:  { DEFAULT, hover, active, subtle, border },
  "brand-accent": { DEFAULT, hover, subtle, border },  // canonical magenta
  win:       { DEFAULT, subtle },
  highlight: { DEFAULT, hover, subtle, border },        // alias → magenta
  success | warning | danger | info: { DEFAULT, subtle },
} } } }
```

The config also maps `spacing`, `borderRadius`, `fontFamily`, `fontSize` (each with its line-height), `boxShadow`, `transitionDuration`, `transitionTimingFunction`, and `ringColor` to the same tokens — so `p-6`, `rounded-lg`, `text-2xl`, `shadow-lg`, `duration-fast`, `ease-out`, `ring-accent` all resolve to the scale. Prefer the mapped semantic utilities; **only** these are allowed in application code (no Tailwind default palette like `bg-blue-500`).

### 2.5 Theme switching

- Default: `dark` (set on `<html data-theme="dark">` in `index.html`; a pre-paint inline script applies the persisted/system theme to avoid FOUC).
- Three persisted values: `"light" | "dark" | "system"` (default `system`), stored in `localStorage["simplecrm-theme"]`. The hook lives in `frontend/src/lib/theme.ts` (`ThemeProvider` + `useTheme`); `system` follows `prefers-color-scheme` live.
- Applied via the `data-theme` attribute on `<html>`.
- The toggle is `frontend/src/lib/ThemeToggle.tsx` — a three-way Světlý / Tmavý / Systém control with sun / moon / monitor icons. It ships in the sidebar footer, the landing nav, the auth pages, and Settings → Vzhled.
- `body` carries `transition: background-color/color var(--duration-base) var(--ease-in-out)` so the swap is smooth.

---

## 3. Typography rules

### 3.1 Font usage
- **Body + UI**: Inter, weight 400 for body / 500 for labels and buttons / 600 for emphasized labels and headings / 700 only for large display text.
- **Numbers in tables, IČO, DIČ, currency in dense data**: `tabular-nums` (Tailwind `tabular-nums`) so columns align.
- **Monospace (JetBrains Mono)**: only for IČO/DIČ inline, code snippets, copy-able IDs. Never for body. (Value/IČO inputs use `font-mono tabular-nums`.)

### 3.2 Hierarchy examples

| Use case | Size | Weight | Color |
|---|---|---|---|
| Page / modal title (app) | 24 (`text-2xl`) | 600 | primary |
| Page title (marketing hero) | 48–64 (`text-5xl`–`6xl`) | 700/800 | primary |
| Section heading | 18–20 (`text-lg`/`xl`) | 600 | primary |
| Card title | 16 | 600 | primary |
| Body | 14 (`text-sm`) | 400 | secondary |
| Label above input | 12 (`text-xs`) | 500 | secondary |
| Helper/metadata | 12 | 400 | tertiary |
| KPI number | 30 (`text-3xl`) | 600 | primary |
| Button text | 14 | 500/600 | contextual |

### 3.3 Forbidden
- Never use off-scale font sizes (10, 11, 13, 15, 17, 19, 22, 26, 28) in app UI. Stick to the token scale.
- Never use font-weight 900 in app UI. (700, and 800 in the marketing hero only, are the ceiling.)
- Never italicize UI chrome. Italic is reserved for inline quotes or emphasis in body copy.
- Never use `text-transform: uppercase` on strings longer than ~10 characters. Small uppercase labels are fine ("AKTIVNÍ", table headers); paragraph uppercase is shouting.

---

## 4. Color semantics — the rule that keeps the aesthetic consistent

The brand has two accents with distinct jobs. **Mixing them up is the single fastest way to make the app look amateurish.** (The original "electric blue + neon lime" pairing is retired: the workhorse accent is now **indigo**, and the reserved brand color is **magenta**. Lime is gone.)

### 4.1 Indigo (`--color-accent`, `text-accent` / `bg-accent` / `bg-accent-subtle`) — PRIMARY INTERACTIVE
`#818CF8` in dark, `#5B5BD6` in light. Used for anything the user clicks, focuses, or selects as the primary path forward:

- Primary buttons (`bg-accent text-text-on-accent hover:bg-accent-hover`)
- Links and inline text-actions (`text-accent hover:text-accent-hover`)
- Active navigation item, focus rings (the global outline is `--color-accent`)
- Selected states, hovered row link text (`hover:text-accent`)
- Icon glyph boxes on default cards / empty states (`bg-accent-subtle text-accent`)
- Activity-timeline dots (`bg-accent`), progress/pipeline fills, chart default bars (`fill-accent`)

Use confidently — indigo is the workhorse, not special.

### 4.2 Magenta (`--color-brand-accent`, `bg-brand-accent` / `text-brand-accent`; `bg-win`; legacy `bg-highlight`) — WIN + BRAND MOMENT
`#EC4899` in both themes. Solid magenta fills always carry near-black text (`text-text-on-brand-accent`), never white. Used **sparingly** for accomplishment, brand identity, and rare high-priority highlights. **It should feel like a hit of dopamine when it appears.**

Appropriate (all live in the code today):
- The logo mark — a Sparkles glyph in a `bg-highlight` box (`frontend/src/components/Logo.tsx`; favicon mirrors it)
- "Označit jako vyhráno" win button (`DealDetail.tsx`, `bg-brand-accent`)
- Leaderboard #1 / winner badges (dashboard, reports widgets, landing demo)
- Paid-deal indicators on pipeline cards (`border-brand-accent-border bg-brand-accent-subtle`)
- The celebration KPI (Trophy "Výnosy tento měsíc", `KpiCard accent="highlight"`)
- "Doporučujeme" / "Ušetříte" pricing badges (billing, ceník, onboarding, trial-expired gate)
- Trial-upgrade CTA (`TrialBanner.tsx`, top-bar upgrade link) — conversion is itself a win moment
- Landing hero glow + the one-word underline

**Never** use magenta for: ordinary primary buttons, navigation, links, generic success toasts (use green), selection states, form-validation success, or body text/headings. In **light mode, ≤1 magenta instance per screen.**

`bg-highlight*` / `bg-win*` are aliases that resolve to magenta; new code should prefer the explicit `brand-accent` names.

### 4.3 Semantic colors
- **Success (green `#10B981`/`#059669`)** — positive confirmations (saved, sent, updated); positive trends unrelated to closing deals.
- **Warning (orange `#F59E0B`/`#D97706`)** — firms approaching the freeing threshold; non-blocking validation; unsaved-changes.
- **Danger (red `#DC2626`)** — deletions, failed validation, error toasts, deactivation warnings, imminent-freeing. Deliberately pure red to stay visually distinct from the magenta brand accent.
- **Info (cyan `#38BDF8`/`#0EA5E9`)** — neutral informational callouts and status pills (e.g. "Zkušební verze" org badges). Cyan is **not** the same as the indigo accent — that separation keeps "new info" from blurring with "action".

### 4.4 Ratios on a typical screen
Roughly: 80% neutral surfaces + text · 10% indigo accent (buttons, active nav, selection) · 5% semantic colors as needed · ≤5% magenta (one or two elements max — logo, a winner badge). If a screen looks like a Christmas tree, magenta is probably overused.

---

## 5. Component rules

There is no shared `Button`/`Input`/`Badge` primitive yet — most controls are composed inline from the utilities below. Keep the patterns identical across call sites.

### 5.1 Buttons

| Variant | Use | Style |
|---|---|---|
| `primary` | Main action of a form or card | `bg-accent text-text-on-accent` hover: `bg-accent-hover` |
| `secondary` | Alternative action, cancel-in-pair | `bg-surface-overlay text-text-secondary border border-border` hover: `bg-surface-elevated text-text-primary` |
| `ghost` | Tertiary, inline, nav-like | `bg-transparent text-text-secondary` hover: `bg-surface-overlay text-text-primary` |
| `destructive` | Delete, deactivate | `bg-danger text-white` hover: darker |
| `win` | "Označit jako vyhráno" | `bg-brand-accent text-text-on-brand-accent` hover: `bg-brand-accent-hover` |

Common heights: `h-8` (32, small CTAs), `h-9` (36, empty-state CTA), `h-10` (40, **default**, `px-4`–`px-5`), `h-11` (44, prominent primary). Icon-only buttons are square.

Every button carries `transition-colors duration-fast`, relies on the global `focus-visible` outline for its ring, and shows a disabled state via `disabled:cursor-not-allowed disabled:opacity-50` (some use `opacity-60`).

### 5.2 Inputs
- Background: `bg-surface-overlay` (or `bg-surface` for inputs nested inside an overlay panel)
- Border: `border border-border`; focus: `focus:border-accent focus:outline-none` (the global focus-visible outline provides the keyboard ring)
- Radius: `rounded-md`; height: `h-10`; horizontal padding: `px-3`; text `text-sm text-text-primary`
- Placeholder: `placeholder:text-text-tertiary`
- Error state: `border-danger`, helper text `text-danger`
- Label above input: 12/500/secondary (`text-xs font-medium text-text-secondary`), `mt-2` gap to input
- Helper/error text below: 12/regular, `mt-2` gap
- Numeric inputs (value, IČO): add `font-mono tabular-nums`

### 5.3 Cards
- Background: `bg-surface`
- Border: `border border-border` in **both** themes, plus `shadow-sm`
- Radius: `rounded-lg`
- Padding: `p-5` to `p-6` depending on density
- Hover (if interactive): `bg-surface-elevated` + `shadow-md`, transition `duration-fast`

### 5.4 Tables
- Cells: `px-4 py-3` (horizontal `space-4`, vertical `space-3`); numeric cells add `text-right tabular-nums`.
- Header cell (shared `TH` string in `DealsListPage.tsx`): `px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary`.
- Rows separated by `divide-y divide-border-subtle` (no zebra striping); clickable rows use `cursor-pointer transition-colors duration-fast hover:bg-surface-overlay`.
- Selected row: left 2px border in `accent`, `bg-accent-subtle`.
- Wrap the table in `overflow-x-auto rounded-lg border border-border bg-surface`; hide low-priority columns responsively (`hidden md:table-cell` / `lg:table-cell`) rather than horizontal-scrolling everything.
- Sticky header when the table itself scrolls vertically.

### 5.5 Badges / pills
Shape: `rounded-full`, small horizontal padding (`px-2`–`px-3`, `py-0.5`–`py-1`), font `text-xs` 500/600.
- Neutral: `bg-surface-overlay text-text-secondary`
- Accent: `bg-accent-subtle text-accent`
- Success: `bg-success-subtle text-success`
- Warning: `bg-warning-subtle text-warning`
- Danger: `bg-danger-subtle text-danger`
- Info: `bg-info-subtle text-info`
- Win / "Doporučujeme" (rare): `bg-brand-accent text-text-on-brand-accent` — solid fill

Pipeline-stage badges are a **neutral pill** (`bg-surface-overlay`) with a small dot in the stage's configured color (`style={{ backgroundColor: stageColor(...) }}`), not the stage color as a background wash.

### 5.6 Modals
The house pattern (see `frontend/src/app/deals/AddDealModal.tsx` and `DealDetailDialog.tsx`), driven by `frontend/src/lib/useModalDialog.ts`:
- **Container**: `fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm` (`px-4`), `role="dialog"` + `aria-modal="true"` + a title/label. The backdrop is the `bg` token at 80% with a blur — not a raw black rgba.
- **Panel**: `bg-surface border border-border rounded-lg shadow-lg p-6`, capped at `max-h-[90vh]` with the content scrolling internally (`overflow-y-auto`, or a `flex flex-col overflow-hidden` shell with an inner scroll region so a sticky-ish header stays put). Widths use Tailwind maxes: `max-w-lg` (~512px, small/medium) and `max-w-2xl` (~672px, large). Never wider than ~800px without reason.
- **Mobile**: bottom-sheet variant — `items-end` + `rounded-t-lg`, switching to `md:items-center md:rounded-lg`.
- **Behavior via `useModalDialog(onClose, open)`**: attach the returned ref to the panel/container (give it `tabIndex={-1}`); it moves focus in on open, traps Tab, closes on Escape, and restores focus to the trigger on close. Backdrop click closes (`onClick` guarded by `e.target === e.currentTarget`).
- Provide an explicit close/cancel affordance (a "Zrušit" button or a header X) in addition to Escape/backdrop.
- Panels appear directly against the blurred backdrop; there is currently no scale/fade panel keyframe.

### 5.7 Gated actions (disabled-with-explanation)
When an action is unavailable for a fixable reason, keep it **focusable** and explain the fix rather than silently disabling it. House pattern: `frontend/src/app/emails/GatedMailButton.tsx`.
- Render the trigger with `aria-disabled="true"` (not the `disabled` attribute) so it stays in the tab order; no-op its `onClick`; style it `cursor-not-allowed opacity-60`.
- On hover **and** focus, show a `role="tooltip"` popover (`aria-describedby`) with the remedy and a link to the relevant settings page.
- Position the popover with `position: fixed` computed from the button's `getBoundingClientRect()` so an ancestor's `overflow-hidden`/`overflow-x-auto` can't clip it; bridge the hover gap with a short hide delay.

### 5.8 Toasts
Implementation: `frontend/src/lib/toast.tsx` (`ToastProvider` + `useToast().success/error`).
- Position: **bottom-right**, `fixed bottom-6 right-6`, stacked with `gap-2`.
- Width: `max-w-sm` (~384px).
- Variants: `success`, `error`, `info`. Auto-dismiss after 4s (success/info) or 6s (error). Manual close via an X.
- Styling: `rounded-md border px-4 py-3 text-sm shadow-lg` with a full border + subtle fill — `border-success bg-success-subtle` / `border-danger bg-danger-subtle` / `border-border bg-surface-elevated` (info). Icon on the left (`CheckCircle2` / `XCircle`) tinted to the variant color; message fills; close X on the right.
- `role="alert"` for errors, `role="status"` otherwise; the viewport is `aria-live="polite"`. Copy is past-tense for success, specific for errors.

### 5.9 Empty states
Use the shared primitive `frontend/src/components/ui/empty-state.tsx` (`<EmptyState>`):
- Centered, `max-w-md`, vertical stack.
- Glyph: a Lucide icon in a `h-12 w-12 rounded-md` box — `bg-accent-subtle text-accent` for the default tone, `bg-surface-overlay text-text-tertiary` for the `filtered` ("no results for these filters") tone.
- Headline: 18/600 (`text-lg font-semibold`) — Czech, warm, specific ("Zatím tu nic není. Přidejte první firmu.").
- Body: 14/regular/secondary, one sentence, vykání.
- Optional primary button (`bg-accent`) + optional secondary text-link (`text-accent`). Pages hide their header primary CTA while an empty state renders (avoid duplicate primaries).
- Never use stock corporate "No data available" text.

### 5.10 Loading states
- **Skeletons, not spinners**, for content about to appear. Use `bg-surface-overlay` with a subtle shimmer.
- **Spinners / inline "Ukládám…" labels** only for: button processing state, full-page app boot, explicit refresh.
- **No spinners for page navigation** — instant transition + skeleton.

### 5.11 Trial and billing UI
The pricing model is a 30-day free trial (full features), then a per-user monthly/annual plan. These states must feel **fair and respectful**, not dark-pattern-y. Prices come from the Plan/subscription config via the API (`price_per_user_minor`) — **never hardcode a number** — and money is rendered through `Intl.NumberFormat`.

**Trial indicator** (`frontend/src/app/AppShell.tsx` top bar, `data-testid="trial-badge"`):
- Small text next to the org name: "Zkušební doba do {datum} · {N} dní zbývá".
- Color: `text-text-tertiary` when > 7 days remain, `text-warning` when ≤ 7, `text-danger` when ≤ 3. Shown only while the subscription is `trialing`; an upgrade link (to the subscription page) appears at ≤ 7 days.
- At ≤ 3 days a dismissible top-of-app banner also appears (`frontend/src/app/TrialBanner.tsx`, `bg-danger-subtle`, magenta upgrade CTA), session-dismissible. Otherwise no pop-ups nag the user mid-trial.

**Trial-expired gate** (`frontend/src/auth/TrialExpiredGate.tsx`): a full-screen overlay (`fixed inset-0 bg-bg/80 backdrop-blur-md`, `role="alertdialog"`) with a centered `max-w-2xl rounded-xl border bg-surface shadow-lg` card rendered instead of the app.
- Headline "Vaše zkušební doba skončila." (24/600), subtext reassuring that data stays safe.
- Plan-selection radio cards (monthly / annual, prices from config) + billing-details form; primary button "Pokračovat na platbu" (`bg-accent`) and a ghost "Exportovat data" (users must always be able to export).
- Support line: "Máte otázky? Napište nám na podpora@simplecrm.cz".
- **Never delete data** when a trial expires — access is blocked, data persists.

**Billing summary** (Settings → subscription): current plan/status, user count × price = total, all via `Intl.NumberFormat` with the org locale/currency, read from config.

### 5.12 Number and currency formatting
- **Always** use `Intl.NumberFormat(orgLocale, { style: "currency", currency: orgCurrency })` for money and `Intl.DateTimeFormat(orgLocale, …)` for dates. The org's locale/currency come from the API.
- **Never** hardcode `Kč`, space-separated thousands, or Czech date patterns like `12. 3. 2026` by hand.
- For tabular numbers (table columns, KPI cards), always add `tabular-nums`.

---

## 6. Density and layout rules

### 6.1 Page frame
- Sidebar (`frontend/src/app/Sidebar.tsx`): expanded on desktop, sticky, with the Logo, nav, and theme toggle at the foot.
- Top bar: `h-16`, sticky (`sticky top-0 z-30 border-b border-border-subtle bg-bg/70 backdrop-blur`).
- Main content padding: `px-4` mobile, `md:px-8` desktop.
- A skip link ("Přeskočit na obsah") is the first focusable element, visible on focus.

### 6.2 Dashboards
- KPI cards in a responsive grid (4 across desktop → 2 tablet → stacked mobile), `gap-4`.
- `space-6` vertical rhythm between major sections.

### 6.3 Data-dense views (tables, Kanban)
- Breathing room trumps cramming — a row too tall beats one too short to read.
- Hide low-priority columns responsively rather than showing everything.
- Kanban column width ~300–320px; card inner padding `space-3`–`space-4`.

### 6.4 Forms
- Single column by default.
- Two columns (`grid grid-cols-2 gap-3`) only when fields are obviously paired (jméno / příjmení, IČO / hodnota, from / to).
- `space-5` rhythm between field groups, `space-3` within a group.

### 6.5 Responsive breakpoints (Tailwind defaults)
`sm:640` · `md:768` · `lg:1024` · `xl:1280` · `2xl:1536`. Test every screen at 390, 768, and 1280. On mobile: tables drop to essential columns, modals become bottom sheets, touch targets ≥ 44×44.

---

## 7. Motion guidelines

Motion should feel **quick, decisive, and never block the user**. Default to simple fades and color transitions; avoid bouncy springs.

- **Hover / focus**: `transition-colors duration-fast` (150ms) on color/background/border — the pervasive default.
- **Modals**: appear against a `backdrop-blur` overlay; there is currently no panel scale/fade keyframe. Escape/backdrop close is instant.
- **Dropdown / popover / gated tooltip**: appear on hover+focus with a short hide delay; no heavy animation.
- **Landing hero glows**: the only ambient animation — three slow (`22s`/`29s`/`34s`) `hero-mold-*` keyframes in `index.css` (blobs that grow, drift, and fade). Disabled under reduced-motion.
- **Number count-up**: used on the marketing report demo (`ReportsDemoSection.tsx`, `useCountUp`, ~600ms ease-out) — not on live app KPIs.

**Never**: attention-seeking pulses/blinks, animations longer than ~500ms outside the hero glow, bounce easings, parallax, auto-playing carousels.

Always respect `prefers-reduced-motion: reduce` — `tokens.css` already forces near-zero durations globally under it, and the hero glow is disabled outright.

---

## 8. Iconography

- **Library**: Lucide React, exclusively (imported in ~70 files; no other icon library is used).
- **Sizes**: 12–14 (inline with xs/sm text and small pills), 16 (default, inline with base text), 18 (logo mark), 20 (buttons, nav), 24 (empty-state glyphs, feature cards).
- **Stroke**: `strokeWidth={1.75}` everywhere (Lucide's default 2 reads heavier).
- **Color**: inherits `currentColor` — set via a `text-*` class.
- Never mix icon libraries. If an icon is missing from Lucide, draw an inline SVG in the same 1.75 stroke style (as the favicon does).

---

## 9. Illustrations and imagery

- Empty states use a **Lucide glyph** in a rounded `bg-accent-subtle` box (see §5.9) — not external line-art.
- Landing visuals: real mock screenshots / stylized in-app demos, not generic stock illustrations.
- **Never use stock photography of smiling business people.**
- **Never use AI-generated images** with the typical over-polished gradient style.

---

## 10. Accessibility — non-negotiable baseline

- Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI chrome, in both themes. (Tertiary text and the accents were tuned to clear AA.)
- Every interactive element reachable by keyboard, with a visible `focus-visible` outline (global default in `index.css` / `tokens.css`).
- All form inputs have an associated `<label>` (placeholder is not a label); icon-only buttons have a Czech `aria-label`.
- Modals: `role="dialog"`/`alertdialog`, `aria-modal`, focus trap + restore via `useModalDialog`.
- Toasts: `role="status"` (success/info) / `role="alert"` (errors); live region `aria-live="polite"`.
- Color is never the sole state signal — always paired with an icon or text.
- Skip link "Přeskočit na obsah" at the top of the app shell, visible on focus.

---

## 11. Czech language and copy voice

- Tone: confident, warm, slightly playful. Never corporate-stiff, never cutesy.
- Use **vykání** ("Vaše firmy", not "Tvoje firmy") throughout.
- Button verbs are imperative: "Uložit", "Přidat firmu", "Označit jako vyhráno" — not "Uložení".
- Errors are human, not system-voice: "IČO {…} nebylo v ARES nalezeno. Zkontrolujte zadání nebo pokračujte ručně." — not "Error: Entity not found (404)."
- Numbers/currency/dates via `Intl` with the org's locale/currency; never hand-format.
- Don't mix Czech and English in the UI. "Dashboard" is an accepted loan word; "Sign in" is not — use "Přihlásit se".

---

## 12. Anti-patterns — do not do any of these

- **Do not** import a Tailwind default-palette color (`bg-blue-500`, `text-gray-400`) in app code. Use semantic tokens.
- **Do not** hardcode hex codes in component files, or use inline `style={{ color: '#…' }}` for anything themeable. (Data-driven stage/team colors passed as inline `style` are the only exception.)
- **Do not** use pure black (`#000000`) or pure white (`#FFFFFF`) directly — use the token values.
- **Do not** add `border-radius` on the outermost page container. Cards yes, pages no.
- **Do not** use three or more font weights on the same screen (400 + 500 + 600 is usually plenty; 700 for display only).
- **Do not** use more than two accent colors in a single component.
- **Do not** animate on scroll (parallax, reveal-on-scroll) beyond one subtle fade-in on landing sections.
- **Do not** render numbers without `tabular-nums` in tables or dashboards — columns will wiggle.
- **Do not** place primary and destructive buttons directly next to each other. Destructive goes in a separate area or behind a menu.
- **Do not** hardcode currency symbols (`Kč`, `€`, `$`), thousands separators, date formats, or plan prices anywhere. Always `Intl` + config.
- **Do not** reach for magenta (`brand-accent` / `highlight` / `win`) unless it's a genuine win / brand moment.

---

## 13. Quick self-audit before submitting UI code

1. Does this look right in both dark and light modes? (Toggle and eyeball both.)
2. Does this look right at 390px width?
3. Are all colors semantic tokens? (Grep for `#`, `rgb(`, `bg-gray-`, `bg-blue-` in changed files.)
4. Are all sizes from the spacing/font scale? (No `p-[13px]`, no `text-[15px]`.)
5. Is there a `focus-visible` state on every interactive element?
6. Does the Czech copy use vykání and feel human?
7. Is magenta used for fewer than 3 distinct elements (≤1 in light mode)?
8. Are there empty, loading, and error states for every data-dependent section?
9. Does `prefers-reduced-motion` mute the animations?
10. Are all currency/number/date values formatted via `Intl` with the org locale — no hardcoded `Kč` or manual date patterns?
11. If this screen shows money or plan info, does it read from config, not a hardcoded price?
12. Does this feel like it belongs in the same product as the last screen you built?

If any answer is no, fix before dispatching.

---

## Reference implementation examples

Consult these real components as templates — they represent current best practice:
- `frontend/src/components/Logo.tsx` — the shared magenta Sparkles brand mark (app + landing + favicon).
- `frontend/src/components/ui/KpiCard.tsx` — dashboard card + the indigo-vs-magenta accent split.
- `frontend/src/components/ui/empty-state.tsx` — the unified empty-state primitive.
- `frontend/src/app/deals/AddDealModal.tsx` + `frontend/src/app/deals/DealDetailDialog.tsx` — the modal pattern.
- `frontend/src/lib/useModalDialog.ts` — focus-trap / Escape / focus-restore hook.
- `frontend/src/app/emails/GatedMailButton.tsx` — the gated-action + fixed-position tooltip pattern.
- `frontend/src/app/activities/ActivityRow.tsx` — a dense timeline row.
- `frontend/src/lib/toast.tsx` — the toast system.
- `frontend/src/app/deals/DealsListPage.tsx` — the canonical table (`TH` header string, row/hover styling).

When in doubt, look at the last good screen built and mirror its patterns.
