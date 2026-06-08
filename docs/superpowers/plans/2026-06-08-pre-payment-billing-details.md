# Pre-payment billing details (Firma / soukromá osoba) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect Czech billing details (Firma / soukromá osoba) at the moment of payment instead of at org creation, save them to the org, make them mandatory before the Comgate gate, and drop the onboarding billing step and the nag banner.

**Architecture:** New nullable `Organization.billing_kind` column drives a Firma/osoba toggle. A shared React `OrgBillingFields` component (toggle + IČO→ARES autofill + fields, with pure validation helpers) is consumed by both initial-payment entry points and by the existing Settings billing card. The backend backstops the mandatory rule with a `billing_complete()` guard on `initial-payment-init`. Saving reuses the existing `PUT /organizations/current`.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + Pydantic (backend), React + TypeScript + TanStack Query + Vitest (frontend). Spec: `docs/superpowers/specs/2026-06-08-pre-payment-billing-details-design.md`.

**Conventions used throughout:**
- Backend tests: `cd backend && uv run pytest <path> -v`. Postgres must be up (`docker compose -f docker-compose.dev.yml up -d postgres`) and migrated (`cd backend && uv run alembic upgrade head`).
- Frontend tests: `cd frontend && pnpm test`. Type regen check: `cd frontend && pnpm run types:check`.
- Commit after each task. Branch is `main` (the user commits to main here).

---

## File Structure

**Backend**
- Modify `backend/app/db/models/organization.py` — add `billing_kind` column.
- Create `backend/alembic/versions/20260608_1200_organization_billing_kind_a5b6c7d8e9f0.py` — migration.
- Modify `backend/app/schemas/organization.py` — add `billing_kind` to `OrganizationUpdate` + `OrganizationOut`.
- Create `backend/app/services/org_billing.py` — `billing_complete()` helper.
- Modify `backend/app/api/v1/payments.py` — 422 guard in `initial_payment_init`.
- Create `backend/tests/services/test_org_billing.py` — `billing_complete` unit tests.
- Modify `backend/tests/api/v1/test_payments.py` — init-payment 422 test (or a new test file `test_initial_payment_billing_guard.py`).
- Modify `backend/tests/api/v1/test_organizations.py` — `billing_kind` round-trip (create if absent).

**Frontend**
- Create `frontend/src/components/billing/orgBillingForm.ts` — `BillingFormState` type + pure helpers (`emptyBillingForm`, `billingFormFromOrg`, `isBillingFormValid`, `billingFormToPayload`).
- Create `frontend/src/components/billing/OrgBillingFields.tsx` — shared toggle + fields + ARES UI.
- Create `frontend/src/components/billing/__tests__/orgBillingForm.test.ts` — validation/helpers tests.
- Modify `frontend/src/lib/testids.ts` — add `billing` testids; remove dead onboarding `icoInput`/`aresPreview`.
- Modify `frontend/src/auth/TrialExpiredGate.tsx` — integrate the form, gate the button, save→init→redirect.
- Modify `frontend/src/app/settings/SettingsPage.tsx` — integrate the form into `ChoosePlanModal`.
- Modify `frontend/src/app/settings/InvoiceDetailsCard.tsx` — refactor to render `OrgBillingFields`.
- Modify `frontend/src/onboarding/CreateOrgPage.tsx` — remove `BillingStep` (4→3 steps).
- Delete `frontend/src/app/InvoiceDetailsNudge.tsx` + remove its mount in `frontend/src/app/AppShell.tsx`.
- Regenerate `frontend/src/types/api.generated.ts` (via `pnpm run types:generate`).

---

## Phase 1 — Backend: `billing_kind` column + schema + guard

### Task 1: Add `billing_kind` column to the Organization model

**Files:**
- Modify: `backend/app/db/models/organization.py` (after `billing_email`, around line 59)

- [ ] **Step 1: Add the column**

In `backend/app/db/models/organization.py`, directly below the `billing_email` line:
```python
    billing_email: Mapped[str | None] = mapped_column(String(320))
    # "business" (firma — has IČO) or "individual" (soukromá osoba — no IČO).
    # Nullable for orgs created before billing was collected at payment time;
    # the UI falls back to inferring from IČO presence when null.
    billing_kind: Mapped[str | None] = mapped_column(String(16))
```

- [ ] **Step 2: Verify it imports**

Run: `cd backend && uv run python -c "from app.db.models.organization import Organization; print(Organization.billing_kind)"`
Expected: prints a column attribute, no error.

- [ ] **Step 3: Commit**

```bash
git add backend/app/db/models/organization.py
git commit -m "feat(org): add billing_kind column to Organization model"
```

### Task 2: Alembic migration for `billing_kind`

**Files:**
- Create: `backend/alembic/versions/20260608_1200_organization_billing_kind_a5b6c7d8e9f0.py`

- [ ] **Step 1: Write the migration** (mirrors `20260518_2230_organization_deleted_at_e3f4a5b6c7d8.py`; current head is `f4a5b6c7d8e9`)

```python
"""organizations.billing_kind

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-06-08 12:00:00.000000+00:00

Stores whether the customer bills as a company (firma — has IČO) or a
private individual (soukromá osoba — no IČO). Collected in the
pre-payment billing form. Nullable: legacy rows stay null and the UI
infers the toggle from IČO presence.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a5b6c7d8e9f0"
down_revision: str | None = "f4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("billing_kind", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "billing_kind")
```

- [ ] **Step 2: Apply and verify it round-trips**

Run: `cd backend && uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head`
Expected: no error; final state at head `a5b6c7d8e9f0`.

- [ ] **Step 3: Verify single head**

Run: `cd backend && uv run alembic heads`
Expected: exactly one head, `a5b6c7d8e9f0 (head)`.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/20260608_1200_organization_billing_kind_a5b6c7d8e9f0.py
git commit -m "feat(org): migration adding organizations.billing_kind"
```

### Task 3: Expose `billing_kind` in the org schemas

**Files:**
- Modify: `backend/app/schemas/organization.py` (`OrganizationUpdate` ~line 9-35, `OrganizationOut` ~line 38-57)

- [ ] **Step 1: Add to `OrganizationUpdate`**

In `OrganizationUpdate`, after the `billing_email` field:
```python
    billing_email: str | None = Field(default=None, max_length=320)
    billing_kind: Literal["business", "individual"] | None = None
```
(`Literal` is already imported at the top of the file.)

- [ ] **Step 2: Add to `OrganizationOut`**

In `OrganizationOut`, after its `billing_email` field:
```python
    billing_email: str | None = None
    billing_kind: Literal["business", "individual"] | None = None
```

- [ ] **Step 3: Verify schema validates the literal**

Run:
```bash
cd backend && uv run python -c "
from app.schemas.organization import OrganizationUpdate
print(OrganizationUpdate(billing_kind='individual').billing_kind)
try:
    OrganizationUpdate(billing_kind='bogus')
    print('NO ERROR - BAD')
except Exception as e:
    print('rejected bogus OK')
"
```
Expected: `individual` then `rejected bogus OK`.

- [ ] **Step 4: Regenerate the OpenAPI snapshot if one is asserted in tests**

Run: `cd backend && uv run pytest -k "openapi or schema_snapshot" -q`
Expected: PASS, or "no tests ran". If a snapshot test fails because it pins the schema, update the snapshot per its failure message, then re-run.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/organization.py
git commit -m "feat(org): add billing_kind to OrganizationUpdate/Out schemas"
```

### Task 4: `billing_complete()` helper (TDD)

**Files:**
- Create: `backend/app/services/org_billing.py`
- Create: `backend/tests/services/test_org_billing.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/services/test_org_billing.py`:
```python
"""Unit tests for billing_complete() — the mandatory-fields gate the
initial-payment endpoint enforces (and the pre-payment UI mirrors)."""

from __future__ import annotations

from app.db.models import Organization
from app.services.org_billing import billing_complete


def _org(**kw) -> Organization:
    base = dict(
        name="Acme",
        billing_kind=None,
        ico=None,
        billing_name=None,
        address_street=None,
        address_city=None,
        address_zip=None,
    )
    base.update(kw)
    return Organization(**base)


def test_business_complete_with_ico_and_address() -> None:
    org = _org(
        billing_kind="business",
        ico="27082440",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is True


def test_business_incomplete_without_ico() -> None:
    org = _org(
        billing_kind="business",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is False


def test_individual_complete_with_name_and_address() -> None:
    org = _org(
        billing_kind="individual",
        billing_name="Jan Novák",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is True


def test_individual_incomplete_without_name() -> None:
    org = _org(
        billing_kind="individual",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is False


def test_incomplete_when_address_missing() -> None:
    org = _org(billing_kind="business", ico="27082440")
    assert billing_complete(org) is False


def test_null_billing_kind_treated_as_business() -> None:
    # Legacy org: no billing_kind, but has IČO + address → complete.
    org = _org(
        ico="27082440",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is True
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && uv run pytest tests/services/test_org_billing.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.org_billing'`.

- [ ] **Step 3: Implement the helper**

`backend/app/services/org_billing.py`:
```python
"""Czech billing-details completeness check.

A paid charge must carry enough buyer detail to issue a valid daňový
doklad. The pre-payment UI enforces this client-side; this helper is the
server-side backstop used by `initial-payment-init`.

Rule (type-agnostic so it works even when billing_kind is null):
  - full postal address always required, AND
  - individuals: a billing_name (their full name);
  - businesses (or unknown): a valid 8-digit IČO.
"""

from __future__ import annotations

import re

from app.db.models import Organization

_ICO_RE = re.compile(r"^\d{8}$")


def billing_complete(org: Organization) -> bool:
    if not (org.address_street and org.address_city and org.address_zip):
        return False
    if org.billing_kind == "individual":
        return bool(org.billing_name and org.billing_name.strip())
    return bool(org.ico and _ICO_RE.match(org.ico))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/services/test_org_billing.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/org_billing.py backend/tests/services/test_org_billing.py
git commit -m "feat(billing): billing_complete() helper for mandatory buyer details"
```

### Task 5: Guard `initial-payment-init` with `billing_complete` (TDD)

**Files:**
- Modify: `backend/app/api/v1/payments.py` (`initial_payment_init`, ~lines 106-179)
- Create: `backend/tests/api/v1/test_initial_payment_billing_guard.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/api/v1/test_initial_payment_billing_guard.py`:
```python
"""initial-payment-init must 422 when the org's billing details are
incomplete — the server backstop for the mandatory pre-payment form."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.core.security import create_access_token
from app.db.models import Organization, Plan, Subscription, User, UserRole
from app.db.session import AsyncSessionLocal


@pytest.fixture(autouse=True)
def _comgate_creds(monkeypatch) -> None:
    monkeypatch.setenv("COMGATE_MERCHANT_ID", "1234567")
    monkeypatch.setenv("COMGATE_SECRET", "test-secret")
    from app.core.config import get_settings

    get_settings.cache_clear()
    from app.services import comgate

    comgate.reset_default_client()
    yield
    get_settings.cache_clear()
    comgate.reset_default_client()


async def _seed_trialing_org(*, complete: bool) -> tuple[uuid.UUID, str]:
    async with AsyncSessionLocal() as s:
        org = Organization(
            name="Guard Test Org",
            billing_kind="business" if complete else None,
            ico="27082440" if complete else None,
            address_street="Lidická 1" if complete else None,
            address_city="Brno" if complete else None,
            address_zip="60200" if complete else None,
        )
        s.add(org)
        await s.flush()
        email = f"guard-{uuid.uuid4().hex[:8]}@ex.cz"
        s.add(User(email=email, name="A", role=UserRole.admin, organization_id=org.id))
        monthly = (await s.execute(select(Plan.id).where(Plan.code == "monthly"))).scalar_one()
        s.add(
            Subscription(
                organization_id=org.id,
                plan_id=monthly,
                status="trialing",
                started_at=datetime.now(tz=UTC),
                seat_count=1,
                contracted_seat_count=1,
            )
        )
        await s.commit()
        return org.id, email


async def _cleanup(org_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as s:
        await s.execute(delete(Organization).where(Organization.id == org_id))
        await s.commit()


async def test_init_payment_422_when_billing_incomplete(client: AsyncClient) -> None:
    org_id, email = await _seed_trialing_org(complete=False)
    try:
        token = create_access_token(
            (await _admin_id(email)), org_id, UserRole.admin
        )
        resp = await client.post(
            "/api/v1/payments/initial-payment-init",
            json={"plan_code": "monthly"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"]["code"] == "billing_details_required"
    finally:
        await _cleanup(org_id)


async def _admin_id(email: str) -> uuid.UUID:
    async with AsyncSessionLocal() as s:
        return (await s.execute(select(User.id).where(User.email == email))).scalar_one()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && uv run pytest tests/api/v1/test_initial_payment_billing_guard.py -v`
Expected: FAIL — currently returns 502 (ComGate unreachable) or 200, not 422.

- [ ] **Step 3: Add the guard**

In `backend/app/api/v1/payments.py`, inside `initial_payment_init`, after the comp-subscription check and before the `Charge(...)` is constructed (i.e. right after `amount_minor = sub.seat_count * plan.price_per_user_minor`), add:
```python
    from app.services.org_billing import billing_complete

    org = await session.get(Organization, org_id)
    if org is None or not billing_complete(org):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "billing_details_required",
                "detail": "Před platbou je nutné vyplnit fakturační údaje.",
            },
        )
```
Then reuse this `org` for the existing label line (replace the later `org = await session.get(Organization, org_id)` near the ComGate call with the already-loaded `org`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/api/v1/test_initial_payment_billing_guard.py -v`
Expected: PASS.

- [ ] **Step 5: Run the existing payments suite (regression)**

Run: `cd backend && uv run pytest tests/api/v1/test_payments.py tests/integration/test_invoicing_happy_path.py -q`
Expected: all PASS. If any initial-payment test now 422s, seed complete billing (`billing_kind="business"`, `ico`, address) on its org fixture.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/payments.py backend/tests/api/v1/test_initial_payment_billing_guard.py
git commit -m "feat(payments): require complete billing details before initial-payment gate"
```

### Task 6: `billing_kind` round-trips through the org PUT (TDD)

**Files:**
- Modify: `backend/tests/api/v1/test_organizations.py` (create if it doesn't exist)

- [ ] **Step 1: Locate or create the org-update test file**

Run: `ls backend/tests/api/v1/test_organizations.py 2>/dev/null || echo MISSING`
If MISSING, create it with the standard imports used by `test_payments.py` (AsyncClient `client` fixture, `create_access_token`, `AsyncSessionLocal`).

- [ ] **Step 2: Write the failing test**

Add:
```python
async def test_billing_kind_round_trips_through_put(client, ...) -> None:
    # Seed an admin + org, PUT billing_kind="individual" + billing_name + address,
    # then GET /organizations/current and assert billing_kind == "individual".
    # (Follow the existing seed/cleanup pattern in this file / test_payments.py.)
    ...
```
Fill the body using the same seed/token/cleanup pattern as the guard test in Task 5 (seed org+admin, mint token, `PUT /api/v1/organizations/current` with `{"billing_kind":"individual","billing_name":"Jan Novák","address_street":"...","address_city":"...","address_zip":"..."}`, assert 200, then `GET /api/v1/organizations/current` and assert `billing_kind == "individual"`).

- [ ] **Step 3: Run it**

Run: `cd backend && uv run pytest tests/api/v1/test_organizations.py -k billing_kind -v`
Expected: PASS (the PUT handler already does `model_dump(exclude_unset=True)` + `setattr`, so no handler change is needed — this test proves it).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/api/v1/test_organizations.py
git commit -m "test(org): billing_kind round-trips through PUT /organizations/current"
```

---

## Phase 2 — Frontend: shared billing form

### Task 7: Regenerate API types

**Files:**
- Modify: `frontend/src/types/api.generated.ts` (generated)

- [ ] **Step 1: Regenerate**

Run: `cd frontend && pnpm run types:generate`
Expected: `api.generated.ts` updated; `OrganizationOut`/`OrganizationUpdate` now include `billing_kind`.

- [ ] **Step 2: Verify**

Run: `cd frontend && pnpm run types:check`
Expected: passes (generated file matches the live schema). Requires the backend running or the generator's snapshot source — follow the script's existing convention (`scripts/generate-api-types.mjs`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/api.generated.ts
git commit -m "chore(types): regenerate API types with billing_kind"
```

### Task 8: `orgBillingForm.ts` — state type + pure helpers (TDD)

**Files:**
- Create: `frontend/src/components/billing/orgBillingForm.ts`
- Create: `frontend/src/components/billing/__tests__/orgBillingForm.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/src/components/billing/__tests__/orgBillingForm.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
  billingFormFromOrg,
  billingFormToPayload,
  emptyBillingForm,
  isBillingFormValid,
  type BillingFormState,
} from "../orgBillingForm";

const COMPLETE_BUSINESS: BillingFormState = {
  kind: "business",
  ico: "27082440",
  dic: "CZ27082440",
  billing_name: "Acme s.r.o.",
  legal_form: "s.r.o.",
  address_street: "Lidická 1",
  address_city: "Brno",
  address_zip: "60200",
  billing_email: "",
};

const COMPLETE_INDIVIDUAL: BillingFormState = {
  ...emptyBillingForm,
  kind: "individual",
  billing_name: "Jan Novák",
  address_street: "Lidická 1",
  address_city: "Brno",
  address_zip: "60200",
};

describe("isBillingFormValid", () => {
  it("business is valid with 8-digit IČO + full address", () => {
    expect(isBillingFormValid(COMPLETE_BUSINESS)).toBe(true);
  });
  it("business invalid without IČO", () => {
    expect(isBillingFormValid({ ...COMPLETE_BUSINESS, ico: "" })).toBe(false);
  });
  it("business invalid with short IČO", () => {
    expect(isBillingFormValid({ ...COMPLETE_BUSINESS, ico: "270" })).toBe(false);
  });
  it("individual valid with name + address (no IČO)", () => {
    expect(isBillingFormValid(COMPLETE_INDIVIDUAL)).toBe(true);
  });
  it("individual invalid without name", () => {
    expect(isBillingFormValid({ ...COMPLETE_INDIVIDUAL, billing_name: "" })).toBe(false);
  });
  it("invalid when address incomplete", () => {
    expect(isBillingFormValid({ ...COMPLETE_BUSINESS, address_zip: "" })).toBe(false);
  });
});

describe("billingFormFromOrg", () => {
  it("infers individual when no IČO but name+address present and billing_kind null", () => {
    const f = billingFormFromOrg({
      name: "Jan",
      ico: null,
      billing_kind: null,
      billing_name: "Jan Novák",
      address_street: "Lidická 1",
      address_city: "Brno",
      address_zip: "60200",
      dic: null,
      legal_form: null,
      billing_email: null,
    });
    expect(f.kind).toBe("individual");
  });
  it("uses stored billing_kind when present", () => {
    const f = billingFormFromOrg({
      name: "Acme",
      ico: null,
      billing_kind: "business",
      billing_name: null,
      address_street: null,
      address_city: null,
      address_zip: null,
      dic: null,
      legal_form: null,
      billing_email: null,
    });
    expect(f.kind).toBe("business");
  });
});

describe("billingFormToPayload", () => {
  it("individual clears ico/dic/legal_form and sets billing_kind", () => {
    const p = billingFormToPayload(COMPLETE_INDIVIDUAL);
    expect(p.billing_kind).toBe("individual");
    expect(p.ico).toBeNull();
    expect(p.dic).toBeNull();
    expect(p.legal_form).toBeNull();
    expect(p.billing_name).toBe("Jan Novák");
  });
  it("business sends ico + billing_kind business", () => {
    const p = billingFormToPayload(COMPLETE_BUSINESS);
    expect(p.billing_kind).toBe("business");
    expect(p.ico).toBe("27082440");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm test -- orgBillingForm`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

`frontend/src/components/billing/orgBillingForm.ts`:
```ts
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

export type BillingKind = "business" | "individual";

export interface BillingFormState {
  kind: BillingKind;
  ico: string;
  dic: string;
  billing_name: string;
  legal_form: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  billing_email: string;
}

export const emptyBillingForm: BillingFormState = {
  kind: "business",
  ico: "",
  dic: "",
  billing_name: "",
  legal_form: "",
  address_street: "",
  address_city: "",
  address_zip: "",
  billing_email: "",
};

/** Minimal org shape the form needs — accepts the full OrganizationOut. */
type OrgBillingSource = Pick<
  OrganizationOut,
  | "name"
  | "ico"
  | "billing_kind"
  | "billing_name"
  | "dic"
  | "legal_form"
  | "address_street"
  | "address_city"
  | "address_zip"
  | "billing_email"
>;

export function billingFormFromOrg(org: OrgBillingSource): BillingFormState {
  const inferred: BillingKind =
    org.billing_kind === "individual" || org.billing_kind === "business"
      ? org.billing_kind
      : // Legacy null: no IČO but a name+address looks like an individual;
        // otherwise default to business (the common B2B case).
        !org.ico && !!org.billing_name && !!org.address_street
        ? "individual"
        : "business";
  return {
    kind: inferred,
    ico: org.ico ?? "",
    dic: org.dic ?? "",
    billing_name: org.billing_name ?? "",
    legal_form: org.legal_form ?? "",
    address_street: org.address_street ?? "",
    address_city: org.address_city ?? "",
    address_zip: org.address_zip ?? "",
    billing_email: org.billing_email ?? "",
  };
}

function addressComplete(s: BillingFormState): boolean {
  return (
    s.address_street.trim() !== "" &&
    s.address_city.trim() !== "" &&
    s.address_zip.trim() !== ""
  );
}

export function isBillingFormValid(s: BillingFormState): boolean {
  if (!addressComplete(s)) return false;
  if (s.kind === "individual") return s.billing_name.trim() !== "";
  return /^\d{8}$/.test(s.ico.trim());
}

/** Body for PUT /organizations/current. Individuals clear company-only
 *  fields so the saved row is internally consistent. */
export function billingFormToPayload(s: BillingFormState): components["schemas"]["OrganizationUpdate"] {
  const isIndividual = s.kind === "individual";
  return {
    billing_kind: s.kind,
    ico: isIndividual ? null : s.ico.trim() || null,
    dic: isIndividual ? null : s.dic.trim() || null,
    legal_form: isIndividual ? null : s.legal_form.trim() || null,
    billing_name: s.billing_name.trim() || null,
    address_street: s.address_street.trim() || null,
    address_city: s.address_city.trim() || null,
    address_zip: s.address_zip.trim() || null,
    billing_email: s.billing_email.trim() || null,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && pnpm test -- orgBillingForm`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/billing/orgBillingForm.ts frontend/src/components/billing/__tests__/orgBillingForm.test.ts
git commit -m "feat(billing): shared billing form state + pure validation helpers"
```

### Task 9: Add `billing` testids (ADD only)

**Files:**
- Modify: `frontend/src/lib/testids.ts`

Only ADD a new `billing` block here. The dead onboarding `icoInput`/`aresPreview`
ids are removed later (Task 13/14, once their consumer is gone) so every commit
stays typecheck-green.

- [ ] **Step 1: Add the `billing` block**

Add as a sibling of the existing `onboarding` block:
```ts
  billing: {
    kindBusiness: "billing-kind-business",
    kindIndividual: "billing-kind-individual",
    ico: "billing-ico",
    billingName: "billing-name",
    addressStreet: "billing-address-street",
    addressCity: "billing-address-city",
    addressZip: "billing-address-zip",
    submit: "billing-submit",
  },
```
Leave `onboarding.wizard.icoInput` and `aresPreview` untouched for now.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS (pure addition).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/testids.ts
git commit -m "chore(testids): add billing form testids"
```

### Task 10: `OrgBillingFields` component (TDD)

**Files:**
- Create: `frontend/src/components/billing/OrgBillingFields.tsx`
- Create: `frontend/src/components/billing/__tests__/OrgBillingFields.test.tsx`

The component is controlled: props `{ value: BillingFormState; onChange: (next: BillingFormState) => void; orgName: string }`. It renders a Firma/soukromá osoba segmented toggle, then either the business fields (IČO with ARES autofill, DIČ, název, právní forma, adresa, e-mail) or the individual fields (jméno = `billing_name`, adresa, e-mail). Reuse the IČO→ARES autofill logic and the `describeLookupError` copy from `InvoiceDetailsCard.tsx` (lines 49-63, 105-132) — move that logic here.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/billing/__tests__/OrgBillingFields.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { emptyBillingForm, type BillingFormState } from "../orgBillingForm";
import { OrgBillingFields } from "../OrgBillingFields";
import { testIds } from "@/lib/testids";

// useAuth + useLookupRegistry hit network/context — mock them out.
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ accessToken: "t" }) }));
vi.mock("@/app/companies/useLookupRegistry", () => ({
  useLookupRegistry: () => ({ data: undefined, isError: false, isPending: false }),
}));

function renderWith(value: BillingFormState, onChange = vi.fn()) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <OrgBillingFields value={value} onChange={onChange} orgName="Acme" />
    </QueryClientProvider>,
  );
  return onChange;
}

describe("OrgBillingFields", () => {
  it("shows IČO field in business mode", () => {
    renderWith({ ...emptyBillingForm, kind: "business" });
    expect(screen.getByTestId(testIds.billing.ico)).toBeInTheDocument();
  });

  it("hides IČO and shows name field in individual mode", () => {
    renderWith({ ...emptyBillingForm, kind: "individual" });
    expect(screen.queryByTestId(testIds.billing.ico)).not.toBeInTheDocument();
    expect(screen.getByTestId(testIds.billing.billingName)).toBeInTheDocument();
  });

  it("switching to individual emits kind change", () => {
    const onChange = renderWith({ ...emptyBillingForm, kind: "business" });
    fireEvent.click(screen.getByTestId(testIds.billing.kindIndividual));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "individual" }),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm test -- OrgBillingFields`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `OrgBillingFields.tsx`**

Build the controlled component. Required pieces (port markup/styling from `InvoiceDetailsCard.tsx` so it looks identical):
- A segmented toggle: two buttons "Firma" (`data-testid={testIds.billing.kindBusiness}`) and "Soukromá osoba" (`data-testid={testIds.billing.kindIndividual}`); clicking calls `onChange({ ...value, kind })`.
- Business mode: IČO input (`data-testid={testIds.billing.ico}`) with the debounced ARES autofill (port `useDebouncedValue` + `useLookupRegistry` + the `useEffect` that maps `lookup.data` → fields, from InvoiceDetailsCard lines 105-132, writing through `onChange`), DIČ, "Název pro fakturu" (`billingName` testid), "Právní forma", adresa (ulice/město/PSČ), e-mail.
- Individual mode: "Jméno a příjmení" bound to `billing_name` (`data-testid={testIds.billing.billingName}`), adresa, e-mail. No IČO/DIČ/právní forma.
- Address inputs get testids `addressStreet`/`addressCity`/`addressZip`.
- All inputs are controlled off `value` and emit via `onChange`.

Note: because the component is controlled (no internal `useState` for fields), the ARES `useEffect` must call `onChange` with the merged object, guarding against loops by only firing when `lookup.data.ico === value.ico` and the mapped fields differ (mirror InvoiceDetailsCard's `lastFilledIcoRef` guard using a `useRef`).

- [ ] **Step 4: Run the tests**

Run: `cd frontend && pnpm test -- OrgBillingFields`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/billing/OrgBillingFields.tsx frontend/src/components/billing/__tests__/OrgBillingFields.test.tsx
git commit -m "feat(billing): shared OrgBillingFields component (Firma/osoba + ARES)"
```

---

## Phase 3 — Integrate into the payment flows

### Task 11: Pre-payment billing in `TrialExpiredGate` (TDD)

**Files:**
- Modify: `frontend/src/auth/TrialExpiredGate.tsx`
- Create/Modify: `frontend/src/__tests__/trialExpiredGate.test.tsx` (a test file exists per the memory index — extend it)

- [ ] **Step 1: Write the failing test**

Assert: when billing is incomplete, "Pokračovat na platbu" is disabled even with a plan selected and consent checked; after filling required billing fields (or starting from a complete org), the button enables; clicking it calls the save mutation then the init mutation. Mock `useInitialPaymentInit`, the org query, and the save mutation. (Follow the existing mocking style already in `trialExpiredGate.test.tsx`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm test -- trialExpiredGate`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `TrialExpiredGate.tsx`:
1. Add an org query (so we can prefill): `useQuery<OrganizationOut>({ queryKey: ["organizations","current"], queryFn: () => apiFetch("/api/v1/organizations/current", { token: accessToken }) })`.
2. Add state: `const [billing, setBilling] = useState<BillingFormState>(emptyBillingForm)` and hydrate from the org query in a `useEffect` via `billingFormFromOrg`.
3. Render `<OrgBillingFields value={billing} onChange={setBilling} orgName={orgQuery.data?.name ?? ""} />` below `RecurringPaymentConsent`.
4. Change the continue button's `disabled` to also require `isBillingFormValid(billing)`.
5. In `onSubmitChoosePlan`, before `initPayment.mutate`, PUT the billing details:
   ```ts
   await apiFetch("/api/v1/organizations/current", {
     method: "PUT", token: accessToken, body: billingFormToPayload(billing),
   });
   ```
   then call `initPayment.mutate(...)` as today (make `onSubmitChoosePlan` async; on PUT error set the error message and do not proceed).

- [ ] **Step 4: Run the test + typecheck**

Run: `cd frontend && pnpm test -- trialExpiredGate && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth/TrialExpiredGate.tsx frontend/src/__tests__/trialExpiredGate.test.tsx
git commit -m "feat(billing): mandatory billing form in TrialExpiredGate before payment"
```

### Task 12: Pre-payment billing in `ChoosePlanModal` (Settings)

**Files:**
- Modify: `frontend/src/app/settings/SettingsPage.tsx` (`ChoosePlanModal`, ~lines 1442-1587; `handleSubmit` ~1463-1486)

- [ ] **Step 1: Implement (mirror Task 11 inside the modal)**

In `ChoosePlanModal`:
1. Add the org query + `billing` state hydrated via `billingFormFromOrg` (the settings page may already fetch the org — reuse `["organizations","current"]` query data if present).
2. Render `<OrgBillingFields value={billing} onChange={setBilling} orgName={...} />` in the modal body, below the consent checkbox.
3. Disable the submit button unless `recurringConsent && isBillingFormValid(billing)`.
4. In `handleSubmit`, `await apiFetch("/api/v1/organizations/current",{method:"PUT",token,body:billingFormToPayload(billing)})` before `initPayment.mutate`.

- [ ] **Step 2: Manual/RTL check**

Run: `cd frontend && pnpm test -- billingSettings && pnpm typecheck`
Expected: PASS. If `billingSettings.test.tsx` drives the modal, update it so the submit path fills billing first.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/settings/SettingsPage.tsx frontend/src/__tests__/billingSettings.test.tsx
git commit -m "feat(billing): mandatory billing form in ChoosePlanModal before payment"
```

---

## Phase 4 — Settings refactor + removals

### Task 13: Refactor `InvoiceDetailsCard` onto `OrgBillingFields`

**Files:**
- Modify: `frontend/src/app/settings/InvoiceDetailsCard.tsx`

- [ ] **Step 1: Refactor**

Replace the inline form body (the `<div className="mt-6 space-y-5">…</div>` block, lines ~221-372, plus the ARES `useEffect`/lookup state, lines ~89-187) with:
- local `const [form, setForm] = useState(emptyBillingForm)` hydrated from the org via `billingFormFromOrg`,
- `<OrgBillingFields value={form} onChange={setForm} orgName={orgQuery.data.name} />`,
- the existing save mutation, but build the body with `billingFormToPayload(form)` instead of the hand-rolled object.
Keep the card header, the loading/error states, and the submit button (`data-testid={testIds.billing.submit}`).

- [ ] **Step 2: Test + typecheck**

Run: `cd frontend && pnpm test -- InvoiceDetails billingSettings && pnpm typecheck`
Expected: PASS. Update any test asserting the old inline-field testids to the new `billing.*` ids.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/settings/InvoiceDetailsCard.tsx
git commit -m "refactor(billing): InvoiceDetailsCard reuses OrgBillingFields"
```

### Task 14: Remove the onboarding billing step (4→3)

**Files:**
- Modify: `frontend/src/onboarding/CreateOrgPage.tsx`

- [ ] **Step 1: Edit the wizard**

- `type Step = 1 | 2 | 3` (drop 4).
- Remove `ico`/`setIco` state and the `BillingStep` component (lines 418-547) entirely.
- In `goNext`: delete the `if (step === 3)` IČO block; step 2 now advances to step 3.
- Render order: step 1 NameStep, step 2 SeatsStep, step 3 PlanStep. (Remove the BillingStep branch.)
- `onSubmit`: submit fires at `step === 3`; drop the `ico` from the body (`...(ico && …)` removed).
- Next/submit button: the final-step check becomes `step < 3 ? <Pokračovat> : <Vytvořit organizaci>`; remove the `step === 3 && !ico ? "Přeskočit"` branch (always "Pokračovat").
- `STEP_LABELS` → `{1:"Organizace",2:"Uživatelé",3:"Plán"}`; `STEP_NUMBERS = [1,2,3]`.
- Update the component docstring (remove the Fakturační údaje line).
- Remove now-unused imports: `Receipt`, `RefreshCcw`, `useLookupRegistry`, `useDebouncedValue` (keep `ApiError`, still used in `onSubmit`).
- Now that the BillingStep is gone, delete the dead `icoInput` and `aresPreview` keys from `onboarding.wizard` in `frontend/src/lib/testids.ts` (nothing references them anymore).

- [ ] **Step 2: Test + typecheck + build**

Run: `cd frontend && pnpm typecheck && pnpm test -- App`
Expected: PASS (`App.test.tsx` only checks the heading; still renders).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/onboarding/CreateOrgPage.tsx frontend/src/lib/testids.ts
git commit -m "feat(onboarding): drop billing step — collect details at payment instead"
```

### Task 15: Remove the `InvoiceDetailsNudge` banner

**Files:**
- Delete: `frontend/src/app/InvoiceDetailsNudge.tsx`
- Modify: `frontend/src/app/AppShell.tsx` (remove import + render)
- Remove any nudge tests referencing `invoice-details-nudge`.

- [ ] **Step 1: Remove the mount + delete the file**

In `AppShell.tsx` delete the `import { InvoiceDetailsNudge }` and its `<InvoiceDetailsNudge />` usage. Then `git rm frontend/src/app/InvoiceDetailsNudge.tsx`.

- [ ] **Step 2: Grep for stragglers**

Run: `cd frontend && grep -rn "InvoiceDetailsNudge\|invoice-details-nudge" src || echo CLEAN`
Expected: `CLEAN`. Remove any leftover test asserting the banner.

- [ ] **Step 3: Typecheck + test**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/app
git commit -m "feat(billing): remove the invoice-details nudge banner"
```

---

## Phase 5 — Full verification

### Task 16: Run the complete CI mirror

- [ ] **Step 1: Backend**

Run:
```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run alembic upgrade head && uv run pytest -q
```
Expected: all clean / all pass.

- [ ] **Step 2: Frontend**

Run:
```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm run types:check && pnpm format:check && pnpm test && pnpm build
```
Expected: all clean / all pass.

- [ ] **Step 3: Playwright UI check (per project CLAUDE.md)**

Use Playwright MCP to: complete the 3-step onboarding (no Fakturace step), open `TrialExpiredGate` (or the Settings change-plan modal), pick Firma → fill IČO+adresa, confirm "Pokračovat na platbu" enables; toggle to Soukromá osoba → IČO disappears, name+adresa required. Screenshot each. Confirm no console errors. Close the browser when done.

- [ ] **Step 4: Final commit (if any screenshots/docs)**

```bash
git add -A && git commit -m "test(billing): verification screenshots for pre-payment billing flow" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Invoice rendering already handles individuals:** the buyer IČO line is conditional (`{% if invoice.customer_ico %}`), so a soukromá osoba invoice renders name + address with no IČO. `customer_name` falls back to `org.name` when `billing_name` is empty — with mandatory billing this no longer happens for paid charges. No template change required; verify visually in Task 16 if convenient.
- **Super-admin Účetnictví is untouched** — issuance only requires the seller `BillingSettings`; this plan changes only buyer-side capture.
- **Keep commits small** (the user's machine crashes often — never leave a half-applied task).
