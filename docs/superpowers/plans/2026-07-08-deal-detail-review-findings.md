# Review findings — deal-details-and-mails (baseline 614fc19) — 2026-07-08

3 Opus auditors (backend code, frontend code, live Playwright UX). Suites at baseline:
pytest 702 passed, vitest 151 passed, tsc clean, 0 console errors. All problems below are
design/UX/spec gaps the suites don't cover. Status: mark FIXED as fixes land.

## P1 — owner complaints + hard spec fails

| # | Status | Finding | Where |
|---|--------|---------|-------|
| 1 | FIXED | Deal dialog top-pinned, bottom cut off (measured 92px below fold @900px): outer `items-start`+`my-auto`, no max-h/internal scroll. Fix: `items-center`, panel `max-h-[90vh]` internal scroll, sticky header | DealDetailDialog.tsx:25,30 |
| 2 | FIXED | Disabled "Poslat e-mail" only has native `title` — no link to Nastavení→Integrace, unreliable on disabled buttons (AC-3.1 fail) | DealDetail.tsx:256 |
| 3 | FIXED | No "Přidat obchod" from Firma→Obchody tab (owner complaint; ContactsTab has the pattern) | CompanyDetailPage.tsx:282 |
| 4 | FIXED | Activity rows don't name their deal: no deal_name in any deal-scoped payload, ActivityOut flat, no join. Live: "Změna fáze"/"Obchod vyhrán" bare | deals.py:344,411,466; activityLabels.ts:68 |
| 5 | FIXED | deal_updated/company_updated store only changed field NAMES — old→new unrenderable. Old value in hand at deals.py:249 but discarded; companies.py:514 same | deals.py:263, companies.py:526 |
| 6 | FIXED | stage_change payloads carry stage UUIDs, no names → "Fáze: → Nabídka" impossible; activityDetail has no stage_change case | deals.py:344; activityLabels.ts |
| 7 | FIXED | Obchody table has NO per-row "Poslat e-mail" actions cell (spec WS2 + AC-3.1 explicit) | CompanyDetailPage.tsx:292-312 |
| 8 | FIXED | App logo ≠ landing logo ≠ favicon (3 different marks; wordmark+dot vs pink Sparkles-in-box vs dark-square-S). Decision: sync app+favicon to landing mark, shared component | Logo.tsx:28; LandingPage.tsx:101-107; favicon.svg |

## P2

| # | Status | Finding | Where |
|---|--------|---------|-------|
| 9 | FIXED | Company page has no sent-email history/compose (spec WS3 put history on company page; hooks exist, unmounted) → add E-maily tab | CompanyDetailPage.tsx |
| 10 | FIXED | Composer: no client-side attachment size/type validation (only server 422 + generic toast) | EmailComposeModal.tsx:209 |
| 11 | FIXED | No test for migration company_id backfill (AC-4.5); migrations not exercised by test schema build | test_activity_feed.py; 20260708_1930 migration |
| 12 | FIXED | Deal name truncates in dialog header (~11 chars) — 6 action buttons crowd the row | DealDetail.tsx:191-199 |

## P3

| # | Status | Finding | Where |
|---|--------|---------|-------|
| 13 | FIXED | References header = parent's Message-ID only, not chain (RFC 5322); rebuild chain from thread at send | mailer.py:86 |
| 14 | FIXED | Reply not constrained to parent's deal/company — child can share thread_id under different deal | emails.py:82-92 |
| 15 | FIXED | send_user_email catches only SMTPException/OSError/SSLError; MIME/encode errors escape as 500 with no failed row | mailer.py:93-98 |
| 16 | FIXED | EmailComposeModal comment claims "keyed remount" but no key passed at call sites | EmailComposeModal.tsx:110; DealDetail.tsx:471 |

## Payload contract (approved, implemented by fix batch A backend / B frontend)

- Every deal-scoped activity payload gets `deal_name` (snapshot string).
- `stage_change`: + `from_stage_name`, `to_stage_name` (keep *_id keys).
- `deal_updated`/`company_updated`: + `changes: {field: {from, to}}` — display-ready strings
  (FKs resolved to names, dates ISO, Decimal→str, null ok). Legacy `changed:[names]` kept.
- `ActivityOut`: + `user_name` (nullable, denormalized).
- Frontend: rows render "Obchod „X": …", stage "Fáze: A → B", edits per-field "Název: old → new",
  >3 fields collapsible ("Zobrazit vše (N)"); legacy payloads fall back to names-list rendering.

## Verified PASS at baseline (don't re-fix)

Deep-link /app/deals/:id redirect (AC-1.5); dialog Esc/backdrop close; obchody table names
not UUIDs + row-click; compose modal itself centered, To/CC/BCC/attachments present;
AC-2.4/3.3–3.7/4.1–4.4 backend tests pass; 0 console errors on all routes.
