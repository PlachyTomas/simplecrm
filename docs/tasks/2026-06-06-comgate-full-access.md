# Comgate full access — review requirements (2026-06-06)

## Context

Comgate has enabled the merchant account in **demo mode**. To get full (production)
access, their review team requires three things on the public website:

1. **Možnost provedení objednávky / nákupu / vložení zboží do košíku** — a demo
   is sufficient; the reviewer just needs to *see the gateway* ("stačí demo jen
   aby viděli tu bránu").
2. **Reklamační podmínky** (vrácení zboží, peněz, storno služby).
3. **Dodací a platební podmínky**.

The Comgate integration itself already exists (`backend/app/services/comgate.py`,
`backend/app/api/v1/payments.py`, billing flow, webhook, VOP/Privacy/DPA/Cookies/
Kontakt/Předplatné pages, footer with Visa/MC logos + Comgate legal text). This
task only adds the three missing review items.

## Research summary

- **API**: Comgate REST v2.0, base `https://payments.comgate.cz/v2.0/`, HTTP Basic
  `merchant:secret`. `POST /payment` body: `price` (minor units), `curr`, `label`,
  `refId`, `email`, `method` ("ALL"), optional `test` (bool), per-payment return
  URLs `url_paid` / `url_cancelled` / `url_pending`. Response: `transId`,
  `redirect` (hosted gateway URL). Source: apidoc.comgate.cz/en/api/rest/.
- **`test=true`** creates a simulated payment — works regardless of merchant mode.
- **Customer return redirect** carries `refId` + `transId` as GET params; must not
  be trusted for billing state (webhook is authoritative — already the case).
- **Webhook** (`POST /api/v1/payments/webhook`) already ACKs non-UUID refIds with
  204 + warning log → demo payments with `refId="demo-…"` are safely ignored.
- **Existing rate limiter**: `app.services.lookup_cache.RateLimiter` (used by
  feedback endpoint with `max_calls=5, window_seconds=300`) — reuse, keyed by
  client IP.
- **Placeholder lint**: legal pages are scanned for `PLACEHOLDER_MARKERS`
  (TODO_, "bude doplněno", TBD, [XXX, lorem ipsum) — new pages must be built from
  `LEGAL_ENTITY` / `COMGATE_INFO` constants with final text, no placeholders.
- Content for the legal pages is already drafted in
  `docs/prompts/LEGAL_COMGATE_TASK.md` (§A.1, §H.6, §H.8 + Comgate mandated
  texts in `frontend/src/marketing/legal-entity.ts`).

## Plan

### 1. Backend — public demo-order endpoint

`POST /api/v1/payments/demo-order` (no auth) in `app/api/v1/payments.py`:

- Body: `{ plan_code: "monthly"|"annual", seats: int (1–25), email: EmailStr }`.
- Validates plan via `billing._load_plan_by_code`; `amount = seats × price`.
- Calls a new `ComGateClient.create_demo_payment(...)`:
  - **`test=True` hardcoded** — NOT `settings.comgate_test_mode`. In production
    that flag is `false`; a public endpoint inheriting it would create real
    chargeable payments. Add a regression test asserting `test=true` is sent
    even when `comgate_test_mode=False`.
  - `refId = f"demo-{uuid4()}"` (non-UUID prefix → webhook ignores it).
  - Short fixed label (`"SimpleCRM demo"`), `method="ALL"`, **no `initRecurring`**.
  - Per-payment `url_paid` / `url_cancelled` / `url_pending` →
    `{frontend origin}/objednavka/navrat?status=paid|cancelled|pending`
    (public page, not the protected `/app/billing/return`).
- No DB rows written (no Charge, no Subscription) — pure gateway showcase.
- Rate limit: `RateLimiter(max_calls=10, window_seconds=600)` keyed by client IP
  (`request.client.host`); 429 on exceed.
- 503 passthrough when Comgate creds missing (existing `_require_credentials`).

### 2. Frontend — demo order flow (`/objednavka`)

- New route `/objednavka` (public, marketing layer): mini-checkout that acts as
  the "cart" Comgate wants to see:
  - plan selector (Měsíční 99 Kč / Roční 999 Kč per user), seat count stepper,
    e-mail field, order summary table (item, qty, unit price, total, "nejsme
    plátci DPH"), demo-mode notice ("testovací objednávka — nebude účtována"),
    consent line linking VOP + Reklamační podmínky + Dodací a platební podmínky.
  - "Zaplatit" → `POST /payments/demo-order` → `window.location = redirect_url`
    (Comgate hosted gateway).
- New route `/objednavka/navrat` (public): reads `?status=` and shows
  paid/cancelled/pending result with links back.
- `CenikPage`: plan cards get a secondary "Objednat" link → `/objednavka?plan=…`
  (trial CTA stays primary) so the reviewer can find the flow from the pricing
  page.

### 3. Legal page — Reklamační podmínky (`/reklamacni-podminky`)

Standalone page (LegalPageLayout), content per LEGAL_COMGATE_TASK §H.6 expanded
to cover exactly what Comgate listed:

- co lze reklamovat (vada digitální služby — nedostupnost nad SLA, ztráta dat,
  nefunkčnost zásadní funkce),
- jak reklamovat (písemně na `LEGAL_ENTITY.email`, náležitosti podání, potvrzení
  přijetí), lhůta vyřízení 30 dnů,
- práva z vadného plnění (oprava, sleva, odstoupení),
- **vrácení peněz** (refund na platební kartu přes Comgate, lhůta),
- **storno služby** (zrušení kdykoli v administraci, účinnost ke konci
  zaplaceného období; trial bez karty → není co stornovat),
- **vrácení zboží** — výslovně uvést, že nejde o fyzické zboží (SaaS), proto se
  vracení zboží neuplatní,
- reklamace plateb: `COMGATE_INFO.contact` blok (Comgate, a.s., adresa, e-mail,
  telefon),
- cross-link z VOP čl. 10.

### 4. Legal page — Dodací a platební podmínky (`/dodaci-a-platebni-podminky`)

Standalone page:

- **Dodací podmínky**: digitální služba — žádná fyzická doprava; aktivace účtu
  okamžitě po registraci (trial), placený plán aktivován **ihned po potvrzení
  platby** (řádově minuty); potvrzení + daňový doklad e-mailem,
- **Platební podmínky**: způsoby platby (karta Visa/Mastercard, Apple Pay,
  Google Pay, bankovní převod — vše přes bránu Comgate), měna CZK, platba předem
  na zúčtovací období, žádné příplatky za platební metodu (surcharging zakázán),
  ceny dle ceníku, "nejsme plátci DPH",
- opakované platby → odkaz na `/predplatne`,
- zabezpečení: `COMGATE_INFO.legalText` + kontaktní blok Comgate.

### 5. Wiring

- Routes in `App.tsx`: `/objednavka`, `/objednavka/navrat`,
  `/reklamacni-podminky`, `/dodaci-a-platebni-podminky`.
- Footer (`LandingPage.tsx`): add both legal links under "Právní informace".
- KontaktPage "Reklamace" section: link the new Reklamační podmínky page.

### 6. Verification

- Backend: pytest for demo-order endpoint (happy path, forced `test=true` with
  `comgate_test_mode=False`, rate limit 429, validation 422, missing creds 503).
- Frontend: vitest where applicable; `pnpm` typecheck/lint/build.
- Playwright (per CLAUDE.md): screenshot `/objednavka`, `/objednavka/navrat`,
  `/reklamacni-podminky`, `/dodaci-a-platebni-podminky`, footer links; walk the
  demo order to the Comgate redirect if sandbox creds are configured locally —
  otherwise verify up to the API call and say so. Close the browser after.
- Run the full local CI mirror (lint, format, typecheck, types:check, tests,
  build) before the closing commit.
- Commit in small chunks (backend / pages / wiring).

### 7. Owner actions (outside the code — required for Comgate review to pass)

- [ ] Deployed backend must have Comgate **demo/test credentials** set
      (`COMGATE_MERCHANT_ID`, `COMGATE_SECRET`), otherwise `/objednavka` returns
      503 and the reviewer never sees the gateway.
- [ ] Deploy frontend + backend with this change before replying to Comgate.
- [ ] **Live smoke test before replying to Comgate** (the local env has no
      Comgate creds, so the gateway redirect was never exercised end-to-end):
      run one order through `/objednavka` on the deployed site and confirm
      (a) the create call returns a gateway redirect (verifies Comgate accepts
      the `url_paid`/`url_cancelled`/`url_pending` fields — names confirmed
      against the official PHP SDK + v2.0 REST docs, but never sent to the
      live API from this codebase), and (b) after paying with a test card the
      `/objednavka/navrat` page shows the "úspěšně" state (verifies Comgate
      appends `refId`/`transId` with `&`, not a second `?`).
- [ ] Reply to Comgate with URLs: `https://<web>/objednavka` (demo objednávka),
      `/reklamacni-podminky`, `/dodaci-a-platebni-podminky`.

> Note: the demo-order rate limit keys on `request.client.host`. Behind a
> reverse proxy that's the proxy IP → effectively a global 10 req / 10 min
> limit unless X-Forwarded-For is honored. Fine for a human reviewer.
