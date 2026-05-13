# 2026-05-13 — Feedback batch

Source: Tomáš's feedback in `docs/TODO.md` (lines 10–18). Each section
below is a self-contained slice with its own commit. They land in the
order listed because later items depend on earlier ones (e.g. the
won-deal payment flag needs the deal-value cleanup to render cleanly,
and the admin blocked-ICO list reuses the same ARES autofill helper as
the inline company-create flow).

## 1. Landing-page hero copy

Files: `frontend/src/marketing/LandingPage.tsx`.

- Brand line in `Hero()`: currently `CRM pro prodej. Nic víc, nic míň.`
  on a single `<h1>`. Split so `Nic víc, nic míň.` sits on its own line
  (block-level `<span>` or explicit `<br>`).
- Section heading in `HowItWorks()`: `Od registrace k prvnímu obchodu
  za 5 minut` must fit on one visual line on desktop (≥md). Mobile is
  allowed to wrap.
- Replace the under-hero microcopy (currently
  `Žádná kreditní karta při registraci. Přihlášení přes Google.`) with
  copy that mentions both auth methods, e.g. `Žádná kreditní karta při
  registraci. Přihlášení přes Google nebo e-mail.`
- Update the `HowItWorks` first step title (currently `Zaregistrujte
  se přes Google`) to call out both options, e.g. `Zaregistrujte se
  přes Google nebo e-mail` — keep the body short.

Verification: playwright snapshot of `/` at desktop + mobile widths.

## 2. Hide zero deal value when unset

Files: `frontend/src/app/pipeline/PipelinePage.tsx`,
`frontend/src/app/deals/DealsListPage.tsx`,
`frontend/src/app/deals/DealDetailPage.tsx`.

UI-only treatment: treat `value === 0` as "unset" and hide the money
line in the pipeline card, the value cell in the deals list, and the
hero amount + "Hodnota" field on the deal detail page. The DB column
keeps `default=0` so existing reports / aggregations / data export
need no migration. The pipeline column subtotal continues to sum
values; a column full of unset deals reads `0 Kč` total, which is
the truthful answer.

Rejected the nullable-column approach because it ripples into eight
report widgets, the CSV exporter, and the pipeline totals
accumulator — a lot of risk for an edge case (CRM deal whose value
is genuinely zero) that doesn't come up in practice. Revisit only if
a user files a ticket about wanting to track explicit zero-value
deals separately from unset ones.

## 3. Paid/unpaid on won deals

Files: `backend/app/db/models/deal.py`, `backend/app/schemas/deal.py`,
`backend/app/api/v1/deals.py`, `frontend/src/app/pipeline/PipelinePage.tsx`,
`frontend/src/app/pipeline/useBoard.ts`, alembic migration.

- Add `Deal.is_paid: bool` (default `false`) and `Deal.paid_at:
  datetime | None`. Migration backfills `paid_at = closed_at` for
  rows already in the won stage where `is_paid` should default true?
  → No: leave existing won deals as unpaid; the UI affordance is new,
  the user can tick them in.
- New endpoint `POST /deals/{id}/payment` with body `{paid: bool}`
  that writes `is_paid` + flips `paid_at`. Reuse the existing
  scope/ownership guards from the won-mark endpoint.
- Pipeline board endpoint (`useBoard` payload) returns `is_paid` and
  `paid_at` per deal.
- Pipeline card, won column only: render a `<input type="checkbox">`
  labelled `Zaplaceno`. When paid:
  - Card outline switches to `brand-accent-subtle` border (soft
    magenta) — design tokens already present.
  - Card sinks to the end of the won column. The board endpoint must
    order won deals by `(is_paid ASC, paid_at DESC NULLS LAST,
    closed_at DESC)` so unpaid float to the top and freshly-paid
    appear at the bottom of the paid tail.

## 4. Inline new-company-by-IČO inside the deal modal

Files: `frontend/src/app/deals/AddDealModal.tsx`,
`frontend/src/app/companies/useCreateCompany.ts`,
`frontend/src/app/companies/useLookupRegistry.ts`.

- When the salesperson searches a company name in the deal modal and
  no match is found, show a `Vytvořit novou firmu podle IČO` shortcut
  inline. Clicking it expands a sub-section with the same IČO + ARES
  autofill UX that `AddCompanyModal` uses (extract a reusable
  `<CompanyByIcoFields>` helper rather than mounting the whole modal
  inside the deal modal).
- On submit, create the company first, then create the deal with the
  fresh `company_id`. If the company create succeeds but the deal
  create fails, surface a recoverable toast — leave the company in
  place, don't try to roll it back.

## 5. Companies list — sort + filter for salespeople

Files: `backend/app/api/v1/companies.py`,
`backend/app/schemas/company.py`,
`frontend/src/app/companies/CompaniesListPage.tsx`,
`frontend/src/app/companies/useCompanies.ts`.

- Backend: `GET /companies` learns `sort` (`name` | `ownership_expires_at`
  | `last_order_at` | `last_activity_at`) and `order` (`asc` | `desc`),
  plus `ownership` (`mine` | `mine_and_unowned` | `unowned`). When
  `ownership=mine` filter `owner_user_id = me`; `mine_and_unowned`
  adds `OR owner_user_id IS NULL`; `unowned` filters
  `owner_user_id IS NULL`. `last_activity_at` is computed as
  `GREATEST(last_order_at, updated_at)` for now — there's no separate
  activity stream column yet.
- Frontend: replace the existing static "Název / IČO / Vlastník /
  Město / Založeno" header with sortable columns for ownership
  expiry and last activity. Add a small inline filter chip group
  above the table for the three ownership modes. Salespeople always
  see the filter; managers/admins keep the existing scoped view.

## 6. Admin: blocked-IČO list with reason categories

Files: new `backend/app/db/models/blocked_company.py`, new
`backend/app/api/v1/admin_blocked_companies.py`,
`backend/app/api/v1/companies.py` (block guard on create),
`backend/app/schemas/admin_blocked_companies.py`,
`frontend/src/admin/BlockedCompaniesPanel.tsx`,
`frontend/src/admin/AdminPage.tsx`, alembic migration.

- New table `blocked_companies(id PK, organization_id FK, ico unique
  per org, reason_category enum, note text nullable, ares_name,
  ares_address_*, created_by FK users, created_at)`. Reason enum:
  `competitor`, `do_not_contact`, `bankrupt`, `legal_issue`, `other`.
- Admin endpoints (super-admin or org admin): `GET / POST /
  DELETE /admin/blocked-companies`. POST takes `ico` + reason +
  optional note; backend runs the existing `lookup_registry` service
  and stores the resolved ARES fields on the row so the list shows a
  name even if ARES later disagrees.
- Guard: `POST /companies` rejects with `409 ICO_BLOCKED` when the
  IČO is in the blocked list for the caller's org. Same guard
  applies to `PUT /companies/{id}` when IČO is changed.
- Admin UI: under the existing `AdminPage` (super-admin) and the org
  Settings admin section, a "Blokovaná IČO" panel listing rows with
  inline add (IČO input with ARES autofill) + delete.

## 7. Admin: per-salesperson max-company cap

Files: `backend/app/db/models/user.py`,
`backend/app/api/v1/users.py` (for admin patch of cap),
`backend/app/api/v1/companies.py` (enforcement on create / reassign /
free-and-claim), `frontend/src/app/settings/UsersSection.tsx`,
alembic migration.

- Add `User.max_owned_companies: int | None` nullable. `NULL` = use
  the org default (no cap today; leave the org-level setting out of
  scope for this slice).
- Admin can edit the cap inline in the users list: a small numeric
  input next to each salesperson row, with empty = unlimited.
- Enforcement: when assigning ownership (`POST /companies`,
  `PUT /companies/{id}` ownership change, `POST /companies/{id}/reassign`),
  count the target user's current active ownerships and reject with
  `409 CAP_REACHED` when adding one more would exceed
  `max_owned_companies`. Same check applies to the salesperson
  self-claim path (currently part of create with their own UID).

## Sequencing notes

- Topics 1, 4, 5 are independent and frontend-heavy.
- Topic 2 (nullable value) is the bedrock for the pipeline display
  cleanup that 3 builds on top of.
- Topic 3 adds two columns + sort order; commit it after 2 lands.
- Topics 6 and 7 are admin-only and don't block the salesperson
  surface.

## Out of scope

- A second-pipeline view of paid vs. unpaid revenue (post-launch).
- ARES re-sync of the blocked-IČO list (one-shot snapshot on create
  is enough until a customer asks for refresh).
- Org-wide `default_max_owned_companies` setting (only per-user this
  pass).

## Trimmed during implementation

- Topic 7 (blocked-IČO): dropped the proposed `ares_address_*`
  columns. Only `ares_name` is stored; the list view doesn't show an
  address. Restore if/when a customer asks for the snapshot.
- Topic 7: dropped the super-admin vs. org-admin duality. The
  endpoints are org-admin only — that's the actual user story; super
  admin can still inspect via psql if needed.
