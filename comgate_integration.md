# Comgate integration — finishing against the real test gate

> Working notes written 2026-06-08. Verified against the live Comgate gate and
> the v2.0 REST docs (apidoc.comgate.cz), not guesses.

## What's confirmed (verified live)

- **Auth scheme is correct.** An unauthenticated hit to the live gate returns the
  exact format the code already uses:
  `Authorization: Basic base64_encode(merchant:secret)`. ✅
- **Base URL host is correct:** `https://payments.comgate.cz/v2.0`. ✅
- The account is in **demo mode** — which *is* the test gate. Test credentials are
  already available in the portal; you do **not** need to email Comgate for them.

---

## 1. What the `.env` needs

Credentials come from the **Comgate portal** (`Integrace → Nastavení obchodu →
Napojení obchodu`), not from Comgate support. Add to `backend/.env` on the
**deployed** backend (locally it's optional — without it `/objednavka` returns 503):

```ini
COMGATE_MERCHANT_ID=<SIX-DIGIT e-shop connection identifier — NOT the G-prefixed account/company "Merchant ID">
COMGATE_SECRET=<secret/heslo paired with that six-digit identifier, same portal page>
# Portal: Integrace → Nastavení obchodu → Napojení obchodu (Shop settings → Shop connection).
# The G-prefixed "Merchant ID" is the account-level identifier and is NOT used for API auth.
COMGATE_BASE_URL=https://payments.comgate.cz/v2.0        # already the default — leave as is
COMGATE_TEST_MODE=true                                    # keep true while on the demo/test gate
COMGATE_RETURN_URL=https://<your-deployed-web>/app/billing/return
```

Two things that are **not** in `.env` (set them in the portal under
`Nastavení → Notifikace`):

- **Webhook / POST notification URL** → `https://<your-api>/api/v1/payments/webhook`
- **Customer return URL** → `https://<your-api>/api/v1/payments/return`

For the **`/objednavka` demo smoke-test specifically**, you only strictly need
`COMGATE_MERCHANT_ID` + `COMGATE_SECRET` + `COMGATE_TEST_MODE=true` — that flow
passes its own per-payment return URLs from code.

---

## 2. ✅ Code bugs — FIXED (2026-06-08)

Both blockers below were fixed in `comgate.py` + `payments.py`; full backend
suite (576 tests) + mypy + ruff pass.

1. **Webhook no longer rejects real callbacks.** The fictional
   `verify_webhook_signature` HMAC gate is **removed**. The handler now reads only
   `transId` from the (untrusted) callback — parsing `x-www-form-urlencoded`
   (HTTP POST protocol) with a JSON fallback — then **re-queries the authoritative
   status** via `comgate.get_payment_status()` with our Basic-auth creds. That
   re-query IS the authentication (Comgate's documented model). Non-terminal
   states (`PENDING`/`AUTHORIZED`) are ACKed without recording, so a later `PAID`
   for the same transId still processes — which also fixes the old bug where a
   `PENDING` notification marked the charge failed.

2. **Endpoint paths corrected to v2.0 REST** (`.json` suffixes; recurring/refund
   take their target in the body, not the path):

   | Operation | Now (`comgate.py`) |
   |---|---|
   | Create | `POST /payment.json` |
   | Status | `GET /payment/transId/{id}.json` |
   | Recurring | `POST /recurring.json` (`initRecurringId` in body) |
   | Refund | `POST /refund.json` (`transId` in body) |

   `disable_recurring` is now a true no-op (Comgate recurring is merchant-initiated;
   stopping the scheduler is the cancellation) — no more doomed HTTP call.

### ⏳ One verification still owed (can't be done without creds)

The paths above are confirmed against apidoc + Comgate's curl/PHP-SDK examples,
but **never sent to the live API from this codebase** — Comgate checks auth
before routing, so an anonymous probe can't distinguish a valid path from a 404.
Once the six-digit merchant + secret are set, confirm with authenticated curls
(a correct path → validation/not-found JSON; a wrong path → 404):

```bash
M=<six-digit-merchant>; S=<secret>
for p in payment.json recurring.json refund.json payment/transId/TESTXXXX.json; do
  echo "== $p =="; curl -s -u "$M:$S" https://payments.comgate.cz/v2.0/$p \
    -H 'Content-Type: application/json' --data '{}' -w '\n[%{http_code}]\n'
done
```

Then run one real order through `/objednavka` on the deployed site and confirm a
`PAID` test card flips the charge → the deployed smoke test is the final proof.

**Confirmed OK:** Basic auth scheme, base URL host, price in minor units, `test` flag.

---

## 3. Email to Comgate (Czech)

Reply to the review team with the three required URLs, requesting full access.
**Replace `https://www.simplecrm.cz` with your actual deployed domain.** The
recurring-payments sentence is optional.

---

**Komu:** podpora@comgate.cz
**Předmět:** Žádost o plný přístup – demo objednávka a obchodní podmínky doplněny (obchod SimpleCRM)

Dobrý den,

navazuji na požadavky Vašeho schvalovacího oddělení k aktivaci plného (produkčního) přístupu k platební bráně. Na našem webu jsme doplnili všechny tři požadované náležitosti:

1. **Možnost provedení objednávky** (demo, abyste viděli platební bránu):
   https://www.simplecrm.cz/objednavka
2. **Reklamační podmínky:**
   https://www.simplecrm.cz/reklamacni-podminky
3. **Dodací a platební podmínky:**
   https://www.simplecrm.cz/dodaci-a-platebni-podminky

Objednávkový formulář na adrese `/objednavka` vytvoří testovací platbu (`test=true`) a přesměruje na Vaši platební bránu, takže si celý průběh můžete prohlédnout. Na obě právní stránky vede také odkaz z patičky webu a ze stránky Kontakt.

Prosím o kontrolu a o **aktivaci plného přístupu** k bráně.

*[volitelně – ponechte, pokud chcete rovnou řešit předplatné:] Zároveň bych Vás chtěl požádat o aktivaci **opakovaných plateb** (recurring) na našem obchodě – naše služba funguje na bázi měsíčního/ročního předplatného a opakované strhávání platby budeme potřebovat.*

Předem děkuji za vyřízení.

S pozdravem,
Ing. Tomáš Plachý
SimpleCRM
IČO: 06437541
podpora@simplecrm.cz · +420 776 282 696
