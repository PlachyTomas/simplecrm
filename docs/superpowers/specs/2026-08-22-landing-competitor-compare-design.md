# Landing page — competitor comparison section

Date: 2026-08-22 · Status: owner pre-approved intent ("plan and execute in one go"); implementation left UNCOMMITTED for owner review · Data: scratchpad competitor-pricing.md (fetched 2026-08-22, vendors' own pricing pages)

## Goal

A comparison section on the marketing landing page showing the features SimpleCRM shares with Pipedrive, RAYNET, HubSpot Sales Hub and Freshsales, which tier of each competitor first covers them, and what 5 seats cost there vs 495 Kč at SimpleCRM.

## Legal basis (checked 2026-08-22)

Comparative advertising naming real competitors is permitted under § 2980 Civil Code (89/2012 Sb., implements Directive 2006/114/EC) when ALL conditions hold: not misleading; same-need services; objective comparison of material, verifiable, representative characteristics — price explicitly allowed; no denigration; no unfair advantage of the competitor's repute; no confusion. Guardrails baked into this design:

- Word marks only, never competitor logos. Trademark-attribution line in the small print.
- Every published figure comes from the vendor's own pricing page; each cell/figure that the research pass could NOT verify renders as "neuvádí" ("not published") — never a guessed ✗.
- Small print: prices as of 22. 8. 2026 from vendors' public pricing pages (linked), annual billing per seat, without VAT where the vendor states it, currencies exactly as the vendor lists them (no conversion), tier-matching methodology in one sentence, "prices may have changed — verify with the vendor".
- Neutral wording throughout; competitor strengths shown honestly (rows where everyone ✓ stay in).

## Placement + structure

New `CompareSection` in `frontend/src/marketing/` rendered right after `Pricing` (it substantiates "Jedna cena, žádné hry"), before FAQ; nav hash link "Srovnání" added to `NAV_LINKS` and the mobile drawer.

1. **Header** — title + honest subtitle (we compare the tiers that cover what SimpleCRM bundles).
2. **Price row** — 5 cards, "5 lidí měsíčně": SimpleCRM **495 Kč** (99 Kč × 5, vše v ceně); RAYNET Professional **3 995 Kč** (Start končí u 3 uživatelů); Pipedrive Growth **€195** (Premium €295 pro plné dashboardy/týmy); HubSpot Professional **€450** + jednorázově €1 470 za povinný onboarding; Freshsales Pro **$195** (v USD — v EUR/CZK cenu neuvádí). Each card: tier name + per-seat price + bez-DPH note where the vendor states it.
3. **Feature matrix** — rows = the 12 axes below; SimpleCRM column always "✓ v ceně"; competitor cells = first tier including it / "doplněk" (paid add-on) / "jen přes integrace" / "—" (vendor offers nothing) / "neuvádí" (nothing published — UNVERIFIED in research). Desktop table, `overflow-x-auto` on mobile.
4. **Small print** — the legal block above, with source links per vendor.

## Matrix data (from competitor-pricing.md; ✓SC = SimpleCRM in the one plan)

| Axis | Pipedrive | RAYNET | HubSpot | Freshsales |
|---|---|---|---|---|
| Kanban pipeline | Lite | Start | Free | Free |
| Firmy + kontakty | Lite | Start | Free | Free |
| E-mail ze CRM | Growth | Professional | Free (s brandingem) | Free |
| Šablony e-mailů | Growth | neuvádí ("v přípravě") | Free (3 ks) → Starter | Free |
| Sledování otevření/prokliků | Growth | neuvádí | Free (200/měs) → Starter | neuvádí |
| Hromadné e-maily | Growth (kampaně = doplněk) | jen přes placené integrace | Professional (sekvence) | Growth (250/den) |
| Synchronizace s Google Kalendářem | Lite | Start | neuvádí | neuvádí |
| Vlastní reporty a dashboardy | Premium | Start | Professional | Pro |
| Cíle a predikce prodeje | Growth | Start | Professional | Pro |
| Hlídání stagnujících obchodů | Lite | — | — | Growth |
| Import CSV + migrace z CRM | Lite | Start | neuvádí | Free |
| Role, oprávnění, týmy | Premium | Start/Professional | neuvádí | Pro |
| API | Lite | Professional | neuvádí | Growth |

## Implementation notes

- Data lives in a typed `compareData.ts` (vendor, tiers, price figures, per-axis cell, source URL, fetchedAt) so refreshing prices is mechanical; copy in `marketing.json` cs (vykání, reference) + en; `pnpm i18n:check`.
- Follow the landing page's existing section idioms (spacing, heading styles, reveal animations) — read the neighboring sections first; ui-design skill rules apply (this page ships both themes? landing is styled per marketing design — mirror what Pricing does).
- Tests: vitest for the section rendering (price figures, "neuvádí" cells, small-print sources present); no e2e.
- Deliverable stays UNCOMMITTED (including this spec) for owner review; verification = playwright console check + screenshot for the summary, owner eyeballs visuals.
