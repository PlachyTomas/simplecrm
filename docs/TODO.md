NOT A PROMPT its for me, the human, only
Setup real payment method.
Setup real company email for invoices emailing.
Implement feedback window into the app
LEarn how to use super admin
Implement invoices management
What happens if I register new user but quit the app before finishing org setup?

===Feedback===

- Admin může zadat seznam blokovaných ičo plus kategorie důvodu blokování pro všechny obchodníky (info se opět doplní z ARESU).
- Seznam firem obchodník může seřadit podle toho kterým vyprší zamčení, podle data posledního obchodu či poslední aktivity, filtrovat jen své/své a nezabrané/jen nezabrané
- Admin má možnost omezit max počet firem per obchodník individuálně v seznamu obchodníků
- Upravit texty na landing page - "Od registrace k prvnímu obchodu za 5 minut" na 1 řádek, "Nic víc, nic míň." celé na 2. řádek nadpisu
  Upravit text - registrace možná přes google i email
  DDealy ve sloupci vyhráno mají checkbox Zaplaceno/nezaplaceno => po zaplacení změní outline na jemná magenta a posunou se na konec sloupce v pipeline
  Hodnota dealu - pokud nevyplněno tak nezobrazovat (ne mít tam všude nuly)
  Pokud přidávám deal do pipeline musím mít možnost přes ičo v tom samém kroku vytvořit novou firmu.

---

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

---

Claude Zone here:

- After real Stripe is wired up: add a scheduled `process_period_rollovers()`
  job that walks subscriptions whose `current_period_ends_at` has passed and
  applies `pending_plan_id`, `pending_seat_count`, and
  `pending_user_deactivations` automatically. Today the super-admin Aktivovat
  path is the only apply route — fine for the no-Stripe phase.

---

## ComGate go-live audit follow-ups (from docs/prompts/COMGATE_GO_LIVE_AUDIT.md)

Fixed in-session — see commits ahead of origin/main:

- Q4: duplicate "Začít zdarma" landing CTA replaced with the canonical
  "Vyzkoušet 30 dní zdarma".
- Q5: live cost preview as admin edits seat count; annual-savings now
  shows both % and absolute Kč in Settings → Organizace.
- Q1 copy fix: bank-transfer pending state on /app/billing/return no
  longer claims "pár vteřin"; tells the user it may take hours and the
  invoice will arrive on settle.
- Q2 (partial): invoice service now snapshots the org's real ICO / DIČ
  / structured address into the invoice instead of just the name. Still
  needs a UI so the founder can edit those fields — see open-question
  below.
- Q12: startup log now emits ERROR-level warnings when
  `COMGATE_TEST_MODE=true` or `SMTP_HOST` is empty, so a misconfigured
  prod deploy is loud in monitoring.

Open audit findings (need separate work):

- **Q2 (UI gap):** the `Organization` model carries `ico` / `dic` /
  `address_street` / `address_city` / `address_zip` / `legal_form` /
  `billing_email`, but there is NO settings form to fill them in. The
  invoice service now reads them when populated (fallback: org name
  only), but until we add the UI, every newly issued invoice will be
  missing IČO/address. Recommended: extend
  `frontend/src/app/settings/SettingsPage.tsx::OrganizationSection`
  with an "Údaje pro fakturaci" sub-form that takes IČO + ARES autofill
  (reuse `useLookupRegistry`) + manual edit for DIČ / billing-email.
  Must NOT block the trial — admin only sees a soft warning ("Faktura
  bude bez IČO; doplňte před první platbou") when fields are empty.
- **Q3 (UI verification):** trial-expiry pay-gate logic in
  `is_app_access_allowed` is correct — fresh trials lock immediately
  at period end, past-due paying orgs get the 7-day grace. Salespeople
  hit the same gate via `require_active_trial_or_subscription` on
  every PROTECTED_DEPS router, so the lockout is org-wide. **Not
  separately verified end-to-end on production** — recommend running
  through the dev `_freeze_trial` super-admin helper before launch
  with a salesperson account to confirm the gate fires for them too.
- **Q7 (ISDOC delivery):** the invoice mailer attaches the PDF only.
  ISDOC XML is generated + stored under `invoice.isdoc_object_key` but
  never attached to the customer email. Czech B2B convention is to
  bundle both. Low priority — add a second `EmailAttachment` only if a
  customer asks for it.
- **Q10 (refunds):** there's no customer-facing or admin refund flow.
  `Charge.status` enum supports `"refunded"` but no endpoint calls
  `ComGateClient` (which DOES have `refund` mapped on `_Endpoints`).
  Refunds today happen via the ComGate portal manually + a
  super-admin-issued credit note. Fine for v1 since refunds are rare;
  build the flow when the first dispute lands.
- **Q11 (locale):** CZK + Czech UI/PDF only. Frontend has no language
  switcher, no English email templates. Fine for the CZ-only launch.
- **Q13 (audit log completeness):** every payment-state transition is
  audited via `BillingAuditLog` (subscription*chose_plan, activate,
  cancel_self_serve, seat*\*\_) and via `WebhookEvent` for the raw
  ComGate payloads. **Not separately stress-tested** — recommend
  running through the production smoke test in `docs/comgate-setup.md`
  §6 and confirming every state change writes a row.

Production env checklist (matches `docs/comgate-setup.md` §7):

- [ ] `COMGATE_TEST_MODE=false` (startup log now warns when true)
- [ ] `COMGATE_MERCHANT_ID` + `COMGATE_SECRET` = production values
- [ ] `COMGATE_RETURN_URL=https://app.simplecrm.cz/app/billing/return`
- [ ] Production webhook URL registered in ComGate portal
- [ ] `SMTP_HOST` + `SMTP_USERNAME` + `SMTP_PASSWORD` set per the Zoho
      block above
- [ ] DNS for `simplecrm.cz` includes MX/SPF/DKIM/DMARC for Zoho EU
- [ ] BillingSettings row has issuer details populated (IČO, IBAN,
      address) — without these the auto-issuance skips with a warning
- [ ] Run an end-to-end smoke test with sandbox creds first, then a
      £1 real-money test in production
