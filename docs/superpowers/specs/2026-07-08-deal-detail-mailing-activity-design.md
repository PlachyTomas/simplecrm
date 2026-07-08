# Deal detail dialog · single-email mailing · comprehensive activity feed — design

Date: 2026-07-08
Status: **DRAFT — decisions approved via brainstorming Q&A, NOT yet implemented.**
Owner review of the written spec still pending. Do not start implementation without an
explicit ask. Next step when resumed: owner reviews this spec → then invoke writing-plans.

## Goal

Turn each deal into a clickable **dialog** (from both the pipeline kanban and Firmy →
obchody), render Firmy → obchody as a full **table**, add a **send-only mailing** capability
(compose/send/reply + per-deal/company sent history) reachable from the deal dialog and each
obchody row, and make the Firmy → **aktivita** timeline show **everything** that happens to a
company and its deals. Creating a calendar event from a deal (optionally pushed to Google
Calendar) already exists and is only surfaced inside the new dialog — it is not rebuilt.

## Approved decisions (owner Q&A, 2026-07-08)

- **Mailing scope:** send-only composer + history. Compose, send, reply-to-a-logged-thread,
  and sent history per deal/company. **No inbox** (receiving would need IMAP + sync infra —
  explicitly out of scope). Builds on the existing per-user SMTP + `email.py` transport.
- **Composer capabilities beyond baseline:** **CC/BCC** and **multiple attachments**.
  NOT saved templates, NOT rich-text/HTML (plaintext body stays). Baseline = To, subject,
  plaintext body, one attachment, gated when SMTP unverified.
- **Deal detail form factor:** **dialog everywhere, drop the standalone page.** `/app/deals/:id`
  no longer renders a full page; it redirects so the dialog opens over the deals list
  (bookmark-safe). One reusable dialog opened from pipeline cards, obchody rows, deals list.
- **Activity feed:** **comprehensive timeline.** Log deal created/edited/stage-moved/won/lost,
  company edited, event created, email sent — and surface deal & event activity on the parent
  company's timeline.

## Current-state map (findings from codebase exploration 2026-07-08 — trust these, avoid re-exploring)

### Activity feed
- Model `backend/app/db/models/activity.py:20` — polymorphic: `entity_type` +
  `entity_id` (UUID, **no FK**), `user_id` (nullable), `activity_type`, `payload` (JSONB),
  `created_at`, `organization_id`.
- Enums `backend/app/db/models/enums.py` — `ActivityEntityType` (line 27):
  `company, contact, deal, organization`. `ActivityType` (line 62/71): `note, stage_change,
  owner_change, deal_won, deal_lost, company_freed, ownership_reassigned, subscription_change,
  email_sent`. Native PG enums → new values need `ALTER TYPE ... ADD VALUE` (additive, run
  outside a txn block per Alembic enum rules).
- **Write-sites (only these 7):** `deals.py:291` (stage_change), `:358` (deal_won),
  `:413` (deal_lost) — all keyed `entity_type=deal, entity_id=deal.id`;
  `services/freeing.py:63` (company_freed / ownership_reassigned, entity company);
  `services/bulk_email.py:565` `_log_activities` (email_sent, entity company, one per company);
  `services/billing.py:208` + `services/scheduler.py:493` (subscription_change, entity org).
- **No activity on:** `create_deal` (`deals.py:141-186`), `update_deal` (`:189-222`),
  `update_company` (`companies.py:481-516`), event create/update (`events.py`), single email.
- List endpoint `backend/app/api/v1/activities.py:26` — `GET /api/v1/activities?entity_type=&entity_id=`,
  org-scoped, `created_at DESC`, paginated. Read-only.
- Frontend: hook `frontend/src/app/activities/useActivities.ts:17`; `ActivityTab` in
  `frontend/src/app/companies/CompanyDetailPage.tsx:291` queries
  `{entityType:"company", entityId:companyId, limit:50}`. `ACTIVITY_LABEL` map (`:282-289`)
  is **missing** `email_sent`, `ownership_reassigned`, `subscription_change` → they render as
  the raw enum string.
- **Root cause of "nothing after adding a deal":** (1) deal creation writes no activity;
  (2) deal activities that do exist are keyed `entity_type=deal`, and the company tab only
  reads `entity_type=company`, so they never surface on the company timeline.

### Deals
- Model `backend/app/db/models/deal.py:32` — `id, organization_id, company_id (:57),
  primary_contact_id (:62 nullable, SET NULL), stage_id, owner_user_id (:71), name, value,
  currency, probability_override, expected_close_date, closed_at, lost_reason, is_paid (:93),
  paid_at (:96), created_at (:98), updated_at`. **No description/notes field.**
- Schemas `backend/app/schemas/deal.py` — `DealCreate:10`, `DealUpdate:22` (adds `lost_reason`;
  `is_paid/paid_at/closed_at` server-managed, not settable here), `DealOut:47`
  (**flat — FK IDs only, no nested company/stage/owner/contact**).
- Endpoints `backend/app/api/v1/deals.py` — `GET /deals` `list_deals:107` (`company_id?` filter
  `:110`, `Page[DealOut]`, `created_at DESC` — this is what obchody uses); `GET /deals/{id}:132`;
  `POST:141`; `PUT:189`; `move-stage:225`; `mark-won:308`; `mark-lost:377`; `payment:431`;
  `DELETE:474` (admin-only).
- Pipeline `frontend/src/app/pipeline/PipelinePage.tsx` — `DealCard:95` is a draggable
  `<article role=button>` with **no onClick/navigation**; `MobileDealCard:205`; `StageColumn:414`
  renders cards `:488`. Dialogs: `AddDealModal:934`, `MarkLostDialog:943`, local
  `DeleteConfirmDialog:990` (drag onto `TrashDropZone:962`). Board hook
  `frontend/src/app/pipeline/useBoard.ts:17` → `/api/v1/pipelines/default/board`;
  `BoardDeal = DealOut` (flat).
- Company obchody `frontend/src/app/companies/CompanyDetailPage.tsx` — `TABS:27` ("Obchody"
  key `"deals"`), local `DealsTab:231` uses `useDeals({companyId,limit:100})`, renders a bare
  `<ul>:252` (name + "Uzavřeno {date}" + value), each item a `<Link to=/app/deals/:id>`.
- Deal detail (today) `frontend/src/app/deals/DealDetailPage.tsx:36` — inline-editable full page
  (`EditState:26` = name/value/expected_close_date/owner_user_id/stage_id/probability_override/
  primary_contact_id), shows **Vytvořeno** (`:389`), embeds `DealEventsSection` (`:419`),
  `MarkLostDialog` (`:421`). Hooks `frontend/src/app/deals/useDeals.ts` (`useDeals:18,
  useDeal:34, useUpdateDeal:43, useDeleteDeal:59, useDeleteAnyDeal:74`);
  `useDealActions.ts` (win/lose/payment). All-deals table `DealsListPage.tsx`.
- Contact model `backend/app/db/models/contact.py:18` — `first_name, last_name, position,
  email (:45 nullable), phone, company_id (:37 nullable, SET NULL), note`. Frontend
  `frontend/src/app/contacts/useContacts.ts` (`useContacts({companyId,limit}):17`, `useContact:33`).

### Calendar events (create-from-deal + Google push ALREADY EXISTS)
- Model `backend/app/db/models/calendar_event.py:29` — **`deal_id` NOT NULL (`:55`)**, no
  `company_id`; `owner_user_id` nullable (`:62`); `title, description, location, starts_at,
  ends_at` (Check `ends_at>starts_at` `:39`), `google_event_id`, `google_sync_status`
  (`not_synced|synced|error`). `GoogleCalendarConnection` (`google_calendar_connection.py:18`)
  one per user.
- Endpoints `backend/app/api/v1/events.py` — `POST /events` `create_event:256`
  (`CalendarEventCreate` `schemas/calendar_event.py:11`, incl. `add_to_google:22`; owner forced
  to current user; deal must be visible via `_get_visible_deal:75`); `GET /events` `list_events:216`
  (filters `from/to/deal_id`, owner-scoped, denormalized `deal_name`); `PUT:287`; `DELETE:332`.
  Google OAuth `backend/app/api/v1/google_calendar.py:38`; status `connection_status:150`.
- Frontend — standalone `frontend/src/app/calendar/CalendarPage.tsx` (route `calendar`,
  view-only, cannot create). **Create is only from the deal:** `DealEventsSection.tsx` (rendered
  at `DealDetailPage.tsx:419`) → `EventFormModal.tsx` (add-to-Google checkbox `:265`;
  `googleAvailable = connected && !sync_broken` `:60`). Status hook
  `frontend/src/app/settings/useGoogleCalendar.ts:12` (`useGoogleCalendarStatus`); events hooks
  `frontend/src/app/events/useEvents.ts`.
- **Takeaway:** the "create event from deal, optionally push to Google" flow is complete
  end-to-end. New work only re-mounts `DealEventsSection` inside the dialog.

### Email / SMTP
- Per-user SMTP `backend/app/db/models/user_smtp_settings.py:26` — `host, port, use_ssl,
  use_starttls, username, password_encrypted` (Fernet via `app.core.token_crypto`), `from_email,
  from_name, verified_at` (**the send gate**). API `backend/app/api/v1/user_smtp.py`
  (`GET /me/smtp:65`, `PUT:76` — any credential change resets `verified_at=None` `:107`,
  `POST /me/smtp/test:114` sets `verified_at`, `DELETE:131`; `smtp_config_for(row):51`
  decrypts into a send-ready `SmtpConfig`).
- Transport `backend/app/services/email.py` — `SmtpConfig:206`, `_send_via_smtp_config:236`,
  `verify_smtp:285`, `send_email_via(message,config):275` (async per-user send),
  `send_email:310` (global transactional), `Email`/`EmailAttachment` (`:34/:47`),
  `_build_mime:174` (attachments + optional Reply-To). **No single-recipient user send endpoint
  exists today.**
- Bulk `backend/app/services/bulk_email.py` (`resolve_recipients:196`, `send_campaign:380`,
  `_require_verified_smtp:258`, `_log_activities:565`) + API `backend/app/api/v1/bulk_email.py`
  (`/companies/bulk-email`: `POST /recipients:50`, `POST /send:59` multipart, attachment
  allowlist `:36-47` + 10 MB cap `:76-85`, `GET /campaigns:110`, `GET /campaigns/{id}:137`).
  Models `email_campaign.py` (`EmailCampaign:28`, `EmailCampaignRecipient:73` status
  `sent|failed|skipped`). **Attachment bytes are NOT persisted (filename only).**
- Frontend — `frontend/src/app/settings/SmtpSettingsCard.tsx` +
  `frontend/src/app/settings/useSmtpSettings.ts` (`isSmtpConfigured:17`, **`isSmtpVerified:22`** —
  the UI gate to reuse). Bulk UI `frontend/src/app/companies/bulk-email/` (`BulkEmailWizard.tsx`,
  `EmailCampaignsPage.tsx`, `useBulkEmail.ts`). Bulk gate in `CompaniesListPage.tsx:158`
  (`smtpReady = isSmtpVerified(smtp)`).

---

## Design

### Workstream 1 — Deal detail dialog (replaces the page)

**Refactor.** Extract the current `DealDetailPage` body into a reusable presentational
`DealDetail` component (`frontend/src/app/deals/DealDetail.tsx`) that takes a `dealId` and an
`onClose`. Wrap it in **`DealDetailDialog`** — a large centered modal (max-w ~640–720px,
internal `overflow-y-auto`, max-h ~90vh) built on the shared `frontend/src/lib/useModalDialog.ts`
(focus-trap + Escape + backdrop-click, from the 2026-07-08 a11y commit).

**Openers.**
- Pipeline: make `DealCard` / `MobileDealCard` open the dialog on click/Enter/Space, without
  breaking drag (open on click that is not a drag; keep `role="button"`). Win/lose/paid controls
  keep working and `stopPropagation` so they don't open the dialog.
- Obchody table rows (workstream 2) and the all-deals `DealsListPage` rows open the same dialog.

**Routing / bookmark-safety.** Drop the full-page render. `/app/deals/:dealId` **redirects** to
`/app/deals?deal=:dealId` (deals list with the dialog open). The dialog is opened by a `?deal=`
query param, read on the pipeline, company detail, and deals-list pages; closing clears the param.
This keeps existing bookmarks/deep-links alive while removing the standalone page.

**Content** = everything the page shows today: status pill, inline-edit of name / contact person
/ owner / stage / value / expected-close / probability, **Vytvořeno** (created date), win / lose /
reopen / delete, the embedded **Události** section (`DealEventsSection`, unchanged), **plus** a
"Poslat e-mail" action (workstream 3) and a sent-email history block (workstream 3). Optionally a
compact per-deal activity list (workstream 4) — nice-to-have, not required for v1.

### Workstream 2 — Firmy → obchody table

**Backend.** Add `DealListItemOut` (schema) = `DealOut` fields **plus** denormalized display
fields: `company_name`, `stage_name`, `owner_name`, `primary_contact_name`,
`primary_contact_email`, `company_email`. `GET /deals` returns `Page[DealListItemOut]` (join/load
stage, owner, company, primary_contact). Mirrors the existing `deal_name` denormalization on the
events list. Reused by both the obchody tab and the all-deals `DealsListPage`.

**Frontend.** Replace `DealsTab`'s `<ul>` with a `<table>` (wrap in `overflow-x-auto`). Columns:
**Název · Fáze · Hodnota · Vlastník · Hlavní kontakt · Vytvořeno · Stav** + an actions cell
(**Poslat e-mail** icon button, gated per workstream 3). Row click opens `DealDetailDialog`;
action-cell buttons `stopPropagation`. Status derived: `closed_at ? (lost_reason ? Neúspěch :
Vyhráno) : Otevřeno`. Empty state preserved. Mobile: horizontal scroll (or a stacked card
fallback if the table is unusable at narrow widths).

### Workstream 3 — Single-email send + history (send-only mail client)

**Backend model** `SentEmail` (table `sent_emails`):
- `id` UUID PK; `organization_id` FK orgs (CASCADE); `sender_user_id` FK users (SET NULL)
- `deal_id` FK deals (SET NULL, nullable); `company_id` FK companies (SET NULL, nullable)
- `to_emails`, `cc_emails`, `bcc_emails` — JSONB arrays of strings (snapshots)
- `subject` (String 300); `body` (Text, plaintext)
- `attachment_filenames` (JSONB array of strings; **bytes not persisted** — consistent with bulk)
- `status` enum `sent_email_status`: `sent | failed`; `error` (String 500, nullable)
- `message_id` (String 500) — the `Message-ID` we stamp, for threading
- `in_reply_to_message_id` (String 500, nullable); `thread_id` (UUID) — a follow-up copies the
  parent's `thread_id`; a fresh send starts a new one
- `sent_at` (DateTime tz, nullable); `created_at`
- Indexes: `(deal_id)`, `(company_id)`, `(thread_id)`, `(organization_id, created_at)`

**Backend service** `app/services/mailer.py`:
- `send_user_email(session, user, payload, attachments) -> SentEmail` — resolves the user's
  `SmtpConfig` via `smtp_config_for` (**requires `verified_at`; 409 `smtp_not_verified` if not**),
  builds MIME through the existing `_build_mime`/`Email` with `To/Cc/Bcc`, stamps a `Message-ID`,
  sets `In-Reply-To`/`References` when `reply_to_email_id` given, sends via `send_email_via`
  (blocking send wrapped in `asyncio.to_thread`), records the `SentEmail` row (`sent`, or `failed`
  + error), and — on `sent` — logs an `email_sent` Activity on the deal (if any) and the company
  (workstream 4). Attachment allowlist + 10 MB cap reused from `bulk_email.py:36-47/76-85`.

**Backend endpoints** new router `app/api/v1/emails.py` (`/api/v1/emails`, registered in
`app/api/v1/__init__.py`):
- `POST /` — `multipart/form-data`: JSON `payload` part (`to[]`, `cc[]`, `bcc[]`, `subject`,
  `body`, `deal_id?`, `company_id?`, `reply_to_email_id?`) + optional `attachments[]`. Validates
  the deal/company are in-org and visible. **409 if the caller has no verified SMTP.** Returns the
  `SentEmail`. `to[]` non-empty required.
- `GET /?deal_id=&company_id=` — paginated sent history, sender/owner-scoped like deals (admins
  see org). `GET /{id}` — one sent email + its thread (all `SentEmail` sharing `thread_id`).

**Reply semantics (documented limitation).** No inbox → we never receive. "Odpovědět" composes a
**follow-up** to a previously *sent* email: prefills recipients + `Re:` subject, links via
`In-Reply-To`/`References`, shares `thread_id`. A "thread" is the chain of mails **we** sent;
inbound replies are not captured. UI copy states this honestly.

**Frontend** `frontend/src/app/emails/`:
- `EmailComposeModal.tsx` — To (prefilled: deal `primary_contact.email` ?? `company.email`),
  CC, BCC (chip inputs, free-form addresses allowed), subject, plaintext `<textarea>` body,
  **multiple** file attachments (≤10 MB each, allowlist). Reply mode prefills from a `SentEmail`.
- Trigger buttons: deal dialog header + each obchody row + optionally company page. **Disabled
  with a tooltip** ("Nejprve nastavte a ověřte SMTP v Nastavení → Integrace", linking there) when
  `!isSmtpVerified(smtp)`.
- `EmailHistorySection.tsx` — list of sent emails for a deal (in the dialog) and a company (on the
  company page): subject, recipients, date, status badge (sent/failed + error), "Odpovědět".
- Hooks `useEmails.ts`: `useSendEmail` (multipart), `useDealEmails`, `useCompanyEmails`, `useEmail`.
  Reuse `isSmtpVerified` from `useSmtpSettings.ts`. Types via `pnpm types:generate`.

### Workstream 4 — Comprehensive activity timeline

**Schema.** Add nullable, indexed `company_id` (UUID, FK companies SET NULL) to `activities`.
Every activity records its parent company, so the company tab queries `company_id = X` and gets
company-level + its deals' + their events' + email activity in one query. Migration **backfills**
`company_id` on existing rows: `entity_type=company` → `entity_id`; `entity_type=deal` → the
deal's `company_id` via join. Keep the existing `entity_type/entity_id` for per-entity views.

**New `ActivityType` values** (native PG enum, `ALTER TYPE activity_type ADD VALUE`, additive,
outside txn): `deal_created`, `deal_updated`, `company_updated`, `event_created`. Keep
`stage_change`, `deal_won`, `deal_lost`, `email_sent`.

**Centralize.** One helper `record_activity(session, *, org_id, user_id, entity_type, entity_id,
company_id, activity_type, payload)` in `app/services/activity_log.py`. Update existing writes
(`deals.py` stage/won/lost, `freeing.py`, `bulk_email.py`) to set `company_id`. **New write-sites:**
- `create_deal` (`deals.py:141`) → `deal_created`, entity deal, `company_id=deal.company_id`,
  payload `{name, value, stage_name}`.
- `update_deal` (`deals.py:189`) → `deal_updated`, payload `{changed: [field names]}` (skip if no
  meaningful change).
- `update_company` (`companies.py:481`) → `company_updated`, entity company, payload `{changed}`.
- `create_event` (`events.py:256`) → `event_created`, entity deal, `company_id` from the deal,
  payload `{title, starts_at}`.
- single email send (workstream 3) → `email_sent`, entity deal (if any) + `company_id`,
  payload `{subject}`.

**Frontend.** Complete `ACTIVITY_LABEL` in `CompanyDetailPage.tsx:282` for all types and render
payloads readably: "Obchod vytvořen: *Název*", "Obchod upraven: *pole…*", "Fáze: → *Nabídka*",
"Obchod vyhrán / neúspěch", "Firma upravena", "Událost přidána: *název*", "E-mail odeslán:
*předmět*", plus `ownership_reassigned`/`subscription_change`. Timeline stays `created_at DESC`.

---

## Acceptance criteria (verifiable)

### AC-1 Deal detail dialog
1. Given the pipeline board, when I click a deal card (a click, not a drag), then a modal opens
   showing that deal's name, value, stage, owner, primary contact, expected close, probability,
   and **Vytvořeno** matching `created_at`.
2. Given the dialog is open, when I press `Esc` or click the backdrop, then it closes and focus
   returns to the element that opened it (assert via the `useModalDialog` test pattern).
3. Given the dialog, when I edit the name and the primary contact and save, then a PUT `/deals/:id`
   is sent, a success toast shows, and the originating card/row reflects the new name without a
   full page reload.
4. Given the dialog, when I click "Naplánovat událost", then the existing `EventFormModal` opens
   with the deal preset and the Google checkbox disabled iff Google isn't connected (unchanged
   behavior, now inside the dialog).
5. Given I open `/app/deals/<valid-id>` directly (bookmark), then the app lands on the deals list
   with the dialog open for that deal (no dead route, no full-page deal view).
6. Given a card's win/lose/paid controls, when I click one, then the deal action fires and the
   dialog does **not** open (event propagation stopped).

### AC-2 Obchody table
1. Given a company with N deals, when I open Firmy → *company* → Obchody, then a table renders N
   rows with columns Název, Fáze, Hodnota, Vlastník, Hlavní kontakt, Vytvořeno, Stav — showing
   **names** (not UUIDs) for stage/owner/contact.
2. Given a row, its Vytvořeno cell equals the deal's `created_at` (locale-formatted) and Stav is
   Otevřeno / Vyhráno / Neúspěch per `closed_at`/`lost_reason`.
3. Given a row, when I click it (outside the actions cell), then `DealDetailDialog` opens for that
   deal.
4. Given `GET /deals?company_id=X`, the response items include `stage_name`, `owner_name`,
   `primary_contact_name`, `company_name` (backend test), and the table issues no per-row extra
   fetches to resolve those names.
5. Given a company with 0 deals, the empty state renders (no empty table header only).

### AC-3 Single-email send + history
1. Given SMTP is **not** verified, the "Poslat e-mail" buttons in the deal dialog and every
   obchody row are **disabled** and show a tooltip naming the fix and linking to Nastavení →
   Integrace.
2. Given verified SMTP, when I open the composer from a deal, then To is prefilled with the deal's
   primary-contact email (else the company email), and CC/BCC are addable.
3. Given a valid compose with two attachments, when I send, then `POST /api/v1/emails` is called
   multipart, a `SentEmail` row is created with `status=sent` and both filenames in
   `attachment_filenames`, and the email appears in that deal's history list.
4. Given the SMTP server rejects the message, then the `SentEmail` is recorded `status=failed` with
   the error string, an error toast shows, and no exception escapes (backend test with transport
   mocked to raise).
5. Given a caller with no verified SMTP hits `POST /api/v1/emails` directly, then it returns **409**
   and writes no `SentEmail` (backend test).
6. Given a sent email in history, when I click "Odpovědět", then the composer opens with To/CC
   prefilled, subject `Re: <original>`, and on send the new `SentEmail` shares the parent's
   `thread_id` and carries `In-Reply-To` = the parent's `message_id` (backend test).
7. An email with an attachment over 10 MB or a disallowed type is rejected (422), reusing the bulk
   allowlist (backend test).

### AC-4 Comprehensive activity feed
1. Given I create a deal in the pipeline for company X, then Firmy → X → Aktivita shows a **"Obchod
   vytvořen: <name>"** row (the original bug is fixed).
2. Given that deal, when I move its stage, mark it won/lost, add an event, or send an email, then a
   correctly-labelled row for each appears on **company X's** Aktivita timeline (deal & event
   activity fans up to the company via `company_id`).
3. Given I edit company X's fields and save, then a "Firma upravena" row appears on its timeline.
4. Backend: `create_deal`, `update_company`, `create_event`, and the email send each write exactly
   one activity with the correct `activity_type` and a non-null `company_id` (backend tests).
5. The migration backfills `company_id` for pre-existing `deal`-entity activities (data test:
   an old stage_change row gets its deal's company_id).
6. No activity type renders as a raw enum string in the timeline (frontend test asserts every
   `ActivityType` has a label).

---

## Testing

- **Backend (pytest):** `DealListItemOut` denormalization + scoping; `SentEmail` send success/
  failure/threading + 409-on-unverified-SMTP + attachment allowlist/cap (transport mocked);
  activity writes on deal-create / deal-update / company-update / event-create / email-send with
  correct `company_id`; migration backfill; email history list/detail scoping.
- **Frontend (vitest):** dialog open/close + focus return (extend `useModalDialog.test.tsx`
  pattern); obchody table rendering + row-click; compose gating when SMTP unverified; reply
  prefill; `ACTIVITY_LABEL` completeness (every enum value mapped).
- **Playwright (per CLAUDE.md):** screenshot + console-check the deal dialog (from pipeline and
  obchody), the obchody table, the compose modal (gated + enabled states), and a company Aktivita
  timeline showing a freshly created deal. Do not claim UI done without a screenshot.

## Out of scope (v1)

- IMAP inbox / receiving mail / two-way threads (send-only by decision).
- Rich-text/HTML email bodies; saved templates; drafts; scheduled sends.
- Persisting attachment bytes in history (filenames only, as bulk already does).
- Two-way Google Calendar sync (unchanged; calendar-from-deal already shipped).
- Adding `company_id` directly to `calendar_events` (events stay deal-linked; company is reached
  via the deal).

## Resume checklist (next session)

1. Owner reviews this spec; apply any change requests, re-run the spec self-review.
2. Invoke **writing-plans** to produce a phased implementation plan
   (Phase 1: dialog + obchody table · Phase 2: single-email + history · Phase 3: activity feed).
3. Implement per plan; verify each UI surface with Playwright screenshots (CLAUDE.md rule).
