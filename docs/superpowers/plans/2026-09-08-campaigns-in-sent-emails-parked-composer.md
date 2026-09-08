# Campaigns land in sent_emails; one-to-one composer parked

*2026-09-08. Owner decision: keep bulk email, keep every "sent mail" overview, hide the one-to-one composer until a real mailbox sync exists. Owner verifies manually (checklist at the bottom).*

## Why

The company "E-maily" tab, the deal history and the Mail page all read `sent_emails`. Campaigns wrote only `email_campaign_recipients` + an `email_sent` activity, so once the composer is hidden those overviews would go permanently empty for new orgs. Fix the data model, then hide the composer.

## Design

- **`sent_emails.campaign_id`** (nullable FK → `email_campaigns`, `ON DELETE SET NULL`, indexed). One row per campaign recipient whose mail was *attempted* (status `sent` or `failed`); `skipped` recipients never left the building and get no row. Subject/body are the **rendered** per-recipient text (merge fields + signature applied), like the composer. Each row gets its own `Message-ID` (now stamped on the outgoing MIME too) and a fresh `thread_id`, so a later reply can join it.
- **Tracking token shared**: the recipient row and the `sent_emails` row carry the same `tracking_token`. `/t/o` and `/t/c` therefore update **both** tables per hit (the old first-match-wins loop would have starved the campaign page).
- **Deal link**: when the wizard creates deals, the row points at the new deal, so the deal's e-mail history shows the campaign mail. The per-company `email_sent` activity gains `email_id` (first row for that company) so "Zobrazit e-mail" works from the timeline.
- **No backfill** of historic campaigns: their stored subject/body are unrendered templates (`{firma}` literal). Accepted.
- **Composer flag**: `frontend/src/lib/features.ts` → `SINGLE_EMAIL_COMPOSE_ENABLED`, true only when `VITE_SINGLE_EMAIL_COMPOSE=1` is set at build time (so it flips per environment without a code change). Gates every compose entry: deal detail header button + reply, company E-maily tab button + reply, company Obchody tab mail icon column, pipeline ⚡ "E-mail" item, Mail page reply. History views stay; rows from a campaign show a "Hromadný e-mail" pill linking to the campaigns page.
- **Admin console**: `AdminOrgRow.access_status` (same `_access_status` rule as the subscription payload). A `trialing` org whose access is `gated` renders an orange "Zkušební verze vypršela" pill in the list and the drawer. Today nothing flips `trialing` on expiry, so the blue pill lived forever.

## Implementation checklist

Backend
- [x] Migration `20260908_1000_sent_emails_campaign_id_c6d7e8f9a0b1.py` (column + FK + index)
- [x] `SentEmail.campaign_id` + relationship; `SentEmailOut.campaign_id`
- [x] `mailer.new_message_id` (was `_message_id`), reused by bulk
- [x] `bulk_email._run_send_loop` returns rendered subject/body + message_id per unit; MIME carries Message-ID
- [x] `send_campaign` writes `SentEmail` rows (sent/failed), links created deals, activity payload `email_id`
- [x] `tracking._record_event` updates both tables
- [x] `AdminOrgRow.access_status`
- [x] Tests: bulk send writes rows + list endpoint shows them + failed row; shared token bumps both; admin row `access_status` gated for an expired trial
- [x] `alembic upgrade head`, ruff, mypy, pytest green (env prefix!)

Frontend
- [x] Regenerate API types from the running backend
- [x] `lib/features.ts` flag; gate DealDetail, CompanyDetailPage (EmailsTab + DealsTab column), DealQuickActionsModal, MailPage
- [x] `EmailHistorySection.onReply` optional; `CampaignBadge` in history rows, Mail page rows, detail modal
- [x] Copy cs+en: badge, Mail page subtitle, tutorial (pipeline ⚡, contacts main contact), admin `trialExpired`
- [x] Admin `OrgList` + `OrgDetailDrawer` expired pill
- [x] Tests: mailPage badge, history hides reply without handler, admin expired pill
- [x] eslint, tsc, prettier, vitest, vite build, i18n:check, api-types check
- [x] Console-error pass on the touched routes (owner does the visual pass) — /app/emails, /app/pipeline (⚡), company E-maily tab, deal detail: 0 errors

## Owner verification todo

Log in as the demo admin (see `.claude/skills/running-simplecrm/SKILL.md`). Dev stack in host mode.

1. **Composer is gone everywhere**
   - `/app/deals/<id>` (and the deal dialog from the pipeline): header shows Upravit but no "Odeslat e-mail"; the "Historie e-mailů" block still lists old mails, rows have no "Odpovědět".
   - `/app/companies/<id>` → záložka **E-maily**: no "Odeslat e-mail" button, history rows have no reply. Záložka **Obchody**: the trailing mail-icon column is gone.
   - `/app/pipeline`: open ⚡ on a card → only Událost, Hovor, Poznámka.
   - `/app/emails`: click a subject → detail has only Zavřít (no Odpovědět).
2. **Bulk email still works end to end**
   - `/app/companies` → Hromadný e-mail → pick 2 companies (one with a contact e-mail), tick "vytvořit obchod", send. Expect the same success summary as before.
   - `/app/email-campaigns`: the campaign appears with per-recipient rows.
3. **Campaign mails show up in the overviews**
   - Company detail → E-maily: one row per recipient, rendered subject (merge fields resolved), "Odesláno" badge, new **"Hromadný e-mail"** pill; the pill links to `/app/email-campaigns`.
   - Company detail → Aktivita: "E-mail odeslán" row has "Zobrazit e-mail" and opens the mail.
   - The newly created deal → Historie e-mailů lists the same mail.
   - `/app/emails`: rows present, pill visible, filters Firma / Obchod / Jen moje still narrow correctly. Search finds the rendered subject.
   - If your SMTP is a real mailbox: open the received mail → the company row gets "Otevřeno" and the campaign page's recipient row gets it too (both tables update).
4. **Copy**
   - Mail page subtitle mentions hromadné kampaně. Pipeline tour ⚡ step no longer promises e-mail; contacts tour no longer promises e-mail prefill. Switch UI to English and re-check the same three.
5. **Admin console**
   - `/admin`: the 3-month-old test org shows orange **"Zkušební verze vypršela"** instead of blue "Zkušební verze". Open its drawer: same pill. A fresh trial org stays blue.
6. **Console**: no red errors on any route above.

## Review (2026-09-08, T2-lite: orchestrator pass + one Opus backend reviewer; refuter panel skipped — needs owner approval for a fan-out)

Fixed in this change: MIME built per send (was all-up-front, 250 × 10 MB); Message-ID from the bare address even with an unquoted comma in the display name; `not_allowed` skip rows no longer persist the client-supplied company id (pre-existing 500-after-send); SMTP error clamped to 500 chars once in `_result` (pre-existing overflow-after-send); campaign mail logs on the created deal so its Průběh shows it.

Reported, not fixed (owner decision):
- `_access_status` (shared with the subscription payload) reports `pending_activation` and early-dunning `active` as "active". The new admin column inherits that; the expired-trial pill is unaffected.
- A salesperson who did not send a campaign gets a 404 when opening "Zobrazit e-mail" on a manager's campaign activity (`_scope_history` scopes salespeople to their own sends). Same class as composer mail; decide whether history should be readable for owned companies/deals.
- `From:` display names are not quoted (`f"{name} <{addr}>"` in user_smtp.py and bulk_email.py). A name with a comma yields a broken From header and a bare-token envelope sender. Pre-existing; fix with `email.utils.formataddr`.
- `EmailCampaign.from_email` is String(320) but stores the display-name form (up to 523 chars). Pre-existing, unlikely.

## Follow-ups / accepted debt

- The four gated surfaces still call `useSmtpSettings()` (one GET /me/smtp per page load) although nothing renders from it while the flag is off. Harmless; remove the hook calls if the composer is deleted for good.
- Local full backend suite: `tests/services/test_invoicing_integrity.py` fails on cleanup in the dev DB (audit rows referencing the test user survive the wipe). Unrelated to this change (CI backend job is green on main); reproduce on a fresh DB before touching the wipe helper.

- Mail page "Nepřiřazené" filter, bulk assign bar and LinkEmailDialog only ever match inbound rows, which are parked. Dead UI; remove or revive together with inbound.
- Flipping the flag back on needs the two tutorial sentences restored.
- Historic campaigns are not backfilled into `sent_emails`.
