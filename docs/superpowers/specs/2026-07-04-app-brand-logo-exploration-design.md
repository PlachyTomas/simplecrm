# App brand & logo exploration — design spec

Date: 2026-07-04 · Status: approved direction, pending spec review
Deliverable: **`design/app-brand.pen`** (design only — no code changes in this effort)

## 1. Problem

The currently implemented app has effectively no brand once the user logs in:

- `frontend/src/app/Sidebar.tsx` — no logo or product name at all.
- `frontend/src/app/AppShell.tsx:93` and `auth/LoginPage.tsx:75` — generic lucide
  `Sparkles` icon as a logo stand-in.
- `frontend/index.html` links `/favicon.svg`, but the file does not exist in
  `frontend/public/` (browsers show the default globe).

The user wants to choose a real logo from multiple options and see the brand
applied to the current app before anything is implemented.

## 2. Relationship to the SUTNAR redesign (important scoping decision)

This effort improves the **currently implemented** design (Inter / indigo /
magenta, dark-first SaaS). It is deliberately independent of the SUTNAR
full-app redesign (`docs/superpowers/plans/2026-07-04-sutnar-fullapp-redesign-plan.md`),
which is a future, not-yet-implemented direction with its own locked logo
("tečka"). Nothing here relitigates SUTNAR; the tečka decision stands for that
track. User decision 2026-07-04: this track designs new logo options for the
app as it exists today.

## 3. Brand constraints (from the live design system)

Source of truth: `frontend/src/theme/tokens.css`.

- Fonts: Inter (sans), JetBrains Mono (mono).
- Everyday interactive accent: indigo — `#5B5BD6` light / `#818CF8` dark.
- **Brand color: magenta `#EC4899`** — tokens already reserve it for "logo,
  win moments, leaderboard #1". User decision: the logo system is
  **magenta-led**; each candidate also gets a neutral (ink/white) fallback for
  contexts where magenta would compete.
- Both themes matter: dark bg `#0A0A0B`, light bg `#FAFAFB`. Dark is the
  default theme.
- Shape language: rounded radii (6–20 px), soft shadows, modern SaaS. Logos
  should feel at home in that language (no brutalist/flat-ink SUTNAR cues).
- Wordmark text: `SimpleCRM` (one word, capital S and CRM). Czech product, but
  the wordmark itself is ASCII — no diacritics risk.

## 4. Deliverable structure — boards in `design/app-brand.pen`

1. **Logo exploration** — 6 distinct candidates, each shown as: full lockup
   (mark + wordmark), solo mark, on dark AND light, plus a 16 px favicon-size
   legibility row. **Typeface is part of the exploration** (user decision
   2026-07-04): the wordmark is NOT fixed to Inter — candidates spread across
   4–6 distinct typefaces (e.g. Inter as baseline, plus geometric-grotesque,
   humanist, display-serif or rounded options such as Space Grotesk, Sora,
   Manrope, Clash/General Sans-alikes available to Pencil). A small
   **type-specimen row** shows `SimpleCRM` set in every explored typeface so
   font and mark can be judged separately. Any font that could later leak into
   app UI must support Czech diacritics (ěščřžýáíéůú) — verify in specimen.
   Candidate directions:
   - A `jiskra` — geometric evolution of the current Sparkles placeholder into
     an ownable 4-point spark.
   - B `dlaždice S` — "S" monogram in a rounded-square tile (app-icon-like).
   - C `pipeline` — three ascending bars/steps forming an abstract funnel.
   - D `tečka` (current-system flavor) — Inter ExtraBold wordmark + magenta
     terminal dot. (Same idea as SUTNAR's tečka but in this design language —
     included because it's cheap to compare across tracks.)
   - E `vizitka` — contact-card / rolodex motif.
   - F `fajfka` — deal-won check fused with the S or speech bubble.
2. **Favicon & avatar sizes** — 16 / 32 / 180 px renders per candidate mark
   (at minimum for the frontrunners), dark + light tile versions.
3. **App context mocks** — the current app redrawn faithfully (NOT redesigned):
   sidebar header with logo, mobile topbar, and login page, each shown with the
   2–3 strongest candidates in place. The user shortlists the frontrunners
   after seeing board 1 (checkpoint); if unavailable, default to designer's
   pick. Purpose: judge the logo in situ.
4. **Mini brand sheet** — for the winner-elect once the user picks: clear-space
   rule, min sizes, magenta/neutral/on-dark usage, do/don't row.

## 5. Out of scope

- Any code changes (Logo component, favicon.svg, sidebar edits) — follow-up
  effort after the user picks a winner.
- Redesigning app screens (that's SUTNAR's I-batches).
- Landing page changes.

## 6. Acceptance criteria

- Each candidate is legible and recognizable at 16 px.
- Lockups work on both `#0A0A0B` and `#FAFAFB` backgrounds.
- Magenta-led, with a neutral version per candidate.
- Context mocks match the real current app closely enough that the screenshot
  comparison is honest (Inter, real nav labels, real spacing).
- User can point at one candidate and say "this one" — boards are labeled
  A–F with names.

## 7. Process notes

- Edit `.pen` only via Pencil MCP with the file open in VS Code — see memory
  `local-toolchain` for the filePath-falls-back-to-active-document gotcha.
- Export chosen-candidate refs to `design/refs/` once picked (git-tracked).
