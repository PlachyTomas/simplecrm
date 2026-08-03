# Security-delta review — findings (2026-08-03)

Scope: all security-relevant backend surface added/changed since
98f83e0 (post-July-review fixes), ~8 700 lines. Format:
`[P0–P3] file:line — summary — failure scenario — suggested fix`.
Tracker: `docs/superpowers/plans/2026-08-03-security-delta-review-plan.md`.

Baseline: main @ 74feea2, 1048 backend tests green.

## R0 — recon

Surface delta enumerated in the tracker. Highest-risk items by design:
two PUBLIC endpoints (inbound Smart-BCC, tracking pixel/click), one
credential store (per-user SMTP), one OAuth token store (Google
Calendar), and erasure/export drift risk across 8 new tables.

## R1 — public surfaces (inbound Smart-BCC, tracking)

Read line-by-line: api/v1/inbound_email.py, services/inbound_email.py
(700 L), api/v1/tracking.py, services/email_tracking.py. Both are
better hardened than typical: constant-time secret compare on bytes,
streaming size cap (not just Content-Length), defensive MIME parsing
with per-accessor guards + RecursionError fallback, every field
length-capped, magic address stripped from stored to/cc (the token is
a bearer write-credential), unknown-token indistinguishable from
no-token (no enumeration). Tracking derives its signing key from the
JWT secret rather than reusing it, binds the signature to the token so
one mail's signature can't be replayed onto another, refuses to
redirect for a token that doesn't match a real send (closing the
open-redirect), and always returns the GIF.

- [P1] services/inbound_email.py:463-479 (`_find_user_by_token`) —
  **deactivation and GDPR erasure don't revoke the inbound write
  capability.** The token lookup has no `is_active` filter, while both
  other credential paths do (`core/deps.py:56` for sessions,
  `api/v1/auth.py:331` for login). Two concrete failures: (a) an
  offboarded employee — deactivated by the admin, or auto-deactivated
  by a seat downsize (`services/billing.py:280`) — keeps a working
  magic address and can keep injecting forged correspondence
  (arbitrary subject/body/from, filed onto the matched company/deal
  timeline and attributed to them) into their ex-employer's CRM
  indefinitely; (b) worse, `services/org_erasure.py:171` anonymizes
  users and sets `is_active=False` but never clears `inbound_token`,
  so **after a GDPR Art. 17 erasure the magic addresses still resolve**
  and any subsequent BCC re-seeds fresh personal data (names, emails,
  message bodies) into the erased org — the erasure doesn't hold.
  Fix: filter `User.is_active.is_(True)` in `_find_user_by_token`
  (unknown-token outcome, so nothing is disclosed), NULL
  `inbound_token` in `org_erasure` alongside the other credential
  wipes, and clear it wherever a user is deactivated.
- [P3] api/v1/inbound_email.py:178-200 — no rate limit on the public
  capture hook. The shared secret gates it, so the exposure is a
  compromised/misbehaving worker rather than the internet at large,
  and each request is bounded by `inbound_max_bytes`. Worth a limiter
  when convenient; not a real avenue today.
- [P3] api/v1/tracking.py:83-95 — open counts are inflatable by anyone
  who holds a tracking token (i.e. the recipient), since the pixel
  endpoint records every hit. Inherent to pixel tracking; noting so
  nobody treats open counts as trustworthy analytics.

## R2 — tenancy / authz on new + changed authed routers

Swept: emails, bulk_email, email_templates, user_smtp, events, search,
sales_goals, reports_widgets, deals/companies/contacts/pipelines
deltas, imports (incl. undo), reports. Org scoping is consistently
applied and the risky patterns are handled: every `session.get()` on a
cross-object id is followed by an org comparison (imports undo,
reports team filter, deal stage moves via `_assert_stage_in_org`),
`_scope_history` scopes mail by org **and** narrows salespeople to
their own sends, campaign detail is org-scoped, per-user SMTP settings
are keyed by `user_id`, and search filters every entity by org plus
`scope_by_owner`. No IDOR found on the new surface.

- [P2] core/scoping.py:115-131 (`can_write_row`) + companies.py:475,
  550 + deals.py:410, 482 — **ownership can be assigned to a user
  outside the caller's organization.** The helper short-circuits
  `return True` for admins without ever loading the target user, so
  nothing in the create/update path checks that `owner_user_id`
  belongs to the caller's org (`_assert_owner_cap` also fetches the
  user with a bare `session.get`). An org admin POSTing a company or
  deal with a foreign user's UUID gets a row in their own org owned by
  a stranger: `DealListItemOut.owner_name` (schemas/deal.py:160)
  resolves `deal.owner.name` through the relationship with no org
  filter, so the foreign user's real name renders in the attacker's
  deal list. Exploitation needs a UUID from another tenant (not
  exposed anywhere I found), which is why this is P2 and not higher —
  but the guard is simply missing, and cross-tenant rows also corrupt
  ownership reporting. Fix: in `can_write_row`, load the target user
  and reject when `organization_id` differs, before the role branches.
- [P3] companies.py:84-92 (`_assert_owner_cap`) — the cap query counts
  `Company.owner_user_id == new_owner_id` with **no org filter**, so
  rows in other organizations consume a user's `max_owned_companies`
  budget. Harmless once the P2 above is fixed (no cross-org ownership
  can exist), but the query should be org-scoped regardless.

## R4 — data lifecycle (GDPR erasure, export, import undo)

Import-run undo is correctly org-scoped and row-locked
(imports.py:521-527). The erasure path, however, has drifted badly
behind the schema — every table added since it was written survives it.

- [P0] services/org_erasure.py — **GDPR Art. 17 erasure leaves the
  most sensitive personal data in place.** The routine deletes
  Activity/Deal/Contact/Company/ImportRun/BlockedCompany/Invitation/
  Pipeline/Team/EmailCampaign/GoogleCalendarConnection/
  UserSmtpSettings/PaymentMethod and anonymizes users + the org row —
  but it **never deletes the `organizations` row** (deliberately, so
  invoices stay linkable), which means the `ondelete="CASCADE"` on
  `organization_id` that these newer tables rely on **never fires**:
  - `sent_emails` — survives entirely. `deal_id`/`company_id` are
    `SET NULL` (models/sent_email.py:71,75), so deleting deals and
    companies only detaches them. Every captured/sent message keeps
    its **full body, subject, from/to/cc addresses** — the richest
    personal data in the product, retained after the customer was told
    it was erased.
  - `email_templates` — survives (org FK only).
  - `sales_goals` — survives (org CASCADE dead; `user_id` CASCADE also
    dead because users are anonymized, not deleted).
  - `calendar_events` — **correctly removed**, but only transitively:
    `deal_id` is `ondelete="CASCADE"` and `deal_id` is NOT NULL, so
    deleting deals takes them. Verified, not assumed.
  Failure scenario: customer exercises Art. 17, UI reports success, and
  their entire mail corpus stays queryable in the database; a later
  subject-access request or audit finds it. Compounded by the R1 P1
  finding (inbound tokens still live), fresh personal data can even
  keep arriving into the "erased" org. Fix: explicitly delete
  `SentEmail`, `EmailTemplate`, `SalesGoal` (and `CalendarEvent`
  defensively, so it stops depending on deal-cascade order) in the
  erasure routine, NULL `inbound_token`, and add a regression test that
  asserts **zero rows remain for the org in every org-scoped table** —
  a loop over the model registry rather than a hand-written list, so
  the next new table can't drift again.
- [P3] no organization-wide data-portability export (Art. 20) exists —
  `services/list_export.py` only does per-list CSV. Product/legal
  decision rather than a defect; noting it so the gap is explicit.

## R3 — secrets & tokens

Storage is sound: per-user SMTP passwords and Google refresh/access
tokens are Fernet-encrypted at rest, decrypted only at the point of use
(SMTP connect, token refresh), and never serialized — `UserSmtpSettingsOut`
exposes `has_password: bool` only (schemas/user_smtp.py:38). Erasure
revokes the Google grant upstream before deleting the row
(org_erasure.py:149). Inbound shared secret and tracking signatures were
covered in R1 (constant-time, domain-separated key).

- [P3] core/token_crypto.py:28-30 — the Fernet key is
  `SHA-256(jwt_secret)` used directly, while `services/email_tracking.py:87`
  derives its key as `HMAC(jwt_secret, "simplecrm/email-tracking/v1")`
  and documents why domain separation matters. Credential-at-rest
  encryption should follow the stronger of the two patterns; adopt the
  labelled HMAC derivation (with a migration path, since existing
  ciphertexts are keyed by the old derivation).
- [P3] core/token_crypto.py + services/mailer.py:131,
  services/bulk_email.py:288 — `TokenDecryptError` is handled on every
  Google path (events.py:160,179,199; google_calendar.py:187) but not on
  the SMTP send paths, so rotating `jwt_secret` turns "send email" into
  an unhandled 500 rather than a clear "re-enter your SMTP password".
  Wrap the two call sites and surface a re-authentication prompt.

