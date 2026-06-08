# Pre-payment billing details (Firma / soukromá osoba) — design

**Date:** 2026-06-08
**Status:** Approved design, pending spec review → implementation plan

## Problem

Today the org-creation wizard collects "Fakturační údaje" (an optional IČO step),
and a persistent, non-dismissible red banner (`InvoiceDetailsNudge`) nags admins
to complete IČO + address afterwards. Billing details are collected too early
(at org creation, when the user hasn't committed to paying) and enforced via an
always-on nag rather than at the one moment they're actually required: payment.

## Goal

Collect billing details **at the point of payment**, where they're needed for the
tax invoice. Before the Comgate gate opens, the user picks **Firma** or **soukromá
osoba**, fills the required fields, and continues. Details are saved to the org
(editable later in Settings, and pre-filled on any subsequent payment). The
org-creation billing step and the nag banner are both removed.

The super-admin **Účetnictví** view and tax-invoice issuance must keep working
unchanged — they depend only on the seller's `BillingSettings`, never on buyer
fields being present.

## Decisions (from brainstorming)

- **Type is inferred from IČO presence — no `billing_kind` column, no migration.**
  IČO present ⇒ Firma; no IČO (but name + address) ⇒ soukromá osoba. The toggle is
  client-side UI state only. Selecting "soukromá osoba" **clears** IČO/DIČ/legal_form
  on save so the inference stays consistent.
- **Required fields:**
  - Firma: `ico` (8 digits, ARES-assisted) + full address (`address_street`,
    `address_city`, `address_zip`). `dic` optional.
  - Soukromá osoba: `billing_name` (full name) + full address. No IČO.
  - Both: e-mail optional (invoice falls back to the account/admin e-mail).
- **Mandatory before the gate** — the continue-to-payment button stays disabled
  until billing is valid, and the backend rejects an incomplete charge (422).

## Non-goals

- No new `billing_kind` storage. No changes to seat-upgrade/renewal charges (they
  reuse the saved card and already-saved details). No change to the public
  `/objednavka` demo flow. No redesign of the Comgate integration.

## Architecture

### Backend

1. **`billing_complete(org) -> bool`** helper (new, in `services/billing.py` or a
   small `services/org_billing.py`):
   - `True` iff `address_street`, `address_city`, `address_zip` are all non-empty
     **and** (`ico` matches `^\d{8}$` **or** `billing_name` is non-empty).
   - This is type-agnostic (works without a stored toggle): a Firma satisfies it
     via IČO, a soukromá osoba via `billing_name`.
2. **`POST /payments/initial-payment-init` guard:** before creating the Charge,
   load the org and `raise HTTPException(422, code="billing_details_required")` if
   `not billing_complete(org)`. Backstops the mandatory UI so the rule can't be
   bypassed via direct API calls.
3. **Saving reuses `PUT /organizations/current`** (`OrganizationUpdate`) — already
   accepts `ico`, `dic`, `billing_name`, `legal_form`, `address_*`, `billing_email`.
   No schema change required. (Selecting soukromá osoba sends `ico/dic/legal_form =
   null`.)
4. No migration. No model change. No `OrganizationOut`/`OrganizationUpdate` field
   additions.

### Frontend

1. **New shared component `OrgBillingFields`** (`frontend/src/components/billing/`):
   - A **Firma / soukromá osoba** segmented toggle.
   - Firma: IČO input with the existing debounced ARES auto-fill (ported from
     `InvoiceDetailsCard` — IČO→`billing_name`/`dic`/`legal_form`/`address_*`), DIČ,
     název, adresa.
   - Soukromá osoba: jméno (`billing_name`), adresa. No IČO/DIČ.
   - Controlled form value + an exposed `isValid` derived from the required-field
     rules above. Initial toggle inferred from the passed-in org
     (IČO present ⇒ Firma; else if name+address ⇒ osoba; else default Firma).
   - **Consumed in three places** so the form is byte-identical everywhere:
     a. the pre-payment step (TrialExpiredGate),
     b. the pre-payment step (ChoosePlanModal),
     c. `InvoiceDetailsCard` in Settings (refactored to render `OrgBillingFields`).
2. **`useSaveBillingDetails`** mutation (or reuse the existing org-update mutation)
   → `PUT /organizations/current`, invalidates the org query.
3. **Payment integration** (both entry points): after plan + recurring consent,
   render `OrgBillingFields` pre-filled from `/organizations/current`. The
   continue button is disabled until `recurringConsent && billing.isValid`. On
   submit: `saveBilling(form)` → on success `initPayment()` → on success
   `window.location.assign(redirect_url)`.
   - `TrialExpiredGate`: inline below the consent checkbox.
   - `ChoosePlanModal`: inside the modal (the modal grows / scrolls).
4. **Removals:**
   - Delete `InvoiceDetailsNudge.tsx` and its mount in `AppShell.tsx`.
   - Remove the onboarding `BillingStep` (CreateOrgPage 4→3 steps: name → seats →
     plan); drop `ico` state, step-3 validation, the "Přeskočit" branch, the
     `Step=4`, and the now-dead `icoInput`/`aresPreview` testIds.

### Invoice rendering

Already conditional on IČO presence (the customer IČO line only renders when
`customer_ico` is set), so a soukromá osoba invoice renders correctly with name +
address and no IČO. Confirm the buyer block doesn't surface `legal_form` for
individuals (it's cleared on save anyway). `customer_name` continues to fall back
to `org.name` if `billing_name` is empty — but with mandatory billing that case no
longer occurs for paid charges.

## Data flow (initial payment)

```
User: select plan → confirm recurring consent → pick Firma/osoba → fill fields
  → continue button enabled (consent && billing valid)
  → PUT /organizations/current        (save billing; osoba clears ico/dic/legal_form)
  → POST /payments/initial-payment-init
       backend: billing_complete(org)? no → 422; yes → create Charge + Comgate create
  → window.location.assign(redirect_url)  → Comgate hosted gate
  → (later) webhook PAID → invoice auto-issued using the saved buyer details
```

## Error handling

- ARES lookup failure (404/429/5xx): show the existing inline messages; the user
  can still type fields manually (Firma still requires a valid 8-digit IČO to be
  considered complete).
- `PUT` save fails: show an error, do **not** proceed to payment.
- `initial-payment-init` returns 422 `billing_details_required` (shouldn't happen
  given client gating): surface a message telling the user to complete billing —
  defensive, since the UI prevents reaching it.
- `initial-payment-init` 502 (gateway down): existing "Platební brána není
  dostupná" message; billing is already saved.

## Testing

**Backend**
- `billing_complete`: unit tests — business-complete, individual-complete, missing
  address, missing both IČO and name → incomplete.
- `initial-payment-init`: 422 when org billing incomplete; happy path when complete.

**Frontend**
- `OrgBillingFields`: toggling Firma↔osoba changes required fields; `isValid`
  correct for each type; ARES auto-fill maps fields; osoba clears IČO.
- TrialExpiredGate + ChoosePlanModal: continue disabled until consent + billing
  valid; submit calls save then init then redirect (mocked).
- Onboarding wizard reaches the Plán step with no Fakturace step.
- `InvoiceDetailsNudge` removal: no banner renders for an admin with empty billing.

**CI mirror** (per project convention): ruff check/format, mypy, alembic upgrade,
pytest; pnpm lint/typecheck/format:check/test/build.

## Rollout / sequencing

1. Backend: `billing_complete` + init-payment guard (+ tests).
2. Frontend: `OrgBillingFields` shared component (+ tests).
3. Integrate into TrialExpiredGate and ChoosePlanModal.
4. Refactor `InvoiceDetailsCard` to use `OrgBillingFields`.
5. Remove `InvoiceDetailsNudge` + onboarding `BillingStep`.
6. Run full CI mirror.

Each step is independently committable (crash-resilient).
