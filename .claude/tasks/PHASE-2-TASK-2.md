# Task 2.2 — Contact model + migration

## Goal
Add the `contacts` table. Contacts are people (first name, last name, email,
phone, LinkedIn, note) optionally attached to a Company. Scoped to the
organization so cross-org leaks are impossible.

## Design notes
- **Scope**: every Contact belongs to exactly one `organization_id` (CASCADE).
- **Company link**: `company_id` is nullable — a prospect may exist before a
  firm is attached. `ON DELETE SET NULL` so deleting a company doesn't cascade
  through contacts (they stay in the pool).
- **Email uniqueness**: per-organization, not global. A phone company's
  "contact@onedrive.cz" might be in two CRMs' books independently. Index the
  `(organization_id, email)` pair.
- **First/last name**: both required. A contact without a name is useless.
- No enums, no activity linkage yet (Activity in Task 2.5 is polymorphic;
  we don't need a backref here).

## Files in scope
- `app/db/models/contact.py` — `Contact` model.
- `app/db/models/__init__.py` — re-export.
- `alembic/versions/<rev>_phase2_contacts.py` — single `contacts` table.
- `tests/db/test_models_phase2.py` — extend with 3 contact tests:
  happy create, email uniqueness per org, company FK SET NULL on delete.

## Acceptance criteria
1. `alembic upgrade head` creates `contacts`; `alembic check` reports no
   pending ops; downgrade removes the table cleanly.
2. Insert + read a Contact linked to a Company.
3. Two contacts with the same email in the same org → IntegrityError.
4. Same email across two orgs → allowed.
5. Deleting the parent Company nulls `company_id` on the contact.
6. Suite still green; ruff / format / mypy clean.
7. One commit: `feat(db): contact table — Task 2.2`.

## Non-goals
- Contact CRUD endpoints — Task 2.6.
- Contact UI — Phase 4.3.
- Deduplication heuristics.
