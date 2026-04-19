# SimpleCRM — Claude Code Task Brief

You are a **single Claude Code session** building **SimpleCRM**, a minimal Czech CRM for small sales teams. You wear three hats sequentially: **planner → builder → tester**. You work autonomously — the user will start this session and leave it running overnight. Read this entire document before writing any code.

---

## 1. Operational setup

### How you work — single session, three modes

You are one session doing everything. For each task you:
1. **Plan** — read the next task from the implementation plan, write a brief task spec in `.claude/tasks/`, decide which files are in scope.
2. **Build** — write the code, migrations, and tests.
3. **Verify** — explicitly switch to tester mindset. Re-read the acceptance criteria. Run lints, typechecks, and tests. Check the output at 390px and 1280px if it's UI work. Fix anything that fails.
4. **Commit** — one clean commit per completed task. Conventional commit format.
5. **Log** — update `docs/work-log.md`, then move to the next task.

The explicit mode-switch between Build and Verify matters. When you switch, mentally discard your assumptions about the code you just wrote and re-examine it against the acceptance criteria as if seeing it for the first time.

### Skills — read before relevant work
Skill files in `.claude/skills/` contain concentrated best practices. **Before starting any frontend UI task**, read `.claude/skills/ui-design.md` — it contains the complete design system (tokens, components, color semantics, motion, responsive rules). Do not skip this; the design quality depends on it.

### Task decomposition — mandatory
**Do not attempt to build an entire phase in one go.** Break each phase into tasks where each task:
- Takes roughly 30–90 minutes of work (not 3 hours)
- Touches a clearly scoped set of files
- Has explicit acceptance criteria you can verify
- Ends with a commit

Smaller tasks = cleaner commits = easier recovery if a session limit interrupts you.

### Session-limit resilience — CRITICAL for overnight runs

Your session has a **5-hour token budget**. The project will take multiple sessions. You **will** hit the limit. This protocol ensures zero lost work and seamless resumption.

**Continuous state tracking:**
1. Maintain `docs/work-log.md`. Structure:
   ```markdown
   # SimpleCRM Work Log

   ## Session 3 — 2026-04-18

   ### Task 2.4 — Deal model and migration ✅
   - Created Deal model with value + currency fields
   - Migration generated and tested
   - Committed: abc1234

   ### Task 2.5 — Activity model and migration ⏳ IN PROGRESS
   - Created Activity model
   - Migration generated
   - NEXT: write test file, run tests
   ```
2. **Update `docs/work-log.md` after every completed task AND after every meaningful intermediate step** (model created, migration run, tests written, tests passing). This is your save-game. If you only update at task completion, a mid-task interruption loses all context.

**When you sense the session might be ending** (you notice slower responses, you've been working for a while, or you're about to start a large operation):
1. **Stop and commit** whatever compiles, even if incomplete. Use commit message: `wip: Task X.Y — [what's done, what's next]`
2. **Write `RESUME.md`** at the repo root with this exact structure:
   ```markdown
   # Resume Point

   ## Last completed task
   Task 2.4 — Deal model and migration

   ## Current task
   Task 2.5 — Activity model and migration

   ## Status
   Model and migration created. Tests not yet written.

   ## Exact next step
   1. Create `backend/tests/api/v1/test_activities.py`
   2. Write happy-path, validation, and permission tests
   3. Run `pytest backend/tests/api/v1/test_activities.py`
   4. If green, commit and move to Task 2.6

   ## Files modified in this incomplete task
   - backend/app/db/models/activity.py (DONE)
   - backend/alembic/versions/xxx_add_activity.py (DONE)
   - backend/tests/api/v1/test_activities.py (NOT STARTED)

   ## Current working state
   - All existing tests pass
   - No lint errors
   - Migration applied to dev DB
   ```
3. Commit `RESUME.md` and `docs/work-log.md`.

**On every session start — ALWAYS do this first:**
1. Read `docs/work-log.md` end-to-end to understand project state.
2. Read `RESUME.md` if it exists — this is your exact continuation point.
3. Run `git log --oneline -10` to see recent commits.
4. Run the test suite (`pytest` and `pnpm test`) to confirm the project is in a clean state.
5. Delete `RESUME.md` after you've absorbed it (it's for the session boundary only).
6. Continue from exactly where the last session left off.

**Commit cadence — more often than you think:**
- Commit after every completed task (mandatory).
- Commit after every passing test suite run during a task (recommended).
- Commit work-in-progress if you're about to start something risky (new migration, large refactor).
- Never go more than 30 minutes without a commit.
- The repo is local-only (no push) so cheap commits cost nothing.

### Quality gates
A task is "done" when:
1. Code passes lint (`ruff check` + `ruff format --check` backend, `pnpm lint` frontend).
2. Code passes typecheck (`mypy` backend, `tsc --noEmit` frontend).
3. All tests pass (`pytest` backend, `pnpm test` frontend).
4. You have explicitly re-read the acceptance criteria in tester mode and confirmed each one.
5. Changes are committed with a clear conventional commit message referencing the task ID.

---

## 2. Product overview

**SimpleCRM** — minimalistický český CRM pro malé prodejní týmy (5–25 obchodníků). Slogan: *"CRM pro prodej. Nic víc, nic míň."*

**Positioning**: cheaper and simpler than Czech competitors (RAYNET, eWay-CRM, Anabix) and more Czech-native than international tools (Pipedrive, Zoho). The product deliberately excludes calendars, email automation, and marketing features — those belong in tools users already have.

**Pricing model**: free trial + flat per-user. Every new organization gets **1 user free for 30 days** (full functionality, no feature gating). After 30 days, every user (including the first) costs **99 Kč/user/měsíc**. The app must enforce the trial-expiry gate, show billing summary, and display days-remaining from day one. Actual payment processing (Stripe/ComGate integration) is out of scope for MVP — the app blocks usage after trial with a "subscribe" prompt, but doesn't collect payment yet.

**Key differentiators (must be showcased prominently)**:
1. **ARES integration** — enter an IČO, auto-fill company name, address, DIČ, legal form from the Czech business registry.
2. **Automatic company freeing** — a company assigned to a salesperson who hasn't closed an order within 365 days is automatically released to the company pool so others can claim it.
3. **Deliberate minimalism** — no calendars, no email sequences, no marketing automation.

**Target users**: Czech SMB sales teams currently using spreadsheets or expensive legacy CRMs. Must feel lightweight, fast, and obviously-Czech.

---

## 3. Product scope

Three deliverables, all deployed together under one domain:

1. **Landing page** (`/`, publicly accessible, marketing-focused, mobile-first).
2. **CRM web application** (`/app/*`, behind authentication).
3. **Public API** (`/api/v1/*`, JWT-protected, OpenAPI-documented).

All user-facing copy is in **Czech**. Code, comments, commit messages, and internal documentation are in English.

### Internationalization readiness (implement Czech only, but architect for growth)
- **Do NOT add `react-i18next` or any i18n framework for MVP.** Czech strings live directly in components — this is intentional for speed. Systematic extraction happens in v1.1.
- **Do** use `Intl.NumberFormat` and `Intl.DateTimeFormat` with a locale parameter (read from org settings, default `cs-CZ`) for all number, date, and currency formatting. Never hardcode Czech format patterns like manual space-separated thousands or `Kč` suffix — always derive from locale + currency code.
- **Do** keep user-facing strings co-located in component files (not scattered across utility functions) so future extraction tooling has clean targets.
- The ARES integration is isolated behind a service interface (`BusinessRegistryService`) so that Slovak (ORSR), German (Handelsregister), or Polish (KRS) registries can be added as alternative implementations without refactoring the company-creation flow.

---

## 4. Technical stack — locked in

### Frontend
- **React 18 + Vite + TypeScript** (strict mode on)
- **Tailwind CSS** with CSS-variable-based theming (see Section 6 for color tokens)
- **shadcn/ui** as the component library foundation — customize via CSS variables, do not fork components unless strictly necessary
- **React Router v6** for routing
- **TanStack Query v5** for all server-state (no Redux, no Zustand unless justified)
- **TanStack Table v8** for the companies, contacts, and users tables
- **react-hook-form + Zod** for forms and validation
- **dnd-kit** for the Kanban drag-and-drop on the Pipeline page
- **Recharts** for all charts on the Reports and Dashboard pages
- **Lucide React** for icons (do not mix icon libraries)
- **openapi-typescript** to generate TS types from the backend OpenAPI spec — **never hand-write API types**. Generated output lives at `src/types/api.generated.ts` and is committed to git. CI enforces freshness (see Section 12).

### Backend
- **Python 3.12 + FastAPI**
- **SQLAlchemy 2.0** (declarative, async session) + **Alembic** for migrations
- **Pydantic v2** for request/response schemas — these also feed the OpenAPI spec consumed by frontend
- **python-jose** for JWT handling
- **passlib[bcrypt]** for any password hashing (only needed if email-password login is added later)
- **Authlib** for Google OAuth 2.0 flow
- **httpx** for outbound HTTP (ARES API)
- **APScheduler** for the daily company-freeing background job

### Database
- **PostgreSQL 16** (production and dev). Use **asyncpg** as the driver.
- Schema migrations exclusively via Alembic. No hand-edited schemas.

### Tooling
- **uv** for Python package management (not pip, not poetry)
- **ruff** for linting and formatting Python
- **mypy** in strict mode
- **pytest + pytest-asyncio + httpx.AsyncClient** for backend tests
- **Vitest** for frontend unit tests
- **Playwright** for end-to-end tests
- **pnpm** for Node package management (not npm, not yarn)
- **Docker Compose** for local dev

### Deployment
- Target: **Hetzner Cloud (Nuremberg/Falkenstein) + self-hosted Coolify** as the primary deployment platform. Prepare production Dockerfiles and a `docker-compose.prod.yml`.
- Static frontend assets served via **Cloudflare Pages** (free tier, unlimited bandwidth, global CDN).
- HTTPS via **Let's Encrypt** (managed by Coolify/Traefik automatically).
- Database hosted on a separate Hetzner VPS or via **Ubicloud managed Postgres** (runs inside Hetzner DCs).
- Database must be in the EU for GDPR.
- Backup strategy: automated daily Postgres dumps to **Hetzner Object Storage (S3-compatible)**, retained for 7 days minimum.

---

## 5. Repository layout

Monorepo with two apps and shared config:

```
simplecrm/
├── backend/                 # FastAPI app
│   ├── app/
│   │   ├── api/v1/          # Route modules
│   │   ├── core/            # Config, security, deps
│   │   ├── db/              # Models, session, migrations
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic (ARES, freeing job, etc.)
│   │   └── main.py
│   ├── alembic/
│   ├── tests/
│   │   ├── api/v1/          # One file per route module (see Section 12)
│   │   │   ├── test_auth.py
│   │   │   ├── test_companies.py
│   │   │   ├── test_contacts.py
│   │   │   ├── test_deals.py
│   │   │   ├── test_pipelines.py
│   │   │   ├── test_teams.py
│   │   │   ├── test_users.py
│   │   │   ├── test_reports.py
│   │   │   └── test_activities.py
│   │   ├── services/        # Unit tests for business logic
│   │   │   ├── test_ares_client.py
│   │   │   ├── test_freeing_job.py
│   │   │   ├── test_ownership.py
│   │   │   └── test_permissions.py
│   │   ├── conftest.py      # Shared fixtures (async client, test DB, seed data)
│   │   └── factories.py     # Test data factories
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/                # React app (CRM + landing page)
│   ├── src/
│   │   ├── app/             # Authenticated CRM routes
│   │   ├── marketing/       # Public landing page routes
│   │   ├── components/      # shadcn/ui + custom
│   │   ├── lib/             # API client, auth, utils
│   │   ├── theme/           # CSS variables, theme config
│   │   └── types/
│   │       └── api.generated.ts  # AUTO-GENERATED from OpenAPI — never hand-edit
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── .claude/
│   └── skills/              # Worker skill files
├── docker-compose.yml       # Local dev
├── docker-compose.prod.yml  # Production template
├── docs/work-log.md         # Maintained by Manager
├── RESUME.md                # Written at session end if interrupted
└── README.md
```

---

## 6. Design system

Visual identity inspired by the user's reference: **dark, high-contrast, electric accents**. Feels modern, confident, slightly playful. Not corporate-drab, not toy-like.

### Theming approach — MUST be swappable
All colors live as **CSS variables** defined in `frontend/src/theme/tokens.css`. Components reference semantic tokens only (never hex codes directly). Theme switching is a single file change or a runtime class toggle.

Structure:
```css
:root[data-theme="dark-neon"] {
  --color-bg: #0A0A0B;
  --color-surface: #141416;
  --color-surface-elevated: #1C1C20;
  --color-border: #26262B;
  --color-text-primary: #F5F5F7;
  --color-text-secondary: #9A9AA3;
  --color-text-tertiary: #5C5C66;
  --color-accent-primary: #3D5AFE;      /* electric royal blue */
  --color-accent-primary-hover: #5470FF;
  --color-accent-secondary: #C9F24E;    /* neon lime */
  --color-accent-secondary-hover: #D6FF5E;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-danger: #EF4444;
  --color-info: #3D5AFE;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
}

:root[data-theme="light"] { /* define parallel tokens for light mode */ }
```

Tailwind's config maps utilities to these variables (e.g., `bg-surface`, `text-primary`, `border-border`). Developer must **never** use Tailwind's built-in color palette (`bg-blue-500`, `text-gray-800`) in application code — always semantic tokens.

### Typography
- **Font**: Inter (via Google Fonts or self-hosted). Weights 400, 500, 600, 700.
- Monospace for IČO, DIČ, IDs: JetBrains Mono.
- Scale: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 / 48 px. Never use font sizes outside this scale.
- Line heights: 1.2 for headings, 1.5 for body.

### Spacing scale
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 px. All paddings, margins, and gaps must come from this scale.

### Component personality
- **Buttons**: rounded (radius-md), generous horizontal padding, subtle hover lift + color shift. Primary = blue; lime is reserved for destructive-positive actions like "Označit jako vyhráno" and certain data-highlight moments (status badges, win indicators).
- **Cards**: surface color with 1px border, medium radius, soft shadow on hover.
- **Inputs**: surface-elevated background, 1px border that brightens on focus to accent-primary, radius-md.
- **Tables**: zebra-striping off, row hover uses surface-elevated, border-bottom between rows. Header row has tertiary text color.
- **Badges**: small pill shapes, colored background with 10–15% opacity over the semantic color.
- **Empty states**: friendly Czech copy, a simple line-art illustration (you may use open-source illustration sets like Blush or unDraw — prefer monochromatic adapted to theme), a clear CTA.
- **Micro-animations**: use Framer Motion sparingly — stage transitions on the Kanban, number counters on dashboards, toast slide-ins. Nothing flashy, nothing that delays interaction.

### Reference vibe
"Linear meets Pipedrive, in Czech, with electric accents." High information density where needed (tables, Kanban) but never cluttered. Lots of breathing room on dashboards and marketing pages.

### Mobile responsiveness — non-negotiable
- **Landing page**: mobile-first. Every section must look designed-for-mobile, not crammed-from-desktop. Breakpoints: 640 / 768 / 1024 / 1280 px.
- **CRM app**: responsive down to 390px wide (iPhone 13 mini). On mobile, the sidebar collapses to a bottom tab bar with the 5 most common destinations (Dashboard, Pipeline, Firmy, Kontakty, Více). The Kanban becomes horizontally scrollable. Tables become stacked cards.
- Every screen must be tested at 390, 768, and 1280px widths during verification.

---

## 7. Data model

SQLAlchemy models; Alembic migrations generated from them.

- **Organization**: id, name, ico, dic, address_street, address_city, address_zip, legal_form, registered_on, region (enum, default 'eu-cz'), locale (varchar, default 'cs-CZ'), currency (varchar(3), default 'CZK'), billing_email (nullable), stripe_customer_id (nullable), trial_ends_at (timestamp, set to created_at + 30 days on creation), created_at, updated_at
- **Plan**: id, name (varchar, e.g. 'trial', 'team'), price_minor_units (integer, e.g. 9900 for 99 CZK), currency (varchar(3), default 'CZK'), interval (enum: monthly|annual), is_active (boolean), created_at
- **User**: id, email, name, avatar_url, google_id, role (enum: salesperson|manager|admin), team_id (fk), organization_id (fk to Organization), is_active, last_login_at, created_at
- **Team**: id, name, manager_user_id (fk to User), organization_id (fk), created_at
- **Company**: id, name, ico (8 digits, unique nullable), dic, address_street, address_city, address_zip, legal_form, registered_on, website, note, owner_user_id (fk, nullable when freed), organization_id (fk), last_order_at (nullable), ownership_expires_at (computed: coalesce(last_order_at, created_at) + 365 days), ares_synced_at, created_at, updated_at
- **OwnershipHistory**: id, company_id, user_id, assigned_at, released_at, reason (enum: initial|reassigned|freed_timeout|won_deal_refresh)
- **Contact**: id, first_name, last_name, position, email, phone, linkedin_url, company_id (fk, nullable), organization_id (fk), note, created_at, updated_at
- **Pipeline**: id, name, is_default, organization_id (fk), created_at
- **Stage**: id, pipeline_id (fk), name, default_probability (0–100), color (hex), position (int for ordering), stage_type (enum: open|won|lost)
- **Deal**: id, name, company_id (fk), primary_contact_id (fk nullable), value (numeric), currency (varchar(3), default 'CZK'), stage_id (fk), probability_override (nullable), owner_user_id (fk), expected_close_date, closed_at, lost_reason, created_at, updated_at
- **Activity**: id, entity_type (enum: company|contact|deal), entity_id, user_id, activity_type (enum: note|stage_change|owner_change|deal_won|deal_lost|company_freed|...), payload (JSONB), created_at

**Important naming rule**: no column name should embed a specific currency (e.g., `value_czk` is wrong; `value` + `currency` is correct). This ensures the schema supports multi-currency without column renames.

Indexes required on: `Company.owner_user_id`, `Company.ownership_expires_at`, `Company.ico`, `Company.organization_id`, `Deal.owner_user_id`, `Deal.stage_id`, `Activity.entity_type + entity_id`, `Activity.created_at`, `Organization.trial_ends_at`.

Full schema details to be produced in the Phase 2 tasks.

---

## 8. API surface (v1)

All routes under `/api/v1`, JSON, JWT bearer auth except auth endpoints. Pagination via `?limit=&offset=` returning `{items, total}`. Filtering via query params. OpenAPI 3.1 spec must be complete and consumed by the frontend's codegen.

Key endpoint groups:
- `auth/google/login`, `auth/google/callback`, `auth/me`, `auth/logout`
- `organizations/current` (get/update org settings), `organizations/current/billing-summary` (trial status, user count, monthly total)
- `companies` (list/create/get/update/delete), `companies/lookup-registry?country=CZ&number=`, `companies/:id/reassign`, `companies/:id/free`
- `contacts` (list/create/get/update/delete)
- `deals` (list/create/get/update/delete), `deals/:id/move-stage`, `deals/:id/mark-won`, `deals/:id/mark-lost`
- `pipelines`, `pipelines/:id/stages` (reorder, create, update, delete)
- `teams` (list/create/get/update), `teams/:id/members` (add/remove/move)
- `users` (list admin-only, invite, update-role, deactivate)
- `plans` (list available plans — public endpoint for pricing page)
- `reports/kpi-summary`, `reports/pipeline-velocity`, `reports/leaderboard`, `reports/loss-reasons`, `reports/export-csv`
- `activities` (list filtered by entity or user)

Role-based access enforced at the dependency level (FastAPI `Depends`).

---

## 9. Authentication — Google OAuth from day one

**Gmail/Google sign-in is the only authentication method for MVP.** Email/password can be added later.

Flow:
1. User clicks "Přihlásit se přes Google" on landing page.
2. Frontend redirects to `/api/v1/auth/google/login`, which redirects to Google with proper scopes (`openid email profile`).
3. Google redirects back to `/api/v1/auth/google/callback?code=...`.
4. Backend exchanges code for tokens, fetches user info, creates-or-updates User record by `google_id`, issues app JWT (1h access + 30d refresh).
5. Backend sets HTTP-only secure cookie with refresh token; returns access token in response; frontend stores access token in memory (never localStorage).
6. First-time users land on an onboarding flow: enter company name, IČO (ARES auto-fill here is a great product moment), choose role (defaults to admin for first user of a company).

Google OAuth client ID and secret provided via env vars. Redirect URIs configured for `localhost:5173`, staging, and production.

---

## 10. Landing page specification

A polished, mobile-first marketing page. Acts as the front door — conversion to "Přihlásit se přes Google" is the primary goal.

### Sections (top to bottom)
1. **Nav bar**: logo left, links (Funkce, Ceník, FAQ) center-right, "Přihlásit se" (ghost) + "Vyzkoušet zdarma" (primary) right. On mobile: hamburger → drawer.
2. **Hero**: headline *"CRM pro prodej. Nic víc, nic míň."* Subhead: jednoduchý český CRM pro malé týmy. Funguje s ARES. 30 dní zdarma. Primary CTA button "Vyzkoušet 30 dní zdarma" (→ Google OAuth), secondary "Prohlédnout funkce" (scrolls down). Hero visual: a mock Kanban/dashboard screenshot floating with subtle glow in accent colors.
3. **Key differentiators** (3-card row, stacks on mobile): "ARES integrace" / "Automatické uvolňování firem" / "Bez zbytečností". Each card: icon, headline, 2-sentence description.
4. **How it works** (3-step horizontal, stacks on mobile): Zaregistrujte se přes Google → Přidejte první firmu (s ARES jedním klikem) → Spravujte obchody v pipeline.
5. **Feature tour**: alternating left/right sections (image + text), 4–5 features showcased with small mockup screenshots.
6. **Pricing**: single-plan simplicity. *Zkušební verze*: 30 dní zdarma, plná funkcionalita. *Po zkušební době*: 99 Kč/uživatel/měsíc, bez závazků, zrušení kdykoliv. Prominent "Vyzkoušet 30 dní zdarma" button. Emphasize: "Žádná kreditní karta při registraci."
7. **FAQ**: accordion with 6–8 questions (data v EU, ARES, jak se odlišujeme od Raynet/Pipedrive, co když má firma víc než 25 lidí, lze exportovat data, zrušení kdykoliv).
8. **Footer**: odkazy (Ochrana osobních údajů, Obchodní podmínky, Kontakt), sociální sítě, logo.

### Mobile requirements
- Page loads fast on 3G — Lighthouse mobile score ≥ 90 (Performance, Accessibility, Best Practices).
- Images responsive with `srcset`.
- Tap targets ≥ 44×44 px.
- No horizontal scroll at any width ≥ 320 px.
- Font sizes readable without zoom (body ≥ 16px).
- CTAs always visible or reachable within one scroll.

Implemented as routes inside the same React app (`/`, `/cenik`, `/faq`) or as statically pre-rendered pages (vite-ssg). Decide during Phase 11; document the decision in an ADR.

---

## 11. Implementation plan — work through these sequentially

Phases are **sequential**. Within a phase, tasks are sequential too — complete one, commit, verify, then start the next. Never skip ahead. If a task seems too large, split it further before starting.

### Phase 0 — Repo foundation
- Task 0.1: Initialize monorepo, `.gitignore`, base README, `.claude/skills/` dir.
- Task 0.2: Backend skeleton — FastAPI app, `/api/v1/healthz`, Dockerfile, pyproject with uv, ruff + mypy config.
- Task 0.3: Frontend skeleton — Vite + React + TS + Tailwind + shadcn/ui init, theme tokens file, one sample page using the tokens.
- Task 0.4: Postgres via docker-compose, SQLAlchemy async session setup, Alembic init, empty initial migration.
- Task 0.5: CI via GitHub Actions (lint, typecheck, test for both apps). Include `pnpm run types:check` step that re-generates API types from OpenAPI and fails if the committed `api.generated.ts` is stale.

**Exit criteria**: `docker compose up` brings up frontend, backend, postgres; healthcheck endpoints respond; CI green on PR.

### Phase 1 — Authentication
- Task 1.1: Organization, User, Team, and Plan models + migration. Seed a default 'trial' plan (price_minor_units=0, interval=monthly) and a 'team' plan (price_minor_units=9900, currency='CZK', interval=monthly).
- Task 1.2: Google OAuth flow (login/callback endpoints, token issuance).
- Task 1.3: Auth dependencies (current_user, require_role, require_active_trial_or_subscription).
- Task 1.4: Frontend auth context, login page, protected route wrapper, trial-expiry gate (shows "Vaše zkušební doba skončila" with subscribe CTA after 30 days).
- Task 1.5: Onboarding flow for first-time users (creates Organization with trial_ends_at = now + 30 days, captures company name + IČO via ARES, sets user as admin).

**Exit criteria**: user can Google-sign-in from landing page, lands in app shell, `/api/v1/auth/me` returns their info.

### Phase 2 — Core data model and basic CRUD
- Task 2.1: Company + OwnershipHistory models and migrations. All company records scoped to organization_id.
- Task 2.2: Contact model and migration, scoped to organization_id.
- Task 2.3: Pipeline + Stage models, seed default pipeline (6 stages as per spec), scoped to organization_id.
- Task 2.4: Deal model and migration. Note: the value column is `value` (numeric) + `currency` (varchar, default from org settings) — never `value_czk`.
- Task 2.5: Activity model and migration.
- Task 2.6: CRUD endpoints for companies, contacts, deals (list with pagination + filters, get, create, update, delete). Permission checks: salespeople see own + team, managers see team, admins see all. All queries filtered by current user's organization_id.
- Task 2.7: Frontend API client generation from OpenAPI (`pnpm run types:generate`); base list and detail screens for companies (read-only first pass).

**Exit criteria**: an admin can seed data via API, frontend renders a table of companies and a detail page, permissions enforced, all data scoped to organization.

### Phase 3 — ARES integration (via pluggable BusinessRegistryService)
- Task 3.1: Define `BusinessRegistryService` abstract interface (async method `lookup(country_code, registration_number) → CompanyRegistryData | None`). Implement `CzechAresService` using httpx. Endpoint: `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`. Parse response, map to Company fields. The interface is designed so that Slovak (ORSR), German, or Polish registries can be added later as alternative implementations — but only the Czech one is built now.
- Task 3.2: `GET /api/v1/companies/lookup-registry?country=CZ&number=` endpoint, rate-limited, cached for 24h. Routes to the correct `BusinessRegistryService` implementation based on country (only CZ exists for now).
- Task 3.3: Frontend "Přidat firmu" modal with live IČO lookup. States: empty / loading / success / not-found / error.

**Exit criteria**: Tester can enter a real IČO (e.g., 27074358 — Alza.cz) and see auto-filled fields; the company can be saved.

### Phase 4 — App shell and core screens
- Task 4.1: App shell (sidebar + top bar + main area) with routing. Responsive: sidebar collapses to bottom tabs on mobile.
- Task 4.2: Companies list (TanStack Table, filters, search, pagination) + detail page with tabs (Přehled, Kontakty, Obchody, Aktivita, Poznámky).
- Task 4.3: Contacts list with split-view detail.
- Task 4.4: Deal detail page or modal.
- Task 4.5: Global search (command palette — optional, can defer).
- Task 4.6: Empty states for every list.

**Exit criteria**: a user can navigate the full CRM, create/edit/delete companies, contacts, and deals through the UI.

### Phase 5 — Pipeline / Kanban
- Task 5.1: Pipeline endpoint aggregating deals grouped by stage with sums.
- Task 5.2: Kanban UI with dnd-kit. Columns from stages, cards from deals.
- Task 5.3: Optimistic stage move; POST to `deals/:id/move-stage`; revert on error.
- Task 5.4: "Mark as won/lost" actions with lost-reason dropdown.
- Task 5.5: Filters: by owner (manager-only), by date range, by value.

**Exit criteria**: manager can drag a deal across stages; card updates persist; the sum-per-stage updates live.

### Phase 6 — Dashboards
- Task 6.1: KPI summary endpoint per user (`/reports/kpi-summary`).
- Task 6.2: Salesperson dashboard — 4 KPI cards, "firmy blížící se uvolnění" widget, recent activity, mini-pipeline.
- Task 6.3: Manager dashboard — aggregated KPIs, leaderboard endpoint + component, pipeline-velocity chart, stage-distribution chart.
- Task 6.4: Role-based rendering of the dashboard route (`/app` → different component per role).

**Exit criteria**: both dashboards render correctly with seeded data, charts are interactive, mobile layout works.

### Phase 7 — Teams and user management
- Task 7.1: Team CRUD endpoints + permissions (manager can edit own team, admin all).
- Task 7.2: User invitation flow (admin invites by email → invitation email → user accepts via Google).
- Task 7.3: Team management UI (cards, detail drawer, add/remove/move members).
- Task 7.4: User management UI (admin only — table with role/team editing, deactivate).
- Task 7.5: Billing summary card on user-management page showing: trial status (days remaining or expired), active user count × 99 Kč = monthly total. Prices read from the Plan table, not hardcoded in the frontend.

**Exit criteria**: admin can invite a user, assign to a team, set role; manager can see only their team in all views.

### Phase 8 — Reports
- Task 8.1: Reports endpoints (leaderboard, velocity, loss-reasons, KPI by period).
- Task 8.2: Reports page UI with date-range picker, filters, chart grid, metrics table.
- Task 8.3: CSV export endpoint + frontend download.

**Exit criteria**: manager can filter by quarter, see all four charts, download a CSV matching on-screen data.

### Phase 9 — Auto-freeing background job
- Task 9.1: APScheduler setup; daily cron at 03:00 Europe/Prague.
- Task 9.2: Job logic: find companies where `ownership_expires_at < now()` AND `owner_user_id IS NOT NULL` AND no won-deal within last 365 days; set owner to NULL, write OwnershipHistory with reason=`freed_timeout`, write Activity.
- Task 9.3: Email notification to previous owner and their manager (use a transactional email service placeholder — log-only for MVP is acceptable if a provider isn't wired).
- Task 9.4: Endpoint for manual "free now" (admin/manager) and "reassign" (manager).
- Task 9.5: Frontend indicators: the orange/red badges on the companies list, the countdown on company detail.

**Exit criteria**: Tester can artificially age a company (via SQL or a test-only endpoint) and observe it getting freed by the next job run; notifications appear in logs; UI reflects the change.

### Phase 10 — Pipeline and settings
- Task 10.1: Pipeline customization endpoints (add/rename/reorder/delete stages).
- Task 10.2: Settings page with vertical tabs (Profil, Firma, Pipeline, Oprávnění read-only, Fakturace stub, Integrace stub).
- Task 10.3: Pipeline editor UI with drag-to-reorder, live preview.

**Exit criteria**: admin can rename a stage, reorder stages, see the change reflected in Kanban immediately.

### Phase 11 — Landing page
- Task 11.1: Marketing layout and nav.
- Task 11.2: Hero + key differentiators sections.
- Task 11.3: How-it-works + feature tour.
- Task 11.4: Pricing + FAQ + footer.
- Task 11.5: Mobile polish pass and Lighthouse optimization (target ≥90 mobile).
- Task 11.6: SEO basics (meta tags, OpenGraph, sitemap.xml, robots.txt).

**Exit criteria**: Lighthouse mobile score ≥ 90 on all four categories; tested on real iPhone and Android.

### Phase 12 — Deployment
- Task 12.1: Production `docker-compose.prod.yml` + Coolify configuration (Dockerfile-based deployment). Include Caddy/Traefik reverse proxy config. Prepare Coolify resource definitions for: FastAPI app service, Postgres service, scheduled backup job.
- Task 12.2: Env var documentation (`.env.example` complete, secrets list in README). Include Google OAuth, DB connection, ARES endpoint, email service, Sentry DSN.
- Task 12.3: Database backup script using `pg_dump` → Hetzner Object Storage (S3-compatible). Cron via Coolify scheduled task, daily at 02:00 Europe/Prague, retain 7 days.
- Task 12.4: Basic logging/monitoring — structured JSON logs, error tracking via Sentry EU (free tier). Uptime monitoring via UptimeRobot free tier.
- Task 12.5: Production smoke test checklist + runbook for rollback.

**Exit criteria**: Clean deployment to a fresh Hetzner CX23 with Coolify following README instructions, with HTTPS via Let's Encrypt, working Google OAuth, and ARES integration live.

---

## 12. Testing requirements

### Backend test organization — mandatory structure
Tests are organized as **one file per route module** under `backend/tests/api/v1/` and **one file per service** under `backend/tests/services/`. This structure is mandatory — follow it exactly.

**API integration tests** (hit the DB via async test client):
```
backend/tests/api/v1/
├── test_auth.py           # /auth/google/login, /callback, /me, /logout
├── test_companies.py      # all /companies/* endpoints
├── test_contacts.py       # all /contacts/* endpoints
├── test_deals.py          # all /deals/* endpoints
├── test_pipelines.py      # all /pipelines/* endpoints
├── test_teams.py          # all /teams/* endpoints
├── test_users.py          # all /users/* endpoints
├── test_reports.py        # all /reports/* endpoints
└── test_activities.py     # all /activities/* endpoints
```

**Service unit tests** (mock the DB, test business logic in isolation):
```
backend/tests/services/
├── test_ares_client.py
├── test_freeing_job.py
├── test_ownership.py
└── test_permissions.py
```

### Per-endpoint test minimum
Every API endpoint must have **at least three test functions**:
1. `test_<endpoint>_happy_path` — correct input, correct role, expected output.
2. `test_<endpoint>_validation_error` — malformed input returns 422 with meaningful error.
3. `test_<endpoint>_permission_denied` — wrong role returns 403.

For endpoints with ownership semantics (e.g., a salesperson trying to view another salesperson's company), add a fourth: `test_<endpoint>_cross_user_denied`.

### Coverage expectations
- **Backend**: target ≥ 80% line coverage. Every route module file in `app/api/v1/` must have a corresponding test file. Never create a route file without its test file.
- **Frontend**: unit tests on utility functions and non-trivial hooks. Component tests for forms and critical interactions (Kanban drag, ARES modal state machine, trial-expiry gate).
- **E2E**: Playwright flows covering: sign-in with mocked Google, create company via ARES, move deal across pipeline, invite team member, view dashboard as both roles, landing page CTA click, trial-expired blocking screen.
- **Mobile**: Playwright project running at 390px viewport for the top 5 flows.
- **Accessibility**: axe-core run on every page; target zero critical violations.

### Frontend type generation — CI enforcement
The generated types file `frontend/src/types/api.generated.ts` is the **single source of truth** for API types. Hand-written API types are forbidden.

CI must include:
1. `pnpm run types:generate` — runs `openapi-typescript` against the backend's `/openapi.json`.
2. `pnpm run types:check` — re-generates and diffs against the committed file. If they diverge, CI fails with a clear message: "API types are out of date. Run `pnpm run types:generate` and commit."
3. Never add a hand-written interface for an API response. The only source of truth is the generated file.

### Self-verification protocol (tester mode)
After completing the code for each task, explicitly switch to tester mode and:
1. Re-read the acceptance criteria line by line — check each one against the actual output.
2. Run the full test suite and confirm zero failures.
3. If the task involves UI: mentally walk through the screen at 390px and 1280px widths. Check that all interactive elements have focus states.
4. Check Czech text for vykání consistency and natural phrasing.
5. Log the result in `docs/work-log.md`: either `✅ PASS` or `❌ FAIL — [what's wrong]`.
6. If FAIL: fix the issue immediately, re-run tests, re-verify, then log `✅ PASS (after fix)`.

---

## 13. Operating protocol — task loop

### The loop (repeat for every task)
1. Read the implementation plan → pick the next task.
2. Write a brief task spec in `.claude/tasks/PHASE-N-TASK-M.md` (goal, files-in-scope, acceptance criteria). This takes 2 minutes and prevents scope drift mid-task.
3. **Build**: write code, migrations, tests.
4. **Verify**: switch to tester mode. Run lints, typechecks, tests. Re-read acceptance criteria. Fix issues.
5. **Commit**: `git add -A && git commit -m "feat(scope): description — Task X.Y"`
6. **Log**: update `docs/work-log.md` with task status `✅`.
7. Go to step 1.

### When to split a task further
If you catch yourself working on a task and it's been >45 minutes without a commit, you probably scoped it too large. Stop, commit what works, split the remainder into a new task, log both in `docs/work-log.md`.

### Commit discipline
- One logical change per commit.
- Conventional commits: `feat(pipeline):`, `fix(ares):`, `chore(deps):`, `test(e2e):`.
- Reference task ID in commit body: `Task 5.3`.
- WIP commits are fine and encouraged: `wip: Task 5.3 — stage model done, tests next`.

### When to read skill files
- **Before any frontend UI work**: read `.claude/skills/ui-design.md`.
- **Before the first FastAPI endpoint**: establish the house style from the brief's API section, then follow it consistently.
- **Before the first Playwright test**: check if `.claude/skills/e2e-playwright.md` exists.

### Documentation debt
Maintain `docs/` with:
- `docs/adr/` — Architectural Decision Records for non-obvious choices (e.g., why Authlib over python-social-auth).
- `docs/api.md` — cross-reference into generated OpenAPI docs.
- `docs/runbook.md` — how to operate the deployed system (backups, rotating secrets, restoring from backup, etc.).

---

## 14. Non-goals (MVP will not include)
Explicit so you don't get dragged into scope creep:

- Calendar integration
- Email sending from within CRM (transactional emails are fine; user-composed emails are not)
- Email tracking / sequences
- Marketing automation, landing pages builder
- Payment processing (billing shows amounts and blocks after trial; actual charge collection is out of scope)
- Multiple pipelines in UI (data model supports it, but UI exposes only the default — add in v1.1)
- Native mobile apps
- i18n framework (`react-i18next`) — use hardcoded Czech strings in components; systematic extraction in v1.1. The data model and formatting functions ARE i18n-ready (locale, currency fields, `Intl` formatters); the UI strings are not.
- Multi-language UI beyond Czech (Slovak is nice-to-have in v1.1, English in v1.2)
- Multi-currency pricing page (data model supports it via Plan table; UI shows CZK only for now)
- Non-Czech business registry integrations (interface is pluggable; only CzechAresService is implemented)
- Fakturoid/Pohoda/iDoklad integrations (stubbed in settings; real integration in v1.1)
- AI features of any kind

---

## 15. Definition of "project complete"

SimpleCRM v1.0 is done when:
1. All phases 0–12 are green per their exit criteria.
2. A non-technical Czech small-business owner can visit the landing page on their phone, sign in with Google, see their 30-day trial start, add their first company via ARES IČO lookup, and create their first deal in the pipeline — in under 5 minutes.
3. A manager can invite two salespeople, form a team, drag deals across the Kanban, and see a meaningful report — in under 10 minutes.
4. The auto-freeing job runs in production and has successfully freed at least one test company.
5. After 30 days, the trial-expired gate blocks CRM access with a clear "subscribe" message.
6. Lighthouse mobile scores on landing page are ≥90 in all four categories.
7. Zero critical a11y violations across the app.
8. Every API route module has a corresponding test file with ≥3 tests per endpoint.
9. Frontend types are auto-generated from the OpenAPI spec; CI fails if they drift.
10. README gets someone from clone to running locally in under 15 minutes.

---

## 16. One-line summary for every future confused moment

> **SimpleCRM is a minimal Czech CRM for small sales teams. Every decision should favor simplicity, Czech-nativeness, and readability of code over feature completeness. When in doubt, cut scope.**

---

**Begin by reading this entire document. Then:**
1. **Read `docs/work-log.md`** if it exists (you may be resuming a previous session).
2. **Read `RESUME.md`** if it exists (pick up exactly where the last session left off, then delete the file).
3. **If neither exists** (first session): create `docs/work-log.md` with your initial plan, then start Task 0.1.
4. **Work through tasks sequentially** following the loop in Section 13.
5. **If you sense the session ending**: stop, commit, write `RESUME.md`, update `docs/work-log.md`. The next session will find you.
