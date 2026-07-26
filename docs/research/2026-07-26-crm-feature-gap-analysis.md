# CRM feature gap analysis — SimpleCRM vs. Pipedrive & the SMB field

Date: 2026-07-26 · Internal research · Not a commitment to build anything.
Benchmarks: Pipedrive (primary), HubSpot free CRM, Zoho CRM + Bigin, Freshsales, Attio, folk.

---

## Executive summary

1. Pipedrive re-tiered in 2026: **Lite €14 / Growth €39 / Premium €59 / Ultimate €79** per seat/month billed annually (€24/49/79/99 monthly). The old Essential/Advanced/Professional/Power/Enterprise names are gone.
2. Pipedrive's **cheapest €14 tier** already ships: activities + reminders, custom fields (30), products catalog, deal rotting, import/export, duplicate merge, mobile apps, API + webhooks, goals. That is the real table-stakes line, and SimpleCRM is below it on six of those.
3. The single biggest hole is **activity/task management**. `calendar_events.deal_id` is NOT NULL, there is no task type, no done flag, no reminder. Every benchmark has this at its entry tier; G2 ranks it the #4 most-valued CRM feature.
4. Second biggest: **email open/click tracking**. We send but never learn whether anyone opened. HubSpot gives this away free; Pipedrive at €39. G2 ranks email tracking #7.
5. Third: **custom fields**. Pipedrive €14, Bigin €7, Attio free. G2 #9. Ours are hard-coded columns.
6. **Workflow automation** (G2 #5) is missing entirely — but it is also the industry's standard paid-tier gate, so it is a pricing lever, not just a gap.
7. SimpleCRM is genuinely *ahead* on Czech-specific ground: ARES IČO autofill, ISDOC + QR Platba invoicing, the company ownership/expiry model. Pipedrive has none of these. Don't trade that away chasing parity.
8. Two inventory lines were wrong: **CSV import exists** (admin-only wizard, companies+contacts, no deals) and **no email tracking fields exist** on `sent_emails` (confirmed).
9. Roughly half the "missing" list should stay missing — marketing suites, service desk, CPQ, VoIP, projects. They belong to a different product.
10. Recommended near-term order: activities → list search/filters → open tracking → email templates → deal rotting on cards. All S/M, all inside the current architecture.

---

## Benchmark pricing snapshot (per seat / month, annual billing)

| Vendor | Entry | Mid | Upper | Notes |
|---|---|---|---|---|
| **Pipedrive** | Lite €14 | Growth €39 · Premium €59 | Ultimate €79 | VAT excl.; 14-day trial; 5 paid add-ons on top |
| **HubSpot** | Free (2 users, 1 000 contacts) | Starter ~$15–20 | Professional $90–100 + $1 500 onboarding | Free tier is HubSpot-branded |
| **Zoho CRM** | Standard ~$14 | Professional ~$23 | Enterprise ~$40 · Ultimate ~$52 | USD figures blog-sourced; vendor page renders INR |
| **Bigin** (Zoho's minimal CRM) | Free · Express ~$7 | Premier ~$12 | Bigin 360 ~$18 | Closest positioning analogue to SimpleCRM |
| **Freshsales** | Free (3 users) · Growth $9 | Pro $39 | Enterprise $59 | Freddy AI and quotes are paid add-ons |
| **Attio** | Free (3 seats) | Plus €31 | Pro €74 | Custom objects on the free tier |
| **folk** | Standard $24 | Premium $48 | Enterprise $80+ | Per seat; sequences + API at Premium |

Reference point for pricing conversations: **Pipedrive Lite ≈ 350 CZK/seat/month.**

---

## Gap table

**Legend — who has it.** `P-Lite/Growth/Premium/Ultimate` = Pipedrive tier where the feature first appears · `H-free/H-start/H-pro` = HubSpot · `Z` = Zoho CRM · `B` = Bigin · `F` = Freshsales · `A` = Attio · `folk`.
**Status:** has / partial / missing. **Rel.** = relevance to a Czech SMB sales-only CRM.

### Lead & deal management

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| Kanban pipeline, drag & drop, stage config | everyone, entry tier | **has** | — | Core; we're at parity |
| **Activities / tasks (call, meeting, task, done flag)** | P-Lite, H-free, Z, B, F, A, folk | **missing** | **high** | Calendar events exist but require a deal and have no type/completion; G2 ranks activity tracking #4 |
| **Activity reminder alerts** | P-Lite, H-free, F | **missing** | **high** | Nothing reminds a rep of anything today |
| **"Next activity" on the deal card** | P-Lite, F | **missing** | **high** | The single field that turns a pipeline into a work queue |
| **Deal rotting / idle warning on the card** | P-Lite | **partial** | **high** | We compute stale deals as a *report widget*, but never surface rot on the kanban card |
| **Custom fields** | P-Lite (30), H-free (10), Z-Std, B-Express, A-free | **missing** | **high** | Every entity is a fixed column set; G2 #9 |
| Required / important fields | P-Growth, P-Premium | missing | med | Data-hygiene lever; only matters once custom fields exist |
| **Duplicate detection + merge** | P-Lite, H, folk (auto-merge) | **partial** | **high** | The import matcher dedupes on IČO/name/email, but there is no in-app "possible duplicates" view or merge action |
| **Server-side search / filter / sort on deals** | everyone | **partial** | **high** | `GET /deals` accepts only `company_id`; filtering is client-side over one page |
| **Global cross-entity search** | everyone | **missing** | **high** | Only companies have a `search` param |
| Leads inbox (pre-deal staging) | P-Lite, Z, F | missing | med | Useful, but our company-ownership pool partly covers the same job |
| Lead scoring | P-Premium (custom scores), H-pro, Z-Ent (Zia), F-Pro | missing | low | Needs volume SMBs rarely have |
| Products catalog | P-Lite, Z-Pro | missing | low | Sales-only positioning; our invoicing covers the money side |
| Quotes / CPQ / e-signature | P (Smart Docs add-on), Z-Pro, F (add-on) | missing | low | See "out of scope" — invoicing already answers the Czech need |

### Email & communications

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| Send email from the CRM, threaded to deal/company | P-Lite (inbox), all | **has** | — | Per-user SMTP, To/CC/BCC, attachments, reply threading |
| **Email open & click tracking** | P-Growth, **H-free**, Z-Pro | **missing** | **high** | `sent_emails` has no tracking columns; HubSpot gives opens away free — this is table stakes, not premium |
| **Email templates + signatures + merge fields** | P-Growth, **H-free** (3 templates), Z, F, B | **missing** | **high** | Every send is typed from scratch today |
| Bulk / group emailing | P-Growth, folk | **has** | — | Campaigns to filtered company lists with per-recipient status |
| Campaign result = opens/clicks, not just "sent" | P-Growth, H | **partial** | **high** | `EmailCampaignRecipient.status` is sent/failed/skipped — a delivery attempt, not engagement |
| Email scheduling (send later) | P-Growth | missing | med | Cheap once a scheduler job exists — one already does |
| Two-way email sync / inbox | P-Growth, H, Z, A, folk | **missing** | med | We are send-only by design; the real cost is that replies never land in the CRM |
| Sequences / automated follow-ups | P-Growth (5), H-pro, F-Pro, A, folk-Premium | missing | med | Standard paid-tier gate; worth having eventually as an upsell |
| **Meeting scheduler / booking link** | P-Growth, **H-free** (1 link) | **missing** | **high** | Google Calendar is already connected — the hard half is done |
| Video call scheduling | P-Growth | missing | low | Follows from the scheduler |
| Live chat / chatbot | H-free, Z | missing | low | Marketing/support surface, not sales |
| Phone / VoIP dialer, call logging | P-Lite (mobile), B-free, F-Growth | missing | low | Big build, weak fit for a web-first Czech SMB tool |

### Automation

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| **Workflow automation (trigger → action)** | P-Growth (50), Z-Std, B-free (3), F-Growth, folk | **missing** | **high** | G2 #5; the standard mid-tier gate — a monetization lever as much as a gap |
| Automatic owner assignment | P-Premium, Z-Std | missing | med | Our ownership/expiry model already does a Czech-specific variant of this |
| If/else branching, delay steps | P-Growth | missing | low | Only after basic automation exists |
| Scheduled background jobs (infra) | — | **has** | — | `services/scheduler.py` asyncio runners already drive nightly freeing + hourly charges |
| Blueprint / process enforcement | Z-Pro | missing | low | Enterprise process ceremony; against the positioning |

### Reporting

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| Dashboards with pipeline/win-rate/forecast widgets | P-Lite (default), all | **has** | — | 15 widgets + per-user layouts is genuinely strong for the price band |
| Custom dashboards (user-built layouts) | P-Premium | **has** | — | We ship at Lite price what Pipedrive gates at €59 |
| Forecast view / revenue forecast report | P-Growth | **has** | — | Forecast-by-close-month widget |
| Company & user goals | P-Lite | **missing** | med | Cheap, motivational, expected at entry tier |
| Team filters and goals | P-Premium | **partial** | med | Team filters exist; goals do not |
| CSV export of reports | P-Lite | **has** | — | `/reports/export-csv` |
| **CSV export from list pages** | P-Lite ("data import and export") | **partial** | med | Companies export exists; deals/contacts lists do not |
| Custom-field reports | P-Premium | missing | low | Blocked on custom fields |
| Report/dashboard sharing links | P-Lite | missing | low | Nice-to-have |

### Customization

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| Custom fields on deal/company/contact | P-Lite, H-free, Z-Std, B-Express, A-free | **missing** | **high** | See above — the most-cited "we can't use it" blocker in this category |
| Deal card customization (which fields show) | P-Lite | missing | med | Follows custom fields |
| Multiple pipelines | P-Lite, H-free (1), B-Express (3) | **missing** | med | The `pipelines` table has an `is_default` flag, but every endpoint is hard-wired to `/pipelines/default` — there is no create/list/switch. Effectively single-pipeline |
| Pipeline-specific / formula fields | P-Premium | missing | low | Upper-tier ceremony |
| Custom objects | A-free (3), folk | missing | low | Would betray the sales-only model |

### Integrations & API

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| Google / Microsoft calendar sync | P-Lite | **has** (Google) | — | Two-way; Microsoft absent, low priority for Czech SMB |
| Google / Microsoft contact sync | P-Lite | missing | low | Rarely load-bearing |
| **Public REST API + API keys for customers** | P-Lite, Z-free, B-free, A-free, folk-Premium | **missing** | **high** | Auth is JWT + refresh only; there is no key model. Blocks every integration conversation |
| **Outbound webhooks** | P-Lite, A-free | **missing** | med | `webhook_events` is inbound ComGate idempotency only |
| Zapier / Make.com listing | P, H, Z, F | missing | med | Make.com is widely used by Czech SMBs; needs the API + webhooks first |
| App marketplace (500+) | P-Lite | missing | low | Not a solo-product play |
| Gmail / browser extension | P-Lite, folk (LinkedIn) | missing | low | Meaningful build for narrow gain |
| **CSV import** | P-Lite, H-free, all | **partial** | med | Exists as an **admin-only** multi-file wizard for companies + contacts; **no deals import**, not available to managers |
| Data enrichment (firmographic) | P-Premium, A, folk | **partial** | — | ARES IČO lookup is a *better* Czech equivalent for company data |

### Mobile

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| Usable mobile experience | all | **has** | — | PWA install + mobile tab bar + long-press reorder |
| Native iOS/Android apps | P-Lite, H-free, Z, B, F | **missing** | low | PWA is the deliberate answer; revisit only if push notifications become essential |
| Offline access | P (mobile) | missing | low | Rarely decisive for B2B desk sales |
| Business card scanner, nearby contacts | P-Lite | missing | low | Field-sales features |

### AI

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| AI email drafting / summarization | P-Premium, H, Z-Ent | **missing** | med | The whole field is shipping this in 2026; a *small* scoped version (draft a follow-up) fits the positioning |
| AI report creation | P-Lite | missing | low | We already ship a strong widget catalog |
| AI lead scoring / deal insights | P-Premium, Z-Ent (Zia), F (Freddy add-on) | missing | low | Needs data volume SMBs lack |
| MCP server / agent access | P (ships one in 2026) | missing | low | Interesting signal, not a 2026 buying criterion for this segment |

### Admin & misc

| Feature | Who has it | SimpleCRM | Rel. | Reasoning |
|---|---|---|---|---|
| Roles, teams, per-user permissions | P-Premium (custom sets) | **has** | — | admin/manager/salesperson + teams, at entry price |
| 2FA / SSO | P-Lite | **missing** | med | Pipedrive has both at €14; we have neither. 2FA is the cheap half |
| Audit log / device history | P-Ultimate | **partial** | low | Activity timeline + super-admin audit exist; not a security audit log |
| **In-app notifications** | P-Lite, all | **missing** | **high** | No notification surface at all — a prerequisite for reminders and mentions |
| @mentions and comments on records | P-Lite | missing | med | Cheap collaboration win once notifications exist |
| File attachments on deals/companies | P-Lite | **partial** | med | Email attachments are sent but bytes are never persisted; no document store on a record |
| Onboarding wizard, help, i18n | P-Lite (24 languages) | **has** | — | cs/en + wizard + tutorial |
| Invoicing with QR Platba + ISDOC | **nobody** | **has** | — | Czech-specific advantage; Pipedrive needs a €32.50 add-on and still can't do ISDOC |

---

## Where SimpleCRM is already ahead

Worth defending, because none of the benchmarks can match it without a Czech-specific build:

- **ARES IČO autofill** — one field creates a validated company record. Pipedrive/HubSpot enrichment does not cover the Czech registry.
- **ISDOC + QR Platba invoicing** — a paid add-on category elsewhere, and even then not Czech-compliant.
- **Company ownership with expiry ("zamčení") + unowned pool** — a genuinely original answer to lead-hoarding that Pipedrive solves only with manual visibility groups at €59.
- **Editable dashboards at entry price** — Pipedrive gates custom dashboards at Premium (€59).
- **Czech-first UI with vykání** — localization quality, not just translation.

---

## Deliberately out of scope

These appear on every competitor grid. Ignoring them is the positioning working as intended, not a backlog:

- **Marketing automation, landing pages, email marketing suites, web-visitor tracking.** Pipedrive itself sells Campaigns and Web Visitors as separate add-ons — even they treat this as not-core-CRM.
- **Service desk / ticketing / live chat / chatbots** (HubSpot, Zoho). A different buyer and a different product.
- **CPQ, product configurators, quote approval flows, e-signature** (Smart Docs, Zoho Inventory). Our invoicing already answers the Czech "get paid" need with less ceremony.
- **Phone / VoIP dialer, call recording, power dialing.** Large build, telephony compliance surface, weak fit for web-first B2B.
- **Projects / delivery management after close** (Pipedrive Projects add-on). "Nic víc" starts exactly here.
- **Custom objects and a general data platform** (Attio's model). Attractive to engineers, fatal to a five-minute onboarding.
- **Territory management, sandbox accounts, field-level permissions, security rules** (Freshsales/Pipedrive Ultimate). Enterprise features for organizations SimpleCRM is not selling to.
- **App marketplace with 500+ integrations.** Ship an API and let Make.com be the marketplace.
- **Native mobile apps.** The PWA is the deliberate answer. Only reconsider if push notifications become a hard requirement.

**Borderline — flagged, not decided:** *two-way email sync (inbox)*. It is genuinely on the other side of the minimalism line, but "send-only" means replies never reach the CRM and reps context-switch to Gmail. If churn interviews surface this, it becomes a large (IMAP/Gmail API, storage, privacy) but legitimate project.

---

## Top 10 gaps worth closing

Ranked by (niche value × how far below the €14 table-stakes line we are) ÷ effort. Effort is calibrated against the actual codebase.

| # | Gap | Effort | Grounding in the architecture |
|---|---|---|---|
| 1 | **Activities/tasks + "next activity" on the deal card** | **M–L** | `calendar_events.deal_id` is NOT NULL and there is no type or done flag. Needs a migration making `deal_id` nullable (touches `EventFormModal`, the deal picker and Google sync), a new Postgres enum for activity type (`ALTER TYPE` outside a transaction — see CLAUDE.md), a `done_at` column, an optional `contact_id`, a "my day" list view, and a next-activity join on the pipeline query. The highest-value item in this document. |
| 2 | **Server-side search/filter/sort on deals + global search** | **S** | `GET /deals` filters only `company_id`; contacts has no `search` at all. Mirror the query-param pattern already in `api/v1/companies.py` (search/sort/order/owner/industry) and add a `/search?q=` endpoint fanning out over three ILIKE queries. Pure backend + hook changes, no schema. |
| 3 | **Email open tracking** | **S–M** | `sent_emails` has no tracking columns (verified). Add `tracking_token`, `opened_at`, `open_count`; add a public `GET /t/{token}.gif` route mounted *outside* `PROTECTED_DEPS`; inject the pixel in `services/email.py` at send time; mirror onto `EmailCampaignRecipient` so campaigns report opens, not just sends. Click tracking is a further M (link rewriting + a redirect endpoint). Caveat: own-SMTP + pixels needs a deliverability check. |
| 4 | **Email templates + signatures + merge fields** | **S–M** | New org-scoped `email_templates` table, `signature` on `user_smtp_settings`, a `{{contact.first_name}}` renderer in `services/email.py`, and a picker in the compose modal (copy the inline sub-form pattern from `AddDealModal`). No risky migrations. |
| 5 | **Deal rotting on the kanban card + goals** | **S** | The staleness calculation already exists in the `stale_deals` reports widget — lift it into the pipeline query and render a badge on the card. Goals are a small org/user table plus one widget in the existing catalog. Two cheap wins that both sit at Pipedrive's €14 tier. |
| 6 | **Duplicate detection + merge** | **S–M** | `services/imports/matcher.py` already indexes candidates by IČO/name/email — reuse it for a "possible duplicates" list and a merge endpoint that repoints `deals`, `contacts`, `sent_emails`, `activities` and `invoices` FKs to the survivor and writes an `Activity` row. Pipedrive ships this at €14. |
| 7 | **Custom fields (scoped)** | **M–L** | No JSONB custom-field infra exists. Needs a `custom_field_definitions` table (org, entity, key, label, type, options, order), a JSONB `custom_values` column on deal/company/contact, and dynamic validation — which fights the static Pydantic + generated-types pipeline, so the frontend needs a generic renderer rather than typed fields. **Scope it**: text/number/date/select only, deals + companies first, no filtering or reporting in v1. Full-fat (filters, reports, required fields) is a genuine L. |
| 8 | **Light workflow automation** | **M–L** | `services/scheduler.py` already runs periodic asyncio jobs, so the runtime exists. Add a `automation_rules` table with 3–4 triggers (stage changed, deal idle N days, deal won, company freed) × 3–4 actions (create activity, send templated email, reassign owner, add note). No branching, no delays in v1. Depends on #1 and #4. This is the industry's standard paid-tier gate — build it as an upsell, not a giveaway. |
| 9 | **Meeting scheduler / booking links** | **M–L** | The hard half is done: `google_calendar_connection` + two-way sync already exist, so free/busy is reachable. Remaining: availability rules per user, a public unauthenticated booking page (new route outside auth), slot-collision handling, and a confirmation email through the existing SMTP path. HubSpot gives one link away free, which makes this a visible checkbox in comparisons. |
| 10 | **Public API keys + outbound webhooks** | **M** | No API-key model exists. Add a hashed `api_keys` table scoped to org+role, a dependency that accepts either a JWT or a key, and reuse `RateLimiter` from `services/lookup_cache`. Outbound webhooks can copy the retry/idempotency thinking already in `webhook_events` and ride the existing scheduler. Unlocks Make.com/Zapier without building a marketplace. |

**Honourable mentions (small, not top-10):** open the import wizard to managers and add a deals importer (the field catalog and matcher already exist); CSV export from the deals and contacts lists (`data_export.py` only serves reports); 2FA (Pipedrive has it at €14); in-app notifications — cheap on its own but a hard prerequisite for #1's reminders and for @mentions.

---

## Inventory corrections (verified against the code today)

1. **CSV import: EXISTS, contrary to the working inventory.** `backend/app/api/v1/imports.py` + `backend/app/services/imports/` + `frontend/src/app/settings/import/`. It is a multi-file wizard with header→field mapping, a dry-run `/preview` with per-row diffs, a transactional `/commit`, company matching by IČO/name/email, and a 5-per-hour rate limit. **Limits:** admin role only (`require_role`), companies and contacts only — **no deals import**.
2. **Email open tracking: confirmed ABSENT.** `backend/app/db/models/sent_email.py` has no tracking fields — the model is explicitly documented as a send-only mail client with no inbox, and a "thread" is only the chain of mails we sent. `EmailCampaignRecipient.status` is `sent | failed | skipped`, i.e. delivery attempt, not engagement.
3. Also worth noting for accuracy: `GET /api/v1/deals` supports only a `company_id` filter (no search, no server-side sort), and there is no notification model anywhere in `backend/app/db/models/`.

---

## Sources

All accessed **2026-07-26**.

- Pipedrive pricing + full plan comparison matrix — https://www.pipedrive.com/en/pricing (vendor; page blocks scripted fetches, read via a real browser session). Tiers Lite/Growth/Premium/Ultimate, €14/39/59/79 annual, €24/49/79/99 monthly, VAT excl.; add-ons LeadBooster from €32.50, Projects €6.67, Campaigns €13.33, Web Visitors €41, Smart Docs €32.50.
- HubSpot free CRM feature list — https://www.hubspot.com/products/crm (vendor). Free tier: 2 users, 1 000 contacts, email open tracking, 3 templates, 3 snippets, 1 meeting link.
- HubSpot Sales Hub pricing — https://www.hubspot.com/pricing/sales (vendor). Starter price unclear across sources post-2024 restructure; Workflows and Sequences are Professional-gated.
- Zoho CRM pricing — https://www.zoho.com/crm/pricing/ (vendor; rendered INR only — the USD figures in this report are blog-aggregated and **not vendor-confirmed**).
- Bigin pricing — https://www.bigin.com/pricing.html (vendor; rendered INR only — USD figures blog-aggregated, **not vendor-confirmed**).
- Freshsales pricing — https://www.freshworks.com/crm/pricing/ (vendor). Free/Growth $9/Pro $39/Enterprise $59 annual; Freddy AI and branded documents are add-ons.
- Attio pricing — https://attio.com/pricing (vendor, EUR). Free/Plus €31/Pro €74 annual; a July-2026 change introduced a 10-seat cap on Plus. Sequences tier placement is **unclear** (vendor page and blogs disagree).
- folk pricing — https://www.folk.app/pricing (vendor). Standard $24 / Premium $48 / Enterprise $80+ annual; sequences and API at Premium. Custom-object tier placement **unclear** (two fetches disagreed).
- G2, "CRM software features users value most" — https://learn.g2.com/crm-software-features, published **2026-01-28**, based on G2 reviews Jan 2025–Jan 2026. Ranked: lead tracking, pipeline management, contact/account management, **activity/task tracking**, workflow automation, reporting, **email tracking**, integrations, **custom fields**, forecasting.
- SimpleCRM code, `main` @ 58f8ec1, read 2026-07-26: `backend/app/api/v1/imports.py`, `backend/app/db/models/sent_email.py`, `backend/app/db/models/calendar_event.py`, `backend/app/db/models/email_campaign.py`, `backend/app/api/v1/deals.py`, `backend/app/services/scheduler.py`.

**Reliability caveats.** Pipedrive figures come straight off the rendered vendor comparison table and are the most trustworthy here. Zoho and Bigin USD prices are blog-aggregated because the vendor pages served INR. HubSpot's Starter price and Attio's/folk's exact tier placements for sequences and custom objects are flagged unclear above; re-verify before quoting any of them externally.
