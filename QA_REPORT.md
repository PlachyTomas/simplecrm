# SimpleCRM QA Report — 2026-04-28

## Blocked

Playwright MCP cannot launch a browser — Chrome binary missing at `/opt/google/chrome/chrome`. Per `QA_TASK.md` §2.1, the session ended at pre-flight before any walk-through could run. See **Appendix A** below for the diagnosis and the one-line fix; **Appendix B** lists static-only findings (rg sweeps) accumulated before the blocker — they are real, not browser-verified, and intended as bonus context for the next QA pass.

---

## Session summary

- **Tester:** Claude Code (QA mode)
- **Build SHA:** `ec34a1c`
- **Date:** 2026-04-28
- **App version visible to user:** N/A — could not load the app in a browser
- **Auth strategy used:** none — backend `POST /api/v1/auth/dev-login` was probed via curl and confirmed working (admin role, default org, valid JWT). Browser-side wiring was not exercised.
- **Test data:** none seeded — task brief's seed work (expired-trial org, multi-role users, 20+/50+/30+ companies/contacts/deals) was not done because the session aborted before it would have been needed.
- **Coverage:** **0/16 screens walked** — session blocked at §2.1. The static rg sweeps in Appendix B touch the source for many screens but do not constitute a walk-through.

---

## Headline findings

- **Session blocker:** Playwright MCP server is loaded but cannot start a browser (see Appendix A). One-line config fix in `~/.claude.json`, then restart Claude Code.
- **Glassmorphism is shipping in 6 places** despite being explicitly forbidden by the design brief §8 and `ui-design.md` §12 — modal backdrops and the two sticky headers all use `backdrop-blur`. **Highest-confidence static finding; promote to P1 once a build session picks this up.**
- **Two design-spec accessibility features appear to not exist at all:** the `Přeskočit na obsah` skip link (`ui-design.md` §10) and the `Barvoslepý režim` toggle (`SIMPLECRM_DESIGN_BRIEF.md` §5). No matches in `frontend/src/`.
- **Hardcoded `Kč` and hex codes** are present in `LandingPage.tsx`, `SettingsPage.tsx`, and `TrialExpiredGate.tsx` — design brief §6 / `ui-design.md` §5.12 require `Intl.NumberFormat`.
- **Off-scale font sizes** (`text-[10px]`, `text-[11px]`) in 3 places — typography scale violation.
- **Spec / skill drift:** `.claude/skills/ui-design.md` still describes the retired Electric Blue + Neon Lime palette. `tokens.css` and `SIMPLECRM_DESIGN_BRIEF.md` are aligned on Indigo + Magenta. The `27-04-26_POLISH_PASS_FOLLOWUPS.md` notes "brief wins"; the skill should be updated to match. **Not a product bug — a docs hygiene item. Open question for the user.**

---

## Counts

Browser-verified findings: 0. Static-only findings below are listed in Appendix B and **not** counted in the matrix per the brief's §5/§6 (a finding without a screen and a reproduction is below the bar).

| Severity | Functional | Security | Design | Responsive | A11y | Czech | Perf | Data | Total |
|---|---|---|---|---|---|---|---|---|---|
| P0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

---

## Findings — full list

### QA-001 — [P0, FN] Playwright MCP browser binary missing — QA pass cannot run

**Where:** Tooling, not product. Affects every Playwright-driven step in `QA_TASK.md` §3.
**Viewport:** N/A
**Reproduction:**
1. Confirm both services are healthy:
   - `curl -fsS http://localhost:8000/api/v1/healthz` → 200
   - `curl -fsS http://localhost:5173/` → 200
2. Call `mcp__playwright__browser_navigate` with `http://localhost:5173/`.
3. Observe error: `Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome. Run "npx playwright install chrome"`.
4. Confirm the user has no system Chrome: `ls /opt/google/chrome/` → does not exist.
5. Confirm Playwright's bundled Chromium is installed: `ls ~/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome` → present.
6. Inspect MCP config: `~/.claude.json` contains two `mcpServers.playwright` blocks — the active one omits `--browser chromium` and therefore defaults to system Chrome.

**Expected:** Either the active MCP config passes `--browser chromium`, or system Chrome is installed at `/opt/google/chrome/chrome`. Today neither is true.

**Root cause hypothesis:** The duplicate `mcpServers.playwright` blocks in `~/.claude.json` mean the wrong block wins. The correctly-configured block (with `["@playwright/mcp@latest", "--browser", "chromium"]`) is shadowed by the bare-default block.

**Severity:** P0 — blocks the entire QA pass.
**Bucket:** FN (tooling)
**Artifact:** N/A
**Files likely involved:** `~/.claude.json` (user-owned, not in repo). Fix detailed in **Appendix A**.

---

## Things that worked well

- `POST /api/v1/auth/dev-login` returns a clean `{access_token, user{...,organization}}` shape that mirrors `/auth/me` for downstream consumers — seemed correctly gated on `dev_auth_enabled && app_env == "dev"`.
- The `tokens.css` file is comprehensive, internally consistent, and the magenta-retire-of-lime aliasing strategy (`--color-highlight: var(--color-brand-accent)`) is a thoughtful migration affordance.
- `27-04-26_POLISH_PASS_FOLLOWUPS.md` is exemplary — every deferred item lists the backend dependency it's waiting on, in one place. Future QA passes can use it as the canonical "don't re-log this" filter.

---

## Open questions for the user

1. **Skill-vs-brief drift on color palette.** `.claude/skills/ui-design.md` still describes Electric Blue + Neon Lime (the retired palette). `SIMPLECRM_DESIGN_BRIEF.md` and `tokens.css` are on Indigo + Magenta. The followups doc says "brief wins" — should the skill be rewritten to match, or removed? It's currently misleading for any future session that loads the skill but not the brief.
2. **Is `backend/tests/factories.py` planned but missing?** The QA brief §2.4 instructs reading it for seed data. The file does not exist; `backend/tests/` has only `conftest.py`, `api/`, `db/`, `services/`. Either the brief is stale or the factory was deferred.
3. **Is `backend/scripts/` the intended location for QA seed scripts?** It also doesn't exist; `scripts/` lives at the repo root (`scripts/`). Just want to confirm convention before the next session writes one.

---

## Appendix A — how to unblock the QA pass

Two paths; either one works.

**Path 1 (recommended, no install):** Edit `~/.claude.json`, locate the `mcpServers.playwright` block whose `args` is exactly `["@playwright/mcp@latest"]`, and change it to `["@playwright/mcp@latest", "--browser", "chromium"]`. There is a second block already in this shape elsewhere in the same file — copy that one over the default. Then restart Claude Code so the MCP server reloads with the new args. Playwright's bundled Chromium at `~/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome` is already installed and will be used.

**Path 2 (system Chrome):** `sudo apt install google-chrome-stable` (or the equivalent), confirm `/opt/google/chrome/chrome` exists, restart Claude Code. No config change needed.

After either fix, re-run the QA brief. The pre-flight artifact dirs (`qa-artifacts/{snapshots,console-logs,network-traces,a11y}/`) are already created and committed — the next session can land directly into §3.

---

## Appendix B — static-only findings (not browser-verified)

These came from `rg` sweeps during pre-flight, before the blocker. They have **no reproduction steps and no screen-level context** — by the brief's §5 template they don't qualify as full findings, so they're not numbered `QA-NNN`. They are real and worth picking up in the next pass.

### Glassmorphism — `backdrop-blur` in 6 component files

`SIMPLECRM_DESIGN_BRIEF.md` §8 and `ui-design.md` §12 both forbid glassmorphism. Current usage:

- `frontend/src/marketing/LandingPage.tsx:25` — sticky landing header
- `frontend/src/app/AppShell.tsx:53` — sticky app header
- `frontend/src/app/OnboardingForm.tsx:74` — onboarding modal backdrop
- `frontend/src/app/contacts/AddContactModal.tsx:55` — modal backdrop
- `frontend/src/app/companies/AddCompanyModal.tsx:139` — modal backdrop
- `frontend/src/app/deals/DealDetailPage.tsx:50` — modal backdrop
- `frontend/src/app/deals/AddDealModal.tsx:119` — modal backdrop

Likely **P1 DS** once browser-verified. Modals can drop `backdrop-blur-sm`; sticky headers can use a solid `bg-bg` with the existing `border-b`.

### Hardcoded hex codes in component files

Brief §8 / `ui-design.md` §12 forbid hardcoded colors outside `tokens.css`.

- `frontend/src/marketing/LandingPage.tsx:126,134,139,147` — four `#3D5AFE`, `#F59E0B`, `#10B981`, `#EC4899` literals (looks like a stage-color palette inlined into the marketing demo data)
- `frontend/src/app/settings/SettingsPage.tsx:56` — `#3D5AFE`
- `frontend/src/app/deals/DealsListPage.tsx:116` — fallback `#71717A`
- `frontend/src/app/pipeline/colors.ts:17–22,29` — pipeline-stage seed palette

The pipeline `colors.ts` file is plausibly intentional (per-stage color seeds the admin can later override) — flag as P3/P2 unless the rest of the file should also use tokens. The other six are P2 DS.

### Hardcoded `Kč` in 3 production files

`ui-design.md` §5.12 / brief §6 require `Intl.NumberFormat`. `LandingPage.tsx` lines 128/129/135/140/148/351 (marketing copy / pricing card), `SettingsPage.tsx:501` (billing summary), `TrialExpiredGate.tsx:42` (trial-expired headline). The marketing instances are static demo content and arguably exempt; the `SettingsPage` and `TrialExpiredGate` instances are user-facing app chrome and should be `Intl`. Likely **P2 CZ/DS**.

### Off-scale font sizes

Brief §6 / `ui-design.md` §3.3 forbid off-scale type.

- `frontend/src/marketing/LandingPage.tsx:173` — `text-[11px]`
- `frontend/src/app/companies/CompaniesListPage.tsx:121` — `text-[10px]`
- `frontend/src/app/companies/AddCompanyModal.tsx:167` — `text-[11px]`

P3 DS.

### Spec missing accessibility primitives

- **No skip link.** `rg "Přeskočit na obsah" frontend/src/` returns zero matches. `ui-design.md` §10 requires it.
- **No `Barvoslepý režim` toggle.** `rg "Barvoslepý|colorblind" frontend/src/` returns zero matches. `SIMPLECRM_DESIGN_BRIEF.md` §5 explicitly calls it out as required.

Likely **P2 A11Y** each.

### Vykání is consistent

`rg "tvoje|Tvoje|Tvůj|tvůj|tvá|Tvá|tvé|Tvé" frontend/src/` returns zero hits in product copy. No `tykání` slips. Worth highlighting as something that worked.

### Skill drift (not a product bug)

`.claude/skills/ui-design.md` describes the retired Electric Blue + Neon Lime palette. `tokens.css` and `SIMPLECRM_DESIGN_BRIEF.md` use Indigo `#5B5BD6` + Magenta `#EC4899`. `27-04-26_POLISH_PASS_FOLLOWUPS.md` row #4 says "brief wins"; the skill should be rewritten to match the brief, or deleted. Open question above.

---

## Appendix C — workarounds and side effects of QA

- Created `qa-artifacts/snapshots/`, `qa-artifacts/console-logs/`, `qa-artifacts/network-traces/`, `qa-artifacts/a11y/` directories. Empty; safe to delete.
- Called `POST /api/v1/auth/dev-login` once with `{"email":"qa-admin@qa-orga.cz","name":"QA Admin"}`. This created a new `Organization` row (`Qa-orga`) and an admin `User` (`qa-admin@qa-orga.cz`) plus the default pipeline scaffolding. Safe to keep or delete.
- No DB schema changes. No `.env` edits. No seed scripts written.
