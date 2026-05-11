NOT A PROMPT its for me, the human, only
Setup real payment method.
Setup real company email for invoices emailing.
Implement feedback window into the app
LEarn how to use super admin
Implement invoices management

----

## Finish the Zoho Mail SMTP setup (code is ready, ops not done)

Backend + frontend code is wired up (`commit 75ff8b6`). To actually
deliver mail, run through the following — none of it is reversible
without breaking outbound email, so do it on the deploy host in one
sitting.

1. **Zoho Mail Admin — Send-As identities** (admin.zoho.eu → Mail → Mail
   Accounts → pick the primary mailbox → Send Mail As).
   - Add `faktury@simplecrm.cz`. Verify via the confirmation link Zoho
     sends to that address (route the inbox via DNS first if it doesn't
     exist yet — see §3).
   - Add `info@simplecrm.cz`. Same verification step.

2. **App password** (account.zoho.com → Security → App Passwords).
   - Generate a new app password labelled "SimpleCRM SMTP".
   - Copy it — Zoho only shows it once. This is the
     `SMTP_PASSWORD` value below; do NOT use the regular account
     password (Zoho 2FA blocks regular-password SMTP auth).

3. **DNS on simplecrm.cz** (registrar: wedos.cz or equivalent). All four
   are required for Gmail/Outlook to stop binning our mail.
   - **MX** → `mx.zoho.eu` (priority 10), `mx2.zoho.eu` (20),
     `mx3.zoho.eu` (50).
   - **SPF** TXT at the apex: `v=spf1 include:zohomail.eu ~all`.
     Replace any prior SPF — only one is allowed.
   - **DKIM** TXT — Zoho generates the selector + key under Mail Admin
     → Domains → simplecrm.cz → Email Configuration → DKIM. Paste the
     full TXT record verbatim, then click Verify in Zoho.
   - **DMARC** TXT at `_dmarc.simplecrm.cz`:
     `v=DMARC1; p=quarantine; rua=mailto:postmaster@simplecrm.cz`.
     Once SPF + DKIM are passing for a week, tighten `p=quarantine` →
     `p=reject`.

4. **Coolify env vars** (Coolify UI → SimpleCRM service → Environment).
   Default `SMTP_HOST=smtp.zoho.eu`, `SMTP_PORT=465`, `SMTP_USE_SSL=true`
   are baked into the config — only the two below need setting:
   ```
   SMTP_USERNAME=<primary-mailbox>@simplecrm.cz
   SMTP_PASSWORD=<app password from step 2>
   ```
   Save → redeploy.

5. **Smoke test** (post-deploy):
   - Hit `/app/feedback` in the live app, submit a test report → check
     `info@simplecrm.cz` for delivery within ~30 s.
   - Trigger an invoice send from `/admin` → confirm the customer
     mailbox receives it from `faktury@simplecrm.cz` with the PDF
     attached.
   - Run `mail-tester.com` against both addresses; aim for 10/10. If a
     score is below 8, SPF/DKIM/DMARC alignment is the usual culprit.

----

Claude Zone here:
- After real Stripe is wired up: add a scheduled `process_period_rollovers()`
  job that walks subscriptions whose `current_period_ends_at` has passed and
  applies `pending_plan_id`, `pending_seat_count`, and
  `pending_user_deactivations` automatically. Today the super-admin Aktivovat
  path is the only apply route — fine for the no-Stripe phase.
