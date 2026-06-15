# Bulk email campaigns ("Hromadné nabídky") — design

Date: 2026-06-15
Status: approved (owner reviewed each decision via brainstorming Q&A)

## Goal

Let a salesperson send a one-off bulk email (e.g. a new offer) to their existing
clients, choosing the target companies by filtering on CRM data. Each send is
recorded so the user can later check what was sent and whether the mail server
accepted it. Mail is sent from the salesperson's **own** mailbox (real
`From: their address`), which requires them to configure their own SMTP first.

## Decisions made (owner Q&A)

- **Target set:** only **owned** companies within the sender's visibility scope —
  never the shared pool. Salesperson = their own book; manager/admin can target a
  chosen owner.
- **Recipients per company:** default to the company's `email`, else the company's
  main contact. The sender can expand a company and additionally select specific
  contacts (multi-select).
- **Filters:** industry, deal activity (stage / has-won / last-order recency), owner.
- **Delivery:** synchronous, throttled, capped at **250 recipients** per send.
- **Permissions:** everyone can send; server scopes candidates to
  `scope_by_owner` ∩ owned companies.
- **History:** persisted campaigns + per-recipient status (sent / failed / skipped),
  with a history view.
- **Sender identity:** **per-user SMTP is required.** Bulk email is disabled until the
  user configures and verifies their own SMTP. From = their real address, sent through
  their own server (authenticated → deliverable). We never spoof an address through the
  shared `info@simplecrm.cz` relay, which protects app-wide transactional deliverability.
- **Side effect:** optional new pipeline deal per emailed company (title = subject or
  custom), plus a lightweight company activity entry.
- **Landing page:** one feature card in `#funkce`. No demo.

## Approaches considered

1. **Per-user SMTP + synchronous send + persisted campaign history (chosen).**
   Each user stores their own SMTP credentials (Fernet-encrypted). A campaign opens
   one authenticated connection to that user's SMTP, sends to each recipient
   sequentially over the connection, and records per-recipient status. The client
   resolves recipients (and lets the user hand-edit contacts), then POSTs an explicit
   recipient list, so what was reviewed is exactly what is sent.
2. Send everything through the shared `info@simplecrm.cz` relay with `From` = the
   user's address. **Rejected:** spoofing through our relay fails SPF/DKIM/DMARC for
   the user's domain → spam/reject, and risks blacklisting the shared account, which
   would degrade signup/reset/invoice mail for every customer.
3. Background job queue + delivery-webhook provider (SendGrid/Postmark) for true
   open/bounce tracking. **Deferred:** larger build; the persisted-campaign UI is
   designed so a webhook provider can be layered in later without UI rework.

## Architecture

The feature splits into two phases. **Phase B (bulk email) depends on Phase A
(per-user SMTP)** because sending is gated on a verified SMTP config.

### Phase A — Per-user SMTP settings

**New model** `UserSmtpSettings` (table `user_smtp_settings`) — one per user:
- `id` UUID PK; `user_id` FK users (unique, CASCADE); `organization_id` FK orgs (CASCADE)
- `host` (String 255), `port` (int), `use_ssl` (bool), `use_starttls` (bool)
- `username` (String 320)
- `password_encrypted` (Text) — Fernet-encrypted at rest via the existing
  `app.core.token_crypto` (`encrypt_token` / `decrypt_token`); same mechanism used for
  Google OAuth tokens, no new secret to provision.
- `from_email` (String 320) — the address stamped into `From` (defaults to `username`)
- `from_name` (String 200, nullable) — display name (defaults to the user's name)
- `verified_at` (DateTime tz, nullable) — set when a test connection/login succeeds;
  bulk email is gated on this being non-null.
- `created_at`, `updated_at`

**Email service refactor** (`app/services/email.py`):
- Introduce an `SmtpConfig` dataclass (host/port/ssl/starttls/username/password/sender).
- Extract `_send_via_smtp` to accept an explicit `SmtpConfig` instead of reading the
  global settings. The existing transactional path keeps working by passing a config
  built from global settings (no behavior change for signup/invoice/etc.).
- Add `send_email_via(message, config)` for per-user sends.
- Add `verify_smtp(config) -> None` (connect + login, raise on failure) for the
  "test connection" action.

**New schemas** (`app/schemas/user_smtp.py`): `UserSmtpSettingsIn` (write; password
optional on update so it isn't required to re-enter to change other fields),
`UserSmtpSettingsOut` (read; **never** returns the password — exposes
`has_password: bool` and `verified: bool` instead).

**New endpoints** `app/api/v1/user_smtp.py` (`/api/v1/me/smtp`):
- `GET /` → current user's settings (or `{configured: false}`).
- `PUT /` → upsert. Saving new/changed credentials clears `verified_at` until re-tested.
- `POST /test` → runs `verify_smtp`; on success sets `verified_at` and (optionally)
  sends a test message to the user's own address; returns `{ok, error?}`.
- `DELETE /` → remove the row.

### Phase B — Bulk email

**New models**
- `EmailCampaign` (table `email_campaigns`):
  - `id` UUID PK; `organization_id` FK orgs (CASCADE); `created_by_user_id` FK users
    (SET NULL)
  - `subject` (String 300), `body` (Text), `from_email` (String 320, snapshot),
    `attachment_filename` (String 255, nullable)
  - `total`, `sent_count`, `failed_count`, `skipped_count` (ints)
  - `created_at`
  - Index: `(organization_id, created_at)`
- `EmailCampaignRecipient` (table `email_campaign_recipients`):
  - `id` UUID PK; `campaign_id` FK email_campaigns (CASCADE)
  - `company_id` FK companies (SET NULL); `contact_id` FK contacts (SET NULL, nullable)
  - `email` (String 320, the resolved address actually used — snapshot)
  - `company_name` (String 200, snapshot so history survives company deletion)
  - `status` enum `email_recipient_status`: `sent | failed | skipped`
  - `error` (String 500, nullable), `sent_at` (DateTime tz, nullable)
  - Index: `(campaign_id)`

> Attachment bytes are **not** persisted (only the filename) — campaigns store the
> message text and outcomes, not the binary payload.

**New service** `app/services/bulk_email.py`:
- `resolve_recipients(session, user, filters) -> list[RecipientCandidate]` — applies
  scope + owned-only + filters, resolves each company's default recipient
  (`company.email or main_contact.email`), attaches the company's contacts, and marks
  `emailable` / `skip_reason` (no email, or on the org `BlockedCompany` list).
- `render_message(template, *, company, contact, sender) -> (subject, body)` — merge
  fields `{firma}`, `{kontakt}`, `{vlastnik}`.
- `send_campaign(session, user, payload, attachment?) -> EmailCampaign` — re-validates
  every requested recipient server-side (scope, owned, not blocked, has email),
  enforces the 250 cap, builds the user's `SmtpConfig` (requires `verified_at`), opens
  **one** authenticated SMTP connection, loops recipients recording
  `sent`/`failed`(+error)/`skipped`, persists campaign + recipient rows, and runs the
  per-company side effects. The blocking SMTP loop runs in `asyncio.to_thread`.

**New endpoints** — a new router `app/api/v1/bulk_email.py`
(prefix `/api/v1/companies/bulk-email`, registered in `app/api/v1/__init__.py`):
- `POST /recipients` — body = filter object → `[{company, default_recipient,
  contacts[], emailable, skip_reason}]`. Owned-only + scoped.
- `POST /send` — `multipart/form-data`: a JSON `payload` part (recipients[], subject,
  body, create_deals, deal_title) + optional `attachment` file part. Returns the
  `EmailCampaign` summary with counts. **409/422 if the caller has no verified SMTP.**
- `GET /campaigns` — paginated list of the caller's (or, for admins, the org's) past
  campaigns.
- `GET /campaigns/{id}` — campaign detail + per-recipient rows.

**Recipient cap & throttling:** hard cap 250 recipients/send (server-enforced, 422 over
cap). One reused SMTP connection sent sequentially keeps us within typical provider
rate limits; a small `time.sleep` between sends is configurable if a provider needs it.

### Side effects per successfully-sent company

- If `create_deals`: create one `Deal` in the sender's default pipeline at the first
  open stage, owned by the sender, `name` = `deal_title or subject`, value 0, org
  currency. (Resolve the default pipeline + first `StageType.open` stage; reuse
  existing pipeline helpers.)
- Record an `Activity` (`entity_type=company`, new `ActivityType.email_sent`) so the
  send shows on the company timeline. `ActivityType` is a **native PG enum**
  (`Enum(ActivityType, name="activity_type")`), so the migration must
  `ALTER TYPE activity_type ADD VALUE 'email_sent'` (additive; run outside a txn block
  per Alembic enum rules).

### Frontend

- **Settings → new "Odesílání e-mailů (SMTP)" section:** form for host/port/SSL or
  STARTTLS/username/password/from-email/from-name, a **"Otestovat připojení"** button
  (calls `POST /me/smtp/test`, shows success/verified or the error), and a verified
  badge. Hooks `useSmtpSettings`, `useSaveSmtpSettings`, `useTestSmtpSettings`.
- **Companies page — "Hromadný e-mail" button.** If the user has no verified SMTP, the
  button opens a small explainer that links to the SMTP settings (feature gated).
- **Wizard modal `BulkEmailWizard` (4 steps):**
  1. *Filtr* — industry (select), deal activity (stage / has-won / last-order recency),
     owner (managers/admins; salespeople fixed to self). Live match count via
     `POST /recipients`.
  2. *Příjemci* — table of matched companies with resolved default recipient; expand a
     row to multi-select contacts; greyed rows with reason for no-email / blocked.
  3. *Text* — subject, body (merge-field hint `{firma}`/`{kontakt}`/`{vlastnik}`),
     optional single file attachment.
  4. *Odeslání* — "Vytvořit obchod v pipeline pro každou firmu" checkbox + title field
     (defaults to subject); **Odeslat** → progress → result summary (sent/failed/skipped).
- **Historie hromadných e-mailů** — a dedicated route `/app/email-campaigns`, linked
  from the Companies page header and from the wizard's send-result screen. Lists past
  campaigns (subject, date, counts) → drill into per-recipient status. Hooks
  `useEmailCampaigns`, `useEmailCampaign`.
- Types come from `pnpm types:generate`; styling follows existing modal/table patterns.

### Error handling

- **No verified SMTP:** `/send` returns 409/422; the UI gates the button up front so
  this is a backstop.
- **Per-recipient SMTP failure:** caught, recorded as `failed` with the error string;
  the loop continues. The connection is re-opened once if it drops mid-batch; if it
  can't be re-established, remaining recipients are recorded `failed` ("connection lost")
  and the campaign still returns its partial summary.
- **Over the 250 cap / empty recipient list:** 422 before any send.
- **Blocked / no-email recipients sneaking through the client:** re-validated server-side
  and recorded `skipped` (never sent).
- **"Sent" semantics:** means the user's SMTP server accepted the message — not a
  guaranteed inbox delivery. Surfaced honestly in the history UI copy.

### Testing

- Backend (pytest): SMTP settings CRUD + password encrypt/decrypt round-trip + that
  `Out` never leaks the password; `verify_smtp` success/failure (SMTP mocked);
  recipient resolution (scope, owned-only, blocked skip, no-email skip, contact
  expansion); merge-field rendering; `send_campaign` status recording, 250 cap, gating
  on `verified_at`, and per-company deal + activity creation (SMTP transport mocked);
  campaign list/detail scoping.
- Frontend (vitest): SMTP settings form + test-connection states; wizard step gating
  and contact selection; gated entry when SMTP missing; landing-copy test.
- Playwright: screenshot the SMTP settings section, the wizard steps, and the history
  view; check the console for errors (per project CLAUDE.md).

## Out of scope (v1)

- True open/bounce/delivery tracking (needs a webhook provider — designed to bolt on
  later).
- Background/queued sending and retries (synchronous per owner decision).
- Org-level / shared SMTP, OAuth (Gmail API) sending.
- Scheduled/recurring campaigns, drafts, A/B, HTML rich-text editor (plain-text body
  with merge fields for v1), per-recipient unsubscribe links.
- Persisting attachment bytes in history.
