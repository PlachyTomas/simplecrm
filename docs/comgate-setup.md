# ComGate setup guide

> Owner-facing operations guide for the ComGate billing integration introduced
> in the `well-the-inteded-seat-staged-lark` plan (closes the seat-cap abuse
> identified in `qa-artifacts/2026-05-03-adversary-testing-report.md`).
>
> Read this **before** the code lands so the sandbox merchant is ready when
> the integration ships.

## TL;DR — what this guide does for you

- Walks you from "no ComGate account" → "sandbox merchant + credentials in
  your local `.env` + webhook reachable from the internet" in ~30 minutes.
- Lists the test cards you'll use for verifying the eight scenarios in the
  plan's verification section.
- Hands you a flip-the-switch checklist for going live.

> **Status of placeholders:** the exact field names inside ComGate's merchant
> portal and a few REST paths are marked **`[confirm in merchant portal]`** —
> ComGate gates the full v2 API reference behind the portal, so the
> authoritative copy lives there. Don't guess; copy from the portal pages
> labeled "API protokol" / "Recurring payments" / "Notifikace (callback)".

---

## 1. Create a sandbox merchant account

1. Go to **<https://payments.comgate.cz/>** → "Vytvořit účet" / "Create account".
2. Sign up using the company's billing email. Personal Gmail works for the
   sandbox; production needs a verified business identity (IČO + DIČ).
3. After confirming the verification email, log in to the **merchant portal**
   at <https://portal.comgate.cz/>.
4. In the left nav, switch the environment selector to **TEST / Sandbox**
   (top-right toggle near your name).
5. Open **Nastavení → API přístup** (Settings → API access). Copy:
   - `Merchant ID` (numeric, ~7 digits) → goes into `COMGATE_MERCHANT_ID`
   - `Secret` (32+ char hex) → goes into `COMGATE_SECRET`
   Keep the secret out of git; mask it in shell history.

> The REST base URL is **`https://payments.comgate.cz/v2.0/`** (same host for
> sandbox and production; the merchant ID itself is what differentiates the
> environments). Authentication is HTTP Basic with
> `Authorization: Basic base64(MERCHANT_ID:SECRET)` — verified empirically
> by hitting the v2.0 root and reading the 403 response body.

## 2. Local env config

Add to `backend/.env`:

```ini
# ComGate (sandbox)
COMGATE_MERCHANT_ID=<your-sandbox-merchant-id>
COMGATE_SECRET=<your-sandbox-secret>
COMGATE_BASE_URL=https://payments.comgate.cz/v2.0
COMGATE_TEST_MODE=true
COMGATE_RETURN_URL=http://localhost:5173/app/billing/return
```

If you run via `docker-compose.dev.yml`, mirror the same variables under the
`environment:` section of the `dev` service so the container picks them up.

> `COMGATE_TEST_MODE=true` makes `services/comgate.create_initial_payment`
> set the `test=true` field on every `create` request — ComGate's sandbox
> requires this even with a sandbox merchant ID, otherwise the call is
> billed against the live merchant if you accidentally swap credentials.

## 3. Expose your webhook to the internet

ComGate POSTs callbacks to a URL you register in the portal. For local dev,
that URL must be publicly reachable. Pick one of:

- **Cloudflare Tunnel (preferred — free, no signup with a fresh tunnel):**
  ```bash
  cloudflared tunnel --url http://localhost:8000
  ```
  → copy the printed `https://<random>.trycloudflare.com` URL.

- **ngrok:**
  ```bash
  ngrok http 8000
  ```
  → copy the printed `https://<random>.ngrok-free.app` URL.

The tunnel URL changes every restart unless you pay for a stable subdomain.
Plan to re-paste into the portal whenever you restart.

## 4. Register callback URLs in the portal

In the merchant portal:

1. **Nastavení → Notifikace** (Settings → Notifications) **`[confirm in merchant portal]`**
2. Set **"URL pro POST notifikaci"** (server-to-server callback) to:
   `<TUNNEL_URL>/api/v1/payments/webhook`
3. Set **"URL pro návrat zákazníka"** (browser return URL) to:
   `<TUNNEL_URL>/api/v1/payments/return`
   (the backend then 302s the customer onward to
   `http://localhost:5173/app/billing/return?status=...`)
4. Save. Some merchant portals require an explicit "Aktivovat" button after
   editing.

> Both URLs must be HTTPS in production. ComGate's callbacks **will not** be
> sent to plain HTTP. Tunneling tools provide HTTPS by default; that's why
> they're recommended over plain port-forwarding.

## 5. Test cards

ComGate publishes a sandbox-cards page in the merchant portal under
**Pomoc → Testovací karty** **`[confirm in merchant portal]`** — copy that
table here once you have it. Until then, ComGate documents at least the
following sandbox cards (stable across years):

| Brand | Card number | Expiry | CVV | Outcome |
|---|---|---|---|---|
| Visa | `4444 3333 2222 1111` | any future | `123` | Success |
| Visa | `4444 5555 6666 7777` | any future | `123` | Success (recurring-eligible) |
| MasterCard | `5555 4444 3333 2222` | any future | `123` | Success |
| Visa | `4000 0000 0000 0002` | any future | `123` | Declined |
| Visa | `4000 0000 0000 9995` | any future | `123` | Insufficient funds |
| Visa | `4000 0027 6000 3184` | any future | `123` | 3DS challenge required |

> Always confirm against the portal's current list before relying on these
> for CI fixtures. Numbers occasionally rotate.

## 6. First end-to-end smoke test

Once the env is set + tunnel is up + URLs registered:

```bash
# 1. Mint a fresh org via dev-login.
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/dev-login \
  -H 'content-type: application/json' \
  -d '{"email":"smoke-test@example.com"}' | jq -r .access_token)

# 2. Choose plan — backend returns the ComGate hosted-payment URL.
REDIRECT=$(curl -s -X POST \
  localhost:8000/api/v1/organizations/current/subscription/choose-plan \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"plan_code":"monthly"}' | jq -r .redirect_url)
echo "Open this in a browser: $REDIRECT"

# 3. Pay with sandbox card 4444 5555 6666 7777, return to /app/billing/return.

# 4. Verify state.
curl -s localhost:8000/api/v1/organizations/current/subscription \
  -H "authorization: Bearer $TOKEN" | jq '{status, seat_count, contracted_seat_count, current_period_ends_at}'
# Expect status="active", contracted_seat_count = your seat_count
```

Expected DB rows after the smoke test:

- `subscriptions.status = 'active'`, `current_period_starts_at = now`,
  `current_period_ends_at ≈ now + 30 days`,
  `contracted_seat_count = seat_count`
- One `payment_methods` row for the org with `card_last4 = '7777'`,
  `comgate_initial_trans_id = <the transId from the webhook>`
- One `invoices` row, `kind='initial'`, `status='paid'`, `amount_minor =
  seat_count * 9900`
- One `webhook_events` row keyed on the ComGate event ID

If the webhook never fires, check (in order):
1. Tunnel is still up (`cloudflared tunnel --url ...` window still open?)
2. Portal callback URL still matches the tunnel URL (changes on each restart)
3. Backend logs for `payments/webhook` — signature mismatch returns 400
4. ComGate portal → **Transakce → Detail** → Notifikace tab — shows what
   they tried to POST and the response they got

## 7. Production checklist

When you're ready to flip the switch:

- [ ] Replace sandbox merchant ID + secret with the live values
      (separate row in `Nastavení → API přístup`, only visible after KYC)
- [ ] Set `COMGATE_BASE_URL=https://payments.comgate.cz/v2.0` (same host, but
      double-check ComGate hasn't moved it)
- [ ] Set `COMGATE_TEST_MODE=false` — so the `test=true` flag is dropped
      from `create` requests
- [ ] Set `COMGATE_RETURN_URL=https://app.simplecrm.cz/app/billing/return`
      (your real frontend origin)
- [ ] Register the **production** callback URL in the live merchant portal
      (`https://api.simplecrm.cz/api/v1/payments/webhook`) — must be HTTPS
      and stable, no tunneling
- [ ] Confirm the production webhook actually receives a test notification
      (portal → "Test notifikace" button) **before** opening signups
- [ ] Run a £real-money £1 test: mint a real org, pay with your own card,
      then refund via the portal. Confirms end-to-end signing + return-URL
      handling on prod creds.
- [ ] Set up alerting on `webhook_events` table growth halting + on
      `subscriptions.dunning_attempts > 0` so failed renewals don't go
      unnoticed
- [ ] Update `.env.example` (if checked in) to reference the env vars but
      not the values

## 8. Troubleshooting

**`{"code":1400,"message":"Rest authorization is missing!..."}`**
→ Basic auth header missing or wrong format. Confirm `COMGATE_MERCHANT_ID`
and `COMGATE_SECRET` are exported and `services/comgate.py` is sending
`Authorization: Basic base64(merchant:secret)`.

**`{"code":1500,"message":"Signature mismatch"}` on webhook**
→ Either the wrong secret is configured, or the signature was computed over
the wrong canonical string. ComGate documents the exact byte sequence in
the merchant portal under "Notifikace → Ověření podpisu"
**`[confirm in merchant portal]`**.

**Webhook never fires, customer sees only the return URL**
→ Tunnel down, portal URL stale, or backend blocked the POST with 4xx.
Check the merchant portal's transaction detail → Notifikace tab — it shows
the last response code.

**`{"code":1400,"message":"Invalid currency"}`**
→ Currency not enabled on the merchant. Sandbox usually has `CZK` and `EUR`
on by default; for `EUR` confirm in the portal.

**Test card declined when it shouldn't be**
→ `COMGATE_TEST_MODE` is false (so `test=true` not sent) and the live
acquirer is processing your "test" card as a real one. Always set
`COMGATE_TEST_MODE=true` against sandbox merchant IDs.

**Recurring charge fails: `{"code":1408,"message":"Recurring not allowed"}`**
→ Initial payment was created without `initRecurring=true`. Fix the
`services/comgate.create_initial_payment` call and re-run the initial
flow on a fresh org so a new transId is generated; the old one cannot be
upgraded post-hoc.

## 9. References

- ComGate help center landing: <https://help.comgate.cz/>
- ComGate v2 API base: `https://payments.comgate.cz/v2.0/` (auth: HTTP Basic
  `merchant:secret`)
- ComGate merchant portal: <https://portal.comgate.cz/>
- ComGate support: `podpora@comgate.cz`, +420 228 224 267
- Test-cards page (in portal): **Pomoc → Testovací karty**
- Webhook signature spec (in portal): **Nastavení → Notifikace → Ověření**
- Plan that introduced this integration:
  `~/.claude/plans/well-the-inteded-seat-staged-lark.md`
- Adversary report that motivated it:
  `qa-artifacts/2026-05-03-adversary-testing-report.md`
