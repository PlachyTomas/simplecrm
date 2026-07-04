# App Brand & Logo Exploration — Implementation Plan (design-only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> (inline — Pencil MCP state doesn't hand off well to subagents; the target
> file must stay the active VS Code document). Steps use checkbox (`- [ ]`)
> syntax for tracking. If a session dies mid-work, resume at the first
> unchecked step.

**Goal:** Build `design/app-brand.pen` — 6 magenta-led logo candidates with
typeface exploration, favicon sizes, current-app context mocks, and a winner
brand sheet — so the user can pick SimpleCRM's real logo.

**Architecture:** One .pen file, four labeled boards built in small Pencil MCP
batches, screenshot-verified after every batch, user checkpoint between
exploration (boards 1–2) and application (boards 3–4). No application code
changes.

**Tech Stack:** Pencil MCP only (`get_editor_state`, `get_guidelines`,
`batch_design`, `get_screenshot`, `export_nodes`). No Read/Grep on .pen files.

**Spec:** `docs/superpowers/specs/2026-07-04-app-brand-logo-exploration-design.md`

## Global Constraints

- Brand color magenta `#EC4899` (leads every candidate); neutral versions in
  ink `#0A0A0B` / white `#F5F5F7`.
- Current-app palette for context mocks: dark bg `#0A0A0B`, dark surface
  `#141416`, elevated `#1C1C20`, border `#26262B`, text `#F5F5F7`/`#A8A8B3`;
  light bg `#FAFAFB`, surface `#FFFFFF`, border `#E8E8EC`, text `#0A0A0B`/
  `#4A4A55`; indigo accent `#818CF8` (dark) / `#5B5BD6` (light).
- App UI font in mocks: Inter. Mono: JetBrains Mono.
- Wordmark text exactly `SimpleCRM`. Typefaces explored: Inter (baseline) +
  4–5 distinct others (candidates: Space Grotesk, Sora, Manrope, Bricolage
  Grotesque, Instrument Sans — final set = whatever subset Pencil actually
  renders, verified in the specimen).
- Diacritics check string for any UI-capable font: `ěščřžýáíéůú ĚŠČŘŽÝÁÍÉŮÚ`.
- Shape language: rounded (6–20 px radii), soft shadows OK, no SUTNAR
  flat-ink/brutalist cues in this file.
- Radius/shadow rules apply to candidate marks too: marks must survive at
  16 px (favicon) — no strokes thinner than 1.5 px at 24 px artboard scale.
- Commit the .pen file after every completed task (`design-batch: P<n>` in the
  message). .pen is binary — small, frequent commits are the only diff story.

## Pencil MCP process rules (apply to EVERY task)

1. Open the file first:
   `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" design/app-brand.pen`
   then wait ~4 s.
2. `get_editor_state(include_schema: true)` before the first batch of a
   session AND after every file open — confirm `filePath` ends in
   `app-brand.pen`. If it shows any other document, STOP and reopen. The
   `filePath` param silently falls back to the active document.
3. `batch_design` globals do not persist across calls — carry node IDs from
   the returned name→id map in the conversation, never assume.
4. VS Code autosave (`files.autoSave: afterDelay`) flushes Pencil edits to
   disk; verify with `git status` (file mtime/size changed) before committing.
5. Verify visually with `get_screenshot` after every batch; fix before moving
   on. Read `get_guidelines` once at session start.

---

### Task P0: Mint the file + variables + board skeletons

**Files:**
- Create: `design/app-brand.pen` (via `cp design/landing-eva.pen design/app-brand.pen`, then prune all content nodes)
- Never: Read/Grep on any .pen

**Interfaces:**
- Produces: empty boards `B1 logos`, `B2 favicony`, `B3 v aplikaci`,
  `B4 brand sheet` (top-level frames, 100 px gutters, mono lowercase labels)
  and file-level color variables `brand/magenta #EC4899`, `app/bg-dark
  #0A0A0B`, `app/surface-dark #141416`, `app/bg-light #FAFAFB`,
  `app/indigo-dark #818CF8`, `app/indigo-light #5B5BD6`, `app/ink #0A0A0B`,
  `app/paper #F5F5F7`. Later tasks reference these by variable, not raw hex.

- [ ] **Step 1:** `cp design/landing-eva.pen design/app-brand.pen`; open in VS
      Code (command above), sleep 4, `get_editor_state(include_schema: true)`,
      confirm filePath.
- [ ] **Step 2:** `get_guidelines`; delete all inherited content nodes so the
      canvas is empty (batch_design remove ops on the top-level children from
      get_editor_state).
- [ ] **Step 3:** Create the 8 color variables listed in Interfaces; create 4
      empty board frames laid out left→right: `B1 logos` (3200×2400),
      `B2 favicony` (1600×900), `B3 v aplikaci` (3400×1400), `B4 brand sheet`
      (1600×1200).
- [ ] **Step 4:** `get_screenshot` — 4 empty labeled boards, nothing else.
- [ ] **Step 5:** `git add design/app-brand.pen && git commit -m "design-batch: P0 app-brand.pen skeleton"`

### Task P1: Type specimen row (fonts decided here)

**Files:**
- Modify: `design/app-brand.pen` → inside `B1 logos`, top strip

**Interfaces:**
- Consumes: board `B1 logos`, variables from P0.
- Produces: the **verified font list** (subset of: Inter, Space Grotesk, Sora,
  Manrope, Bricolage Grotesque, Instrument Sans that Pencil renders
  correctly). Record the final list as a text note node `fonts: …` on the
  board AND in the P1 commit message; P2 uses only fonts from this list.

- [ ] **Step 1:** In `B1` top strip, one row per candidate font: `SimpleCRM`
      at 64 px weight 700–800, followed by the same font at 20 px with
      `ěščřžýáíéůú ĚŠČŘŽÝÁÍÉŮÚ` and `abc 0123456789`. Label each row with the
      font name in 12 px mono.
- [ ] **Step 2:** `get_screenshot`; drop any font that rendered as fallback
      (identical to another row / missing glyphs — tofu boxes in the
      diacritics string). Delete dropped rows, add replacement candidates if
      fewer than 5 survive; re-screenshot.
- [ ] **Step 3:** Add the `fonts: <final list>` note node.
- [ ] **Step 4:** Commit `design-batch: P1 type specimen (<final font list>)`.

### Task P2: Logo candidates A–F

**Files:**
- Modify: `design/app-brand.pen` → `B1 logos`, below the specimen strip

**Interfaces:**
- Consumes: font list from P1 note node; variables from P0.
- Produces: 6 candidate groups named `A jiskra`, `B dlazdice-S`,
  `C pipeline`, `D tecka`, `E vizitka`, `F fajfka`. Each group contains,
  laid out as one column: dark tile (480×280, fill app/bg-dark) with full
  lockup; light tile (480×280, fill app/bg-light) with full lockup; solo-mark
  pair (dark+light, 160×160); 16 px legibility row (mark rendered at 16, 24,
  32 px on both bg tiles); neutral-version lockup (ink on light, paper on
  dark). P3/P5 reference marks by these group names.

Candidate construction notes (vector ops in batch_design, one candidate per
batch call — six calls):
- **A jiskra** — 4-point star polygon (rotated squares / star path), magenta
  fill, slight rounding on points; wordmark right of mark. Font: pick the
  geometric-grotesque from P1 list.
- **B dlazdice-S** — rounded-square tile (radius 28% of side) magenta fill,
  white bold `S` centered (largest surviving font at weight 800); wordmark in
  same font, ink/paper.
- **C pipeline** — three vertical rounded bars ascending left→right (heights
  40/65/100%), magenta with 55%/75%/100% opacity steps; wordmark neutral.
- **D tecka** — no mark; wordmark weight 800 with magenta 'terminal dot'
  (period) sized ~1.4× the font's own dot, baseline-aligned after `SimpleCRM`.
  Font: the most characterful display option from P1.
- **E vizitka** — rounded-rect card outline (2 px stroke magenta) with one
  horizontal line + small filled circle (avatar+text abstraction); wordmark
  neutral.
- **F fajfka** — speech-bubble rounded square with check-mark cutout/stroke in
  magenta; wordmark neutral.

- [ ] **Step 1:** Build candidate A group per notes; `get_screenshot`; adjust
      until clean.
- [ ] **Step 2–6:** Same for B, C, D, E, F — one batch + screenshot each.
- [ ] **Step 7:** Full-board screenshot: check spec §6 — every mark legible at
      16 px row, works on both bg tiles, magenta-led + neutral present.
      Fix failures now.
- [ ] **Step 8:** Commit `design-batch: P2 logo candidates A-F`.

### Task P3: Favicon & avatar sizes (all six, cheap)

**Files:**
- Modify: `design/app-brand.pen` → `B2 favicony`

**Interfaces:**
- Consumes: solo marks from P2 groups (copy, don't re-draw).
- Produces: per candidate: 16/32/180 px renders of the solo mark on
  a dark tile and a light tile, plus one 180 px "app-icon" version (mark on
  magenta rounded-square tile, white mark where contrast demands).

- [ ] **Step 1:** Grid on `B2`: 6 rows (A–F) × columns 16/32/180 dark,
      16/32/180 light, 180 app-icon. Labels mono 12 px.
- [ ] **Step 2:** `get_screenshot`; any candidate whose 16 px render is mud
      gets a simplified small-size variant drawn next to it (or a note
      `16px: fail` — honest data for the user's choice).
- [ ] **Step 3:** Commit `design-batch: P3 favicon matrix`.

### Task P4: CHECKPOINT — user shortlists

- [ ] **Step 1:** `export_nodes` boards B1+B2 to PNG in the session scratchpad;
      show the user. Ask: (a) shortlist 2–3 candidates for context mocks,
      (b) preferred wordmark font if it differs per candidate.
- [ ] **Step 2:** Record answers as a note node on `B3` (`shortlist: …`) and
      tick this box with the answer written next to it.
- [ ] If the user is unavailable, default: designer's pick of 2 strongest by
      the P2 Step-7 criteria, noted as provisional.

### Task P5: App context mocks (shortlisted candidates only)

**Files:**
- Modify: `design/app-brand.pen` → `B3 v aplikaci`
- Reference (read-only, for fidelity): `frontend/src/app/Sidebar.tsx`,
  `frontend/src/app/AppShell.tsx`, `frontend/src/auth/LoginPage.tsx`
- Visual ground truth (older but real): `qa-artifacts/post-create-org-dashboard.png`
  (app shell: sidebar "PRODEJ" + Přehled/Pipeline/Firmy/Kontakty/Obchody/
  Reporty, bottom Nastavení/Odhlásit se + theme toggle; topbar = org name +
  trial line left, user block right) and
  `qa-artifacts/2026-04-28/snapshots/03-login-1280.png` (login = centered card,
  magenta tile w/ sparkles placeholder, "Vítejte v SimpleCRM", indigo
  "Přihlásit se přes Google" button). These PNGs are from 2026-04/05 and may
  be stale: BEFORE building mocks, verify them against current code (nav
  items/order in `Sidebar.tsx`, login copy/structure in `LoginPage.tsx`,
  topbar in `AppShell.tsx`). If drifted, capture fresh ground truth via
  `pnpm dev` + `pnpm exec playwright` CLI screenshots (playwright MCP exposes
  no tools on this host — see memory `local-toolchain`). Code wins where any
  screenshot disagrees.

**Interfaces:**
- Consumes: shortlist note from P4; marks/lockups from P2.
- Produces: per shortlisted candidate: (1) desktop app frame 1440×900, dark
  theme — sidebar with logo lockup in header + real nav labels copied verbatim
  from `Sidebar.tsx` (read the file first; include icons as simple 18 px
  placeholders), topbar, empty content area with page title; (2) mobile
  topbar strip 390×64 with solo mark replacing today's Sparkles; (3) login
  card ~450×560 per the real login (see QA screenshot): candidate mark tile
  replacing the sparkles tile, "Vítejte v SimpleCRM" title, subtitle, indigo
  "Přihlásit se přes Google" button. Dark theme primary; one light-theme
  duplicate of the desktop frame for the leading candidate only.

- [ ] **Step 1:** Read the three frontend files; extract nav labels, order,
      login copy. Build ONE un-branded template frame set (desktop, mobile
      strip, login card) with current-app tokens (Inter, indigo, radii,
      borders per Global Constraints).
- [ ] **Step 2:** Duplicate the template per shortlisted candidate; place
      lockup/solo mark; label frames `<candidate> — sidebar/topbar/login`.
- [ ] **Step 3:** Light-theme duplicate for the leading candidate.
- [ ] **Step 4:** `get_screenshot` per frame; fidelity check vs the real app
      (labels verbatim, spacing sane, magenta only in the logo — the mocks
      must not restyle the app).
- [ ] **Step 5:** Commit `design-batch: P5 app context mocks (<shortlist>)`.

> **ON HOLD (user 2026-07-04): do NOT resume this track or implement any of
> these logos in code unless Tomáš explicitly asks in the current session.**
>
> **STATUS 2026-07-04 (end of session):** P0–P5 done (commits `design-batch: P0…P5b`).
> B1 has TEN candidates: A–F (round 1) + row 3 "kolo 2" G pipeline/H schody/
> I spojení/J dvoubarva (round 2, added after user's "too AI" critique +
> web research: 2026 = typography-driven marks, no sparkles/icon-tiles).
> D tečka won round 1 and has full B3 mocks (as does A jiskra); B4 brand sheet
> for D is BUILT but the win is now REOPENED pending round-2 comparison.
> NEXT: user picks direction (Claude recommended J+I system) → mock it on B3 →
> re-confirm winner → redo/keep B4 sheet → P6 refs export (was interrupted).
> Pencil gotcha found: renderer goes stale mid-session — new nodes screenshot
> blank until `code design/app-brand.pen` refocuses the document.

### Task P6: Winner brand sheet + refs export

**Files:**
- Modify: `design/app-brand.pen` → `B4 brand sheet`
- Create: `design/refs/app-brand-*.png` (git-tracked exports)

**Interfaces:**
- Consumes: user's final pick (ask after showing P5 exports — this is the
  second, final checkpoint).
- Produces: brand sheet for the winner: clear-space rule (mark height = x;
  clear space = x/2 diagram), min sizes (16 px favicon / 24 px UI / 120 px
  lockup), color usage row (magenta on dark, magenta on light, neutral ink,
  neutral paper, app-icon tile), do/don't row (≥4 don'ts: don't recolor to
  indigo, don't stretch, don't add shadow to mark, don't place magenta-on-
  magenta). Exports: `design/refs/app-brand-logos.png` (B1),
  `app-brand-favicons.png` (B2), `app-brand-context-<winner>.png` (B3 winner
  frames), `app-brand-sheet.png` (B4).

- [ ] **Step 1:** Show P5 exports to user; get final pick. (If unavailable,
      stop here — P6 is meaningless without the decision.)
- [ ] **Step 2:** Build B4 per Interfaces; `get_screenshot`; fix.
- [ ] **Step 3:** `export_nodes` the four ref PNGs into `design/refs/`.
- [ ] **Step 4:** Commit `design-batch: P6 brand sheet + refs (<winner>)`.
- [ ] **Step 5:** Update memory `landing-sutnar-redesign` sibling: write a new
      memory note `app-brand-logo-track` (chosen logo, file paths, that
      implementation in code is still pending) and add it to MEMORY.md.

### Task P7 (follow-up, OUT OF SCOPE here): implement winner in code

Not part of this plan — listed so nobody "helpfully" starts it: Logo
component, `frontend/public/favicon.svg`, Sidebar/AppShell/LoginPage swap,
og-image. Needs its own tiny plan after the user picks.
