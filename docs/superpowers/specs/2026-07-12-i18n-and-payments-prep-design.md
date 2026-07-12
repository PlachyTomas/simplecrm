# Internationalization (cs + en, N-language ready) · international payments prep — design

Date: 2026-07-12
Status: **DRAFT — decisions approved via brainstorming Q&A (remote), NOT yet implemented.**
Owner review of the written spec pending. Next step when approved: invoke writing-plans.

## Goal

Make SimpleCRM fully bilingual (Czech + English) with infrastructure that scales to any
number of languages: app UI, marketing site, transactional emails, and generated invoice
PDFs. Separately, produce a researched plan for accepting international payments for
SimpleCRM's own subscriptions (currently ComGate, CZK-only, Czech-law invoicing) — research
first, no gateway committed yet.

## Approved decisions (owner Q&A, 2026-07-12)

- **Payments meaning:** billing for **SimpleCRM's own subscriptions** internationally (SaaS
  billing), not multi-currency features for CRM users' own invoicing.
- **i18n scope:** **everything** — app UI + marketing/landing + transactional emails +
  invoice PDFs. Repo becomes N-language ready; English is the first added language.
- **Locale model:** **per-user language** in the app (new `User.language`); org sets the
  default for customer-facing documents via existing `Organization.locale`; marketing site
  uses **`/en/` URL prefix** + language switcher (SEO); browser detection pre-auth.
- **Payments direction:** **research first** — compare ComGate-international, Stripe
  (Billing + Tax), and a merchant-of-record option (Paddle) with fees/effort, then decide.
- **Legal pages:** the 9 Czech legal pages stay **Czech-only** for now; EN site links to
  them with an "in Czech" note. International terms are part of the payments track (they
  need a legal rework for international billing anyway, so translating now is throwaway).
- **i18n stack:** **react-i18next with typed keys** — structured keys in JSON catalogs,
  TS augmentation for compile-time key checking. Backend mirrors with simple per-locale
  JSON catalogs + Jinja2 templates.

## Current-state map (survey findings 2026-07-12 — trust these, avoid re-exploring)

### Frontend copy surface
- **~131 files with Czech copy** (~74 in `src/app`, 21 `src/marketing`, 10 `src/admin`,
  8 `src/auth`, 12 `src/components`, 4 `src/lib`, 2 `src/onboarding`); estimated
  **1,500–2,000 distinct user-facing strings** (881 distinct quoted literals + JSX text
  nodes + diacritic-free labels).
- **No i18n library, no locale provider, no language switcher.** Only `AuthProvider` and
  `ThemeProvider` exist.
- Czech-only plural helpers `src/lib/i18n/plural.ts` (`csPlural`) and `nouns.ts` (`csNoun`,
  7 nouns); call sites in `AppShell.tsx:110`, `TrialBanner.tsx:50`, `BillingSection.tsx:300,385`,
  `PipelinePage.tsx:510,613`, `DealsListPage.tsx:89`, `CompaniesListPage.tsx:52,805`.
  Duplicate local `csNoun` in `onboarding/CreateOrgPage.tsx:385`; hand-written plural
  ternaries in `OrganizationSection.tsx:254`, `ObjednavkaPage.tsx:217`, `LandingPage.tsx`.
- **~40 `Intl.*` sites, two patterns:** locale-aware via `user?.organization?.locale ?? "cs-CZ"`
  (pipeline, deals, dashboard, calendar, companies, emails, events, AppShell, reports
  `useOrgLocale()`), and **hardcoded `'cs-CZ'`** in `UsersSection.tsx`, `InvitationsSection.tsx`,
  `BlockedCompaniesSection.tsx`, `billingShared.ts`, `OrganizationSection.tsx`,
  `ActivityRow.tsx`, `GlobalFilterBar.tsx`, `list-widgets.tsx`, `admin/OrgList.tsx`,
  `admin/OrgDetailDrawer.tsx`, `components/billing/format.ts` (also hardcodes CZK).
- Money formatting duplicated: `reports/dashboard/format.ts` (default `'cs-CZ'`, literal
  `"dní"`/`" %"` suffixes), `components/billing/format.ts` (`formatCzk*`), inline
  `formatMoney` re-implementations in `PipelinePage.tsx`, `DealsListPage.tsx`,
  `DashboardPage.tsx`.
- Hidden copy: **56 `usePageTitle` call sites** (`src/lib/usePageTitle.ts`), **140
  aria-labels** across 62 files, ~90 Czech `title=` attrs, **67 toast calls**, Czech
  validation/`setError` messages, **13 enum-label maps** (`activities/activityLabels.ts`
  ACTIVITY_LABEL/FIELD_LABEL/CHANGE_FIELD_LABEL, ROLE_LABEL ×2, STAGE_TYPE_LABEL,
  PAYMENT_KIND_LABEL, PAYMENT_STATUS_PILL, TAX_INVOICE_KIND_LABEL, ACTION_LABEL,
  REASON_LABEL, GROUP_LABELS in `settingsNav.ts`, STATUS_LABEL), recharts KPI/chart labels
  in reports widgets, Czech import-header alias maps in `settings/import/detectFileRole.ts`.
- Marketing: `src/marketing/` 24 files ~4,973 lines (LandingPage 826 lines, CenikPage +
  `cenikData.ts`, ObjednavkaPage, demo sections, cookie-consent); `src/marketing/legal/`
  9 files, 1,370 lines of legal prose. Czech routes in `App.tsx`: `/cenik`, `/objednavka`,
  `/objednavka/navrat`.
- **Tests:** 22 of 32 vitest files assert Czech UI text; fixtures hardcode
  `locale: "cs-CZ"`; 1 Playwright e2e (`tests/e2e/smoke.spec.ts`).

### Backend copy + locale surface
- API errors: mostly developer English (`"Contact not found"`); auth/onboarding use
  **structured error codes** (`{"code": "weak_password"}`) mapped to Czech by the frontend;
  **`app/api/v1/payments.py` has customer-facing Czech strings** (lines ~142, 156, 224,
  260, 403).
- Emails: inline Czech f-string builders in `app/services/email.py`
  (`build_freed_company_email`, `build_subscription_pending_email`,
  `build_billing_info_reminder_email`, `build_verification_email`,
  `build_password_reset_email`) and `app/services/invitations.py:115`
  (`_build_invite_email`). Exception: invoice email = Jinja2 templates stored on the
  `BillingSettings` DB singleton, rendered by `app/services/invoicing/mailer.py`.
  Transport: smtplib → Zoho (`smtp_from_invoices`/`smtp_from_info`).
- Invoice PDF (only PDF type): Czech tax invoice, `app/services/invoicing/templates/invoice.html.j2`
  (labels Dodavatel/Odběratel/DUZP/…, `<html lang="cs">`); renderer
  `app/services/invoicing/renderer.py` uses **Babel hardcoded `locale="cs_CZ"`**
  (currency/decimal/long dates); embeds **QR Platba (SPAYD)** via `qrplatba`, emits
  **ISDOC 6.0.1 XML**; WeasyPrint pinned `>=63.0,<64` for byte-deterministic PDFs
  (sha256 integrity).
- Locale data model: `Organization.locale` (str, default `"cs-CZ"`), `.currency`
  (default `"CZK"`), `.region` (PG enum `organization_region`, single value `"eu-cz"`).
  **`User` has no language field**; `User.preferences` JSONB is allowlisted to tutorial
  keys only (`app/schemas/user_preferences.py`, `extra="forbid"`).
- Money: CRM deals = `Numeric(14,2)` + per-deal `currency` (defaults to org currency);
  billing = **integer minor units** (`Invoice.*_minor`, `Charge.amount_minor`,
  `Plan.price_per_user_minor`). **Hardcoded price ladder** in
  `app/services/billing.py:108-115` (`monthly_per_user = 9900`, `annual_per_user = 99600`).
  No FX/conversion anywhere. VAT default 21.00 on `BillingSettings`; `compute_with_vat`
  back-calculates net/VAT from gross.
- PG enums: all-English internal values; Czech labels live only in frontend maps. Good.
- Czech-only integrations/fields: ARES registry (`app/services/business_registry.py`,
  `CzechAresService`, registry keyed `{"CZ": ...}`, raises for non-CZ), IČO validation
  `r"^\d{8}$"` in `schemas/company.py`, `organization.py`, `blocked_company.py`,
  `invitation.py`, `auth.py`; `variable_symbol`, `issuer_account_domestic`, flat
  street/city/zip address (no country field anywhere).
- Payments stack: **ComGate** (`app/services/comgate.py`, config in `app/core/config.py`,
  unsigned webhook verified by re-query); routers `payments.py`, `subscription.py`,
  `plans.py`, `admin_invoices.py`; services `billing.py` (proration, dunning, comp/
  enterprise), `invoicing/*`, `scheduler.py` (renewal/overdue sweeps); models plan/
  subscription/charge/payment_method/invoice/invoice_line/invoice_counter/
  invoice_audit_log/billing_settings/webhook_event. Plans: trial/monthly/annual/
  enterprise/comp, per-seat. **`organization.stripe_customer_id` is vestigial** — no
  Stripe code exists.

## Design — Part 1: i18n

### Language model
- New column **`User.language`** (String(8), NOT NULL, default `'cs'`; values from
  `SUPPORTED_LANGUAGES`). Alembic migration; exposed on current-user schema; editable via
  users PATCH (own profile) and surfaced in app settings with a language picker.
- **`User.language` drives:** app UI language, on-screen `Intl` formatting locale, and
  emails addressed to that user (verification, password reset, freed-company notice,
  subscription/billing reminders to admins — recipient is a user).
- **`Organization.locale` keeps driving:** customer-facing documents — invoice PDF +
  invoice email — and invitation emails (recipient has no account yet). Unchanged schema.
- **`SUPPORTED_LANGUAGES = ['cs', 'en']`** defined once per side (backend
  `app/core/i18n.py`, frontend `src/lib/i18n/languages.ts`). Adding language N = add
  catalog files + one array entry. `cs` is the reference locale and fallback everywhere —
  a missing key can never render blank.

### Frontend architecture
- Deps: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
- Catalogs: `src/locales/{cs,en}/<namespace>.json`. Namespaces per feature for lazy
  loading and small merge surface: `common` (shell/nav/shared widgets/toasts), `auth`,
  `onboarding`, `marketing`, `admin`, `deals`, `companies`, `contacts`, `calendar`,
  `reports`, `settings`, `emails`, `billing`, `dashboard`. Lazy-loaded via Vite dynamic
  import keyed by route area; `cs` `common` bundled eagerly.
- **Typed keys:** TS augmentation (`i18next.d.ts`) generated from the `cs` catalogs
  (`resolveJsonModule` import types) → compile-time key checking; CI runs a
  catalog-parity check (en has every cs key or intentionally falls back).
- **Plurals:** i18next count forms (`key_one/_few/_other`, CLDR rules per language).
  Replace all `csPlural`/`csNoun` call sites, the duplicate in `CreateOrgPage.tsx`, and
  hand-written ternaries; delete `src/lib/i18n/plural.ts` + `nouns.ts` when empty.
- **Formatting consolidation:** single `src/lib/format.ts` (`formatMoney(amount,
  currency, locale)`, `formatDate`, `formatNumber`, `formatPercent`) + a `useLocale()`
  hook: returns the user's language mapped to a formatting locale (`cs → cs-CZ`,
  `en → en-GB`), falling back to `organization.locale` pre-auth. Replaces the ~12
  hardcoded `'cs-CZ'` sites and the 3 inline `formatMoney` duplicates.
  `components/billing/format.ts` generalizes from CZK-only to `(minor, currency, locale)`.
- **Detection order:** logged-in = `user.language` (authoritative, synced on login);
  pre-auth/auth pages = localStorage → browser (`navigator.language`); marketing = URL
  prefix (see below). Switching language in-app PATCHes the user and flips i18next live.
- **Everything through `t()`:** page titles (`usePageTitle`), aria-labels, `title=`
  attrs, toasts, validation messages, enum-label maps (→ `t('activities:label.note')`
  etc.), chart/KPI labels, empty states. The import-header alias maps in
  `detectFileRole.ts` get **English aliases added alongside Czech** (functional widening,
  not translation — both languages always detected).
- **Backend error codes → localized messages:** frontend continues mapping structured
  codes; the map moves into catalogs.

### Marketing site + SEO
- Czech stays at root (`/`, `/cenik`, `/objednavka`); English under **`/en/`** with
  **localized slugs** via a central slug map (`/cenik` ↔ `/en/pricing`,
  `/objednavka` ↔ `/en/order`). Router: marketing route tree rendered twice from one
  config (root = cs, `/en/*` = en); unknown `/en/<czech-slug>` redirects to the mapped slug.
- `<html lang>` synced to active language; **hreflang alternate** link tags on marketing
  pages; language switcher in marketing header + footer (preserves current page via slug
  map). Sitemap (if/where generated) lists both variants — verify during implementation.
- **Legal pages remain Czech-only** at their current routes; EN footer links to them with
  an "(in Czech)" note. No EN legal content in this track.
- Pricing page copy is translated, but **prices remain CZK** in this track (EUR display
  belongs to the payments track).

### Backend architecture
- **`app/core/i18n.py`**: `SUPPORTED_LANGUAGES`, `DEFAULT_LANGUAGE = 'cs'`,
  `t(lang, key, **params)` reading `app/locales/{cs,en}/<ns>.json` (loaded once at
  startup; `str.format` interpolation; count-form suffix selection via Babel plural
  rules for parity with the frontend).
- **Emails:** the 6 inline builders become per-locale Jinja2 files
  `app/templates/emails/{lang}/<name>.txt.j2` + subject lines in catalogs; a small
  render helper picks the language: emails to a user account (verification, password
  reset, freed-company, subscription/billing reminders to admins) → recipient's
  `User.language`; emails to non-users (invitation, invoice delivery to the billing
  contact) → org locale-derived language. The DB-stored invoice email
  template on `BillingSettings` stays (super-admin editable) but gains a per-language
  pair of fields — default templates seeded for cs + en.
- **Invoice PDF:** template labels move to catalog lookups with a `lang` template param;
  Babel formatting switches from hardcoded `cs_CZ` to org-locale-derived Babel locale.
  **QR Platba + ISDOC attach only for CZK invoices** (guard added; today all invoices are
  CZK so behavior is unchanged). `<html lang>` follows document language. Byte-determinism
  only matters per-invoice going forward; existing stored PDFs and their hashes are
  untouched.
- **`payments.py` Czech strings → structured error codes** (auth-flow style), frontend
  maps them via catalogs. Pydantic 422 messages stay English (developer-facing; frontend
  validates user-visibly) — explicitly out of scope.

### Testing
- Vitest setup boots i18next **synchronously with cs catalogs** → all 22 Czech-asserting
  test files keep passing unchanged. New tests: language switcher PATCH + live flip,
  en smoke render of key pages, catalog-parity check, backend `t()` unit tests, en email
  snapshot, en invoice PDF render (labels + Babel formatting).
- Playwright verification per migration batch in **both languages** (screenshots).

### Execution shape (input for writing-plans)
1. Infra first: deps, i18next init, typed keys, `useLocale`, `format.ts`, backend
   `i18n.py`, `User.language` migration + API, test-setup wiring.
2. Then externalize by area, each batch = extract strings to cs catalog → translate to
   en → replace literals with `t()` → verify (tests + Playwright cs/en):
   auth → common/shell → onboarding → deals/pipeline → companies/contacts → calendar/
   events → dashboard/reports → settings (incl. import aliases) → emails/bulk-email →
   billing UI → admin → marketing (+ slug routing/SEO).
3. Backend batches: error codes in payments.py → email templates → invoice PDF.
4. Language switcher UI (app settings + auth pages + marketing header) once app strings
   exist.
- Suited to subagent batching (budget-optimal-ultracode) — each batch is mechanical and
  independently verifiable.

## Design — Part 2: international payments prep (research-first plan)

**Deliverable = researched comparison + prep backlog. No gateway code in this track.**

### Research phase (deep-research, cited)
Compare for SimpleCRM's per-seat SaaS subscriptions (CZ base, EU-first expansion):
1. **ComGate international** — real capabilities: currencies (EUR at minimum), foreign
   card acceptance, recurring/token payments for non-CZ cards, payout/settlement,
   fees for foreign cards, API support for multi-currency price points.
2. **Stripe (Billing + Tax)** — fees incl. EU cards + Stripe Tax pricing; OSS VAT
   handling; CZK + EUR support; coexistence with in-house Czech invoicing (QR Platba/
   ISDOC stay ours); migration/coexistence patterns with ComGate; SEPA/other EU methods.
3. **Merchant of record (Paddle; note Lemon Squeezy)** — MoR takes over EU OSS VAT
   compliance entirely (they are the seller); fees vs Stripe+self-managed VAT; invoicing
   implications (MoR invoices the customer — how that composes with our Czech tax
   invoices for CZ customers); B2B reverse-charge handling; suitability for a solo founder.
4. **Compliance baseline:** when OSS registration becomes mandatory for B2C SaaS in EU,
   B2B reverse-charge (VIES validation), non-EU (UK/US) exposure — enough to rank the
   options' true total cost (fees + compliance effort), not to be legal advice.
Output: research report at `docs/superpowers/reviews/2026-07-12-intl-payments-research.md`
with fee tables, effort estimates, risks, and a recommendation. Owner decides the
direction at this gate.

### Direction-agnostic prep backlog (safe before the gateway decision)
- **Multi-currency price ladder:** replace hardcoded `9900`/`99600` in
  `billing.py:108-115` with `Plan` rows per (interval, currency) — CZK seeded now, EUR
  row addable without code.
- **Country on billing identity:** `country` field on org billing info +
  `BillingSettings` customer snapshot + `Invoice` customer block; default `"CZ"` for all
  existing rows.
- **IČO/DIČ generalized:** optional for non-CZ orgs; validation applies the `^\d{8}$`
  rule only when country == CZ; label becomes "company ID / VAT ID" per locale.
- **VIES VAT-ID validation** for EU B2B (reverse charge readiness); ARES stays the CZ
  registry, `BusinessRegistryRegistry` already keys by country — add VIES as the EU
  fallback for identity checks (no ARES-equivalent enrichment expected).
- **Pricing page multi-currency display capability** (component reads currency from plan
  data; content unchanged until EUR plans exist).
- Delivered by the i18n track already: invoice/email locale decoupling, EN invoice
  labels, QR/ISDOC guarded to CZK.

### Decision gate
Owner picks the gateway from the research report → that direction gets its own
brainstorm-lite + implementation plan (webhooks, checkout, dunning, invoice composition).

## Out of scope (explicit)
- Translating the 9 legal pages (deferred to the payments/legal track).
- EUR prices going live / any gateway integration code.
- Multi-currency for CRM users' own deals beyond what exists (per-deal currency label).
- Pydantic 422 localization; localizing developer-facing API errors.
- `Organization.region` enum expansion, timezone support.
- Third language content (infrastructure only).

## Risks / notes
- String migration is wide (~131 files) but mechanical; typed keys + cs-fallback prevent
  silent regressions; batch-wise Playwright verification in both languages.
- `components/billing/format.ts` is asserted in tests as CZK-formatted output — those
  tests keep passing (cs default) but the helper's signature change touches billing tests.
- Invoice PDF integrity: template changes affect only newly generated PDFs; stored hashes
  remain valid for stored bytes.
- Invitation emails use org language until invitees can choose (acceptable; invitee picks
  their own `User.language` at signup).
- Marketing route duplication must not regress the Czech routes' SEO (root URLs unchanged,
  hreflang added).
