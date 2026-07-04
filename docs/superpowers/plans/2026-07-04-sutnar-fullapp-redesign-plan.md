# SUTNAR full-app redesign — work plan & progress tracker

Status: DESIGN PHASE COMPLETE (2026-07-04). **ON HOLD by user decision
2026-07-04: do NOT start implementation (I0–I17) or restyle the app to SUTNAR
unless Tomáš explicitly asks for it in the current session.**
This file is the single source of truth for
progress — update checkboxes as batches complete. If a session dies mid-work,
resume from the first unchecked item.

## Locked decisions (do not relitigate)

- Direction: **SUTNAR** (see spec `2026-07-03-landing-brand-deai-redesign.md` §4A)
- Scope: **entire app**, not just landing (user decision 2026-07-04)
- Logo: **variant B "tečka"** — `SimpleCRM` wordmark in Bricolage Grotesque 800
  + red period. No symbol. Favicon = red dot on ink (or "S.").
- Hero visual: red circle **"99 Kč/uživatel/měsíc"** over offset ink square,
  "30 dní zdarma" badge, dimension-line annotation. (365-clock retired with logo A.)
- Stats strip: `0 školení · 365 dní · 30 s` (99 Kč moved to hero).
- Hero copy: "Obchodník má prodávat." (red `prodávat.`)
- Tokens: paper `#FAF6EF` / surface `#F2ECDF` / ink `#141414` / red `#E8420C`
  (dark: `#FF5A1F`) / cobalt `#1D4ED8` / hairline ink-20 %. Fonts: Bricolage
  Grotesque (display) / Instrument Sans (body) / IBM Plex Mono (data). Inter deleted.
- Rules: radius ≤2 px, no shadows, no gradients, hairlines 1 px, numbered
  section heads `(01)`, lowercase mono labels, icons never in tinted tiles.

## Design files

- `design/landing-redesign.pen` — SUTNAR master: landing desktop, mobile hero,
  brand board, logo exploration. Edit ONLY via Pencil MCP with the file open in
  VS Code (see memory `local-toolchain` for Pencil gotchas — filePath silently
  falls back to active document!).
- Rejected variants kept for reference: `landing-beton/atelier/cenovka/eva.pen`.
- Verification refs: export PNGs to `design/refs/` (git-tracked) after each
  design change; implementation batches compare against these.

## DESIGN PHASE checklist

- [x] D1 Logo B swap through master (nav, footer, mobile, brand board)
- [x] D2 Hero price object (desktop + mobile), stats swap
- [x] D3 Components workbook board (landing + app: buttons, inputs, select,
      filter chips, table header/row, badge/status, kanban card, modal, toast,
      tabs, pagination, sidebar item, form field states, chart bar, section
      head, stat block, FAQ row, pricing card, logo usage, favicon)
- [x] D4 App shell + pages in .pen (desktop 1440): Firmy list (owner/industry/
      city filters + bulk e-mail selection per latest backend), Firma detail,
      Pipeline kanban, Reporty (dark-context charts per landing S05 language),
      Přehled dashboard (agenda, pool-warning panel, mini pipeline)
- [x] D5 Full mobile landing page (all sections at 390)
- [x] D6 Mobile app sample (Firmy list at 390) — app is used in the field
- [x] D7 Export refs to design/refs/, final review pass vs §6 acceptance
      criteria of the spec (squint, blacklist, diacritics, AA contrast)

## IMPLEMENTATION PHASE — landing first, then app

Method for EVERY batch: implement → `pnpm dev` → Playwright screenshot 1440 +
390 → visually diff against `design/refs/*` → browser console clean →
`pnpm test` (fix `landing.test.tsx` texts when copy changes) → commit with
`design-batch: <n>` in message. Small batches; stop at any red.

- [ ] I0 Fonts: self-host Bricolage Grotesque + Instrument Sans + IBM Plex Mono
      (@fontsource, GDPR — no Google CDN). Delete Inter. Verify diacritics
      ěščřžýáíéůú at display sizes.
- [ ] I1 tokens.css: new palette under `mode` themes; keep legacy token names
      as aliases mapping to new values (accent→red, highlight→red, bg/surface/
      text-* → paper/ink scale) so the app flips wholesale; grep for raw hex
      stragglers. THIS FLIPS THE WHOLE APP — eyeball app shell right after.
- [ ] I2 Logo component + favicon (red tečka SVG), replace Sparkles everywhere
- [ ] I3 Landing Nav + mobile drawer restyle
- [ ] I4 Hero (copy "Obchodník má prodávat.", price object as SVG/CSS art,
      stats strip). Kill radial glow blobs.
- [ ] I5 S02 Funkce (hairline columns, no icon tiles) + S03 ARES demo restyle
      (KEEP AresDemoSection interactivity, restyle shell to ledger card)
- [ ] I6 S04 steps + S05: ReportsDemoSection into dark ink section, bar-chart
      styling per design; CalendarDemoSection restyled or folded in
- [ ] I7 Pricing (flat bordered cards, mono + tags) + FAQ (two-col, hairlines)
- [ ] I8 Footer (ink block) + Ceník/legal pages (LegalPageLayout tokens) 
- [ ] I9 Landing dark theme + AA contrast audit + landing tests green
- [ ] I10 APP shell: sidebar/topbar to SUTNAR (ink on paper, tečka logo,
      mono section numbers), MorePage, ThemeToggle visuals
- [ ] I11 Tables + firmy filters UI (hairline rows, mono data, filter chips
      per workbook; covers the new owner/industry/city filter components)
- [ ] I12 Firma detail (ledger-style field rows per ARES card language)
- [ ] I13 Pipeline kanban (flat cards, stage headers mono, win = red moment)
- [ ] I14 Reports/charts (recharts theme: ink/paper/red, mono axes)
- [ ] I15 Forms, modals, toasts, empty states, onboarding/tour overlay
- [ ] I16 Settings/billing/admin + e-mail templates (Resend work upcoming —
      coordinate with firmy-filters spec)
- [ ] I17 Final sweep: dead tokens (highlight aliases), unused Sparkles/lucide
      imports, full-app screenshot tour light+dark, a11y pass, work-log entry

## Open questions (ask user when relevant, don't block design)

- Ceník page + Objednávka flow restyle priority (I8 or later?)
- Does the app keep indigo anywhere (e.g. charts need 2nd categorical color →
  cobalt #1D4ED8 is reserved for that)?
- E-mail templates branding scope within I16.
