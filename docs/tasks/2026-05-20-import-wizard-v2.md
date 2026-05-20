# 2026-05-20 — Import wizard v2

> Source: Tomáš (conversation 2026-05-20). The current wizard
> (`frontend/src/app/settings/import/ImportPage.tsx`) is a fixed
> single-/two-file flow with a hard-coded "Režim importu" radio group
> (`companies_only`, `combined`, `separate`). This task replaces it with
> a multi-file uploader that infers what each file contains, lets the
> user confirm per-file roles + per-file mappings, and adds first-class
> support for importing **company ownership** (which salesperson owns
> which firma) via a name/email column.

Out of scope (file separately if requested):

- Importing existing **invoices / deals / activities** — schema work
  beyond owner is not in this batch.
- Auto-inviting unknown salespeople. If a row references a user that
  isn't in the org, the row errors out; the admin invites them through
  the existing `/app/settings/users` flow and re-runs the import.
- Custom fields (phase 4 of the May 2026 plan — user has shelved it).
- Background / async imports. We keep the synchronous preview+commit
  shape; the 10 MB / 50 k row caps in `csv_reader.py` stand.

## 1. Multi-file upload + per-file role detection

Files: `frontend/src/app/settings/import/ImportPage.tsx`,
`frontend/src/app/settings/import/csvSniff.ts`,
`frontend/src/app/settings/import/useImport.ts` (new
`detectFileRole()` helper module is fine too).

- Replace the three-mode radio + 1/2 `<FileDrop>` slots with a single
  drop zone that accepts `multiple` and renders an editable list of
  attached files. Each list item shows: filename, size, sniffed
  encoding, detected **role**, row count, and a "Odebrat" button.
- Role detection runs entirely client-side off the sniffed headers:
  - Has any header that maps to `ico`/`dic`/`name` and no
    `first_name`/`last_name` columns → role = `companies`.
  - Has `first_name` + `last_name` (or `Jméno` + `Příjmení`) and no
    company-side keys → role = `contacts`.
  - Has both groups → role = `combined`.
  - Has only `email` + `name` (or `Jméno`) + a role-looking column
    (`role`, `pozice`, `team`) → role = `owners_lookup` (a roster
    that translates external salesperson IDs to org users; see §3).
  - Otherwise → role = `unknown`, user picks from a `<select>`.
- Header→field heuristics: case-insensitive equality first, then a
  short Czech alias map (`firma`, `název firmy` → `name`; `obor`,
  `odvětví` → `industry`; `obchodník`, `prodejce` → `owner`; etc.).
  Store this map next to `COMPANY_FIELDS` so the backend uses the
  same vocabulary when auto-mapping in §2.
- Role is editable: each row has a `<select>` so the admin can override
  the guess. Picking `combined` collapses two files into one logical
  pair (the wizard then runs a single per-row pass over the combined
  file). Picking `owners_lookup` exempts the file from the
  company/contact write path entirely; it's only consulted by the
  owner-resolver.
- Validation before "Pokračovat":
  - At least one file with role `companies` or `combined`.
  - Zero files with role `unknown`.
  - At most one `owners_lookup` file (multiple rosters is ambiguous).
  - Multiple `companies` / `contacts` / `combined` files are allowed
    and concatenated row-wise in the runner (same role = same shape
    after mapping); collisions across files use the same in-file
    dedup rules as today (`dedup_key = ico ?? name.lower()`).

Verification: Playwright drag of 3 files (`firmy.csv`,
`kontakty.csv`, `prodejci.csv`); assert each row shows its detected
role and that mismatched files surface an inline error.

## 2. Per-file mapping (step 2 unchanged in spirit, multiplied)

Files: `frontend/src/app/settings/import/ImportMappingTable.tsx`,
`ImportPage.tsx`.

- Step 2 renders one `ImportMappingTable` per uploaded file, grouped
  by role. Each table is collapsible so a 5-file import doesn't blow
  the viewport.
- Auto-fill the mapping from the alias map (§1) on first render so
  perfectly-named CSVs need zero clicks. The admin can still override.
- Combined-mode files render **two** mapping tables (companies side +
  contacts side over the same headers) — the existing
  `effectiveContactHeaders` plumbing carries over with a per-file id.
- Match-key picker stays the same shape (`ico` / `name` / `email`)
  but binds to a **pair of files**: the contacts/combined file's
  match key against the companies/combined file's match key. When
  only one file is uploaded in `combined` mode, both halves of the
  pair point at the same file and the picker hides the file dropdown.

## 3. Importing owners (salesperson → `Company.owner_user_id`)

Files: `backend/app/services/imports/mapping.py`,
`backend/app/services/imports/runner.py`,
`backend/app/services/imports/owners.py` (new),
`backend/app/api/v1/imports.py`,
`backend/app/schemas/imports.py`,
`frontend/src/app/settings/import/ImportPreviewReport.tsx`.

- Extend `COMPANY_FIELDS` with a single virtual field
  `{"key": "owner", "label": "Obchodník (e-mail nebo jméno)",
  "required": false}`. It's virtual because it doesn't map 1:1 to a
  column on `Company` — the runner resolves it to `owner_user_id` via
  the new owner resolver. Keep the on-disk column out of the catalog
  so the admin can't accidentally write a UUID string into it.
- New module `owners.py`:
  - `OwnerResolver.from_org(session, organization_id, roster_rows=None)`
    builds two case-insensitive lookups: `by_email` and `by_name`.
    `by_email` is authoritative (`User.email` is unique in the org).
    `by_name` deduplicates against case-folded `User.name`; a name
    that matches more than one user is flagged so the runner errors
    on rows that try to use it.
  - `roster_rows` (from the optional `owners_lookup` file) lets the
    admin supply an alias table — e.g. their HR export has
    `external_id="jp"` → `email="jana.prochazkova@firma.cz"`. The
    resolver layers that on top: external ID → email → user.
  - `resolve(value) -> uuid | OwnerResolutionError` picks email vs
    name heuristically (`@` present → email path; else name path).
- Runner integration:
  - When the cleaned company mapping contains `"owner"`, the runner
    calls `OwnerResolver.resolve(cell)` per row and stamps the
    resulting UUID onto `Company.owner_user_id` at write time.
  - Errors are surfaced as new `RowError` codes:
    `owner_unknown` (no match), `owner_ambiguous` (name matches
    multiple users), `owner_inactive` (user exists but is
    deactivated), `owner_cap_reached` (assigning would exceed the
    user's `max_owned_companies`; mirrors `companies.py` lines 66–84).
  - Cap check is **per-import-batch aware**: track a running
    `assignments_per_user: dict[user_id, int]` so a CSV that gives
    one user 50 companies fails on row 51 (when their existing 0 + 50
    + 1 > cap) rather than silently writing the first 50 and erroring
    on later rows after a partial commit.
  - The "never overwrite a non-empty field with a blank cell" rule
    in `_diff_company` and the writer applies to `owner_user_id`
    too: a blank owner cell on an existing row does not clear the
    current owner.
- Preview report (`ImportPreviewReport.tsx`):
  - Add an `Obchodníci` section above the existing
    `Aktualizované firmy` diff list: count of rows that will assign
    an owner, count of rows hitting each `owner_*` error code,
    expandable list with row-index → submitted value → resolution.
- Schema: extend `RowErrorOut` codes (no shape change, just new
  enum-ish values) and add the new field key to the `FieldsCatalog`.

## 4. Pulling `match_source` from per-file context

Files: `backend/app/api/v1/imports.py`,
`backend/app/services/imports/runner.py`.

The current API accepts `mode` + two files. The v2 contract:

- New multipart shape: `files[]` (one or more uploads),
  `file_specs_json` — a JSON array `[{role, mapping, match_key,
  filename}]` paralleling `files[]`. Server validates that
  `len(files) == len(file_specs)`.
- `mode` becomes a derived value, not a request field. Keep the
  literal type alive in `runner.py` for the per-file branching, but
  drop it from the request schema.
- The router stitches per-file candidates into the existing
  `ImportInput.company_candidates` / `contact_candidates` lists
  (concat) and forwards the resolved owner roster to the runner. The
  matcher and writer below `runner.py` do not change shape — they
  still see one flat list of company candidates and one of contacts.

Compatibility note: nobody outside the admin UI calls these endpoints
(admin-only + behind login, no external consumers), so we cut the v1
shape rather than keeping a parallel surface.

## 5. Tests

Files: `backend/tests/services/test_imports_owners.py` (new),
`backend/tests/services/test_imports_runner.py` (extend),
`backend/tests/api/v1/test_imports.py` (extend),
`frontend/src/app/settings/import/__tests__/` (new — vitest).

- `OwnerResolver`: email match, case-folded name match, ambiguous
  name → error, inactive user → error, external-id via roster.
- Cap check: 51 assignments to a user with cap 50 errors on row 51,
  not earlier rows.
- Multi-file: 2 companies CSVs + 1 contacts CSV resolve as expected;
  duplicate IČO across two `companies` files raises
  `duplicate_in_file` against the second occurrence.
- Frontend role-detection: hand-rolled CSV header arrays exercise
  every branch of `detectFileRole()`; ambiguous → `unknown`.

## 6. Migration / rollout

- No DB migration (owner write goes into the existing
  `Company.owner_user_id` column).
- Add a one-line entry to `docs/work-log.md` after the wizard ships.
- Update `MEMORY.md` "7-task batch plan" entry to mark phase 5 (CSV
  import) advanced; v2 is a follow-on, not a brand-new phase.

## 7. Open questions to confirm before coding

- Owner column heuristic: should `"jana@firma.cz, petr@firma.cz"` be
  treated as multi-owner (error — we only support one owner per
  company) or as the first email wins? **Recommendation:** error
  with `owner_ambiguous`; ownership is a single-user concept today.
- Should the wizard let the admin **bulk-assign** every imported
  company to one chosen salesperson (UI checkbox + user-picker)
  instead of requiring a CSV column? **Recommendation:** yes —
  ship as a step-2 toggle "Přiřadit všem obchodníka". Easier path
  for the common case (admin imports a list, wants to give it all
  to one rep). Falls back to the per-row column when toggle off.
