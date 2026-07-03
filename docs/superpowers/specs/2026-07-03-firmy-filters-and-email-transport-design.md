# 2026-07-03 — Firmy filters + bulk-email recipient selection, and transactional email via Resend

> Source: Tomáš (conversation 2026-07-03). Two independent pieces, shipped
> as two commits/specs but recorded together:
> **A. Firmy filtering + bulk-email recipient selection** (the requested
> feature), and **B. transactional email via a provider HTTP API** (fixes
> feedback/signup/invoice delivery, which the production host's blocked
> outbound SMTP breaks).
>
> Out of scope: bulk email stays on **per-user SMTP** by design — the owner
> unblocks outbound SMTP (465/587) on the backend host himself. No change to
> the bulk-email SMTP gate.

## A. Firmy filters + bulk-email recipient selection

### Backend
- `GET /companies` (`list_companies`) gains optional filters, all applied
  **inside** the existing `scope_by_owner` visibility scoping:
  - `owner_user_id: UUID | None` — companies owned by that user. Combined
    with the existing `ownership=unowned` (Nezabrané) and "no param = Vše",
    this expresses the whole Vlastník dropdown.
  - `industry: str | None` — exact match on `Company.industry`.
  - `city: str | None` — exact match on `Company.address_city`.
- New `GET /companies/filter-options` → `CompanyFilterOptions`:
  `{ industries: list[str], cities: list[str], owner_user_ids: list[UUID] }`
  — distinct, non-empty, sorted values drawn from the caller's **visible**
  companies (scoped). Salespeople therefore only see their own book's values.
- Bulk email (`resolve_recipients` / `_owned_companies_query`) accepts the
  same `owner_user_id` / `city` filters (industry already supported) and
  honors the chosen owner filter — including **Nezabrané** (unowned) and a
  specific owner — within the caller's scope, replacing the current implicit
  "owned-only" restriction. Blocked-IČO and no-email skips are unchanged.

### Frontend
- `CompaniesListPage`: replace the ownership radiogroup with a filter bar —
  **Vlastník** dropdown (`Vše` / each owner / `Nezabrané`), **Obor**
  dropdown, **Sídlo** (city) dropdown, and a **"Vymazat filtry"** button.
  Options come from `/companies/filter-options`; owner ids map to names via
  the existing org-users query. Any filter change resets to page 1. The
  Vlastník dropdown maps to backend params: `Vše` → none, `<id>` →
  `owner_user_id`, `Nezabrané` → `ownership=unowned`.
- `BulkEmailWizard`: opened from "Hromadný e-mail" **pre-loaded with the
  current Firmy filters** (owner/industry/city). Its Step-1 filter form is
  removed; it opens on the recipient list resolved from those filters, with
  a **select-all / none** master toggle plus the existing per-company and
  per-email checkboxes, then Text → Odeslání as today. A one-line summary of
  the active filters is shown.

### Data flow
Firmy page holds filter state → `useCompanies(...)` for the paged list and
`useCompanyFilterOptions()` for the dropdowns → "Hromadný e-mail" passes the
same filter object to `BulkEmailWizard` → `resolve_recipients` returns all
matching companies → user checkboxes → send (unchanged).

## B. Transactional email — SUPERSEDED (no code)

Originally scoped as a Resend HTTP-API transport, because the production
host blocked outbound SMTP. **2026-07-03: Hetzner unblocked outbound SMTP**,
so transactional email (feedback / signup / invoices) now goes over the
**existing Zoho SMTP path** — the `send_email` code already sends via SMTP
once `SMTP_HOST` + `SMTP_USERNAME` + `SMTP_PASSWORD` are set. This is now an
**ops task only** (see `docs/TODO.md` "Finish the Zoho Mail SMTP setup":
app password, send-as identities, SPF/DKIM for `simplecrm.cz`). No Resend,
no new code. Bulk email likewise returns to plain per-user SMTP.

## Verification
- Backend: unit + integration tests for each new filter, the filter-options
  endpoint, resolve_recipients honoring owner/city, and the Resend transport
  (success + failure-swallowed). `ruff`, `mypy`, full `pytest`.
- Frontend: filter-bar + wizard behavior; `pnpm` lint/typecheck/test/build +
  `types:check` after regenerating API types.
- Live: local stack — filter Firmy, open bulk email, confirm the filtered
  set + select-all drive the recipient list.
