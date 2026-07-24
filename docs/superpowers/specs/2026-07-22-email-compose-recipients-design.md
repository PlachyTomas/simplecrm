# Email compose — contact-aware recipients (design)

2026-07-22 · branch `worktree-email-compose-recipients`

## Goal

When composing an email from company detail, the To/CC/BCC fields must let the
user (1) pick from that company's contacts, (2) create a new contact inline
with the company prefilled, or (3) type a raw address — with multiple
recipients throughout. (3) and multi-recipient chips already work; this adds
(1) and (2).

## Decisions (approaches considered)

- **Chosen: suggestions dropdown on the existing `ChipsInput` + inline
  new-contact sub-form inside `EmailComposeModal`.** Mirrors two house
  patterns: `CompanyCombobox` (list-under-input combobox already used *inside*
  a modal) and `AddDealModal`'s inline new-company block ("create X from
  within a modal" = inline sub-form, per navigating-simplecrm-code).
- Rejected: stacking `AddContactModal` over the composer — it sits at `z-50`
  under the composer's `z-[60]` and would double the focus trap
  (`useModalDialog` traps per-dialog).
- Rejected: a combobox/multiselect dependency — the repo hand-rolls these.

## Behavior

- `EmailComposeModal` becomes contact-aware only when its existing
  `companyId` prop is set; without it, today's free-text behavior is
  unchanged.
- Contacts come from `useContacts({ companyId, limit: 100, enabled })`
  (client-side filtering, same pattern as the deals picker; `enabled` is a
  new opt-out added to the hook, default `true`).
- Dropdown (per field, To/CC/BCC): opens on focus; lists up to 8 contacts
  that have an email and aren't already chips in that field; typing filters
  by name/email, diacritics-insensitive ("novak" matches "Novák").
  Row = name + email. Mouse-down is prevented on the list so the input's
  commit-on-blur can't fire a junk free-text chip before the click lands.
- Keyboard: ↑/↓ move the highlight, Enter picks the highlighted row (no
  highlight → commits draft as free text, as today), Escape closes only the
  dropdown. Escape needs a **native** keydown listener on the input —
  `useModalDialog` listens natively on the dialog node, so a React synthetic
  handler would run too late to stop the modal from closing.
- Last dropdown row (always visible when `companyId` is set): "+ Nový
  kontakt" → expands an inline sub-form under that field: first name, last
  name, email (email required here — it exists to be a recipient; backend
  requires first/last name). Saves via `useCreateContact` with
  `company_id = companyId` (hidden, prefilled), adds the email as a chip to
  the field that opened it, collapses. Save error → inline alert, mirroring
  `AddContactModal.saveError`. Sub-form fields count toward the
  dismiss-guard `dirty` flag.

## Call sites

- `CompanyDetailPage` EmailsTab — already passes `companyId`; gains the
  feature with no change.
- `CompanyDetailPage` DealsTab per-deal compose — add `companyId={company.id}`.
- `DealDetail` — add `companyId={company?.id}` (same component, same tested
  path; keeps behavior consistent where a deal's company is known).

## Non-goals

- No backend changes (`/contacts?company_id=` filter and `to: string[]`
  already exist). No API type regen. No email-format validation of free-text
  chips (unchanged from today). No changes to `AddContactModal`.

## Testing

RTL tests in `EmailComposeModal.test.tsx` with a stubbed global `fetch`
serving `/api/v1/contacts` (GET list, POST create): pick-from-suggestions,
diacritics filtering, already-added exclusion, free-text multi-recipient
still works, inline create posts `company_id` and adds the chip, and no
dropdown without `companyId`. Playwright pass on `/companies/:id` (Emails
tab) for the visual + console check.

## New strings / ids

`emails.compose.*` keys in **both** cs and en catalogs (suggestion rows,
new-contact sub-form labels/buttons/errors); new controls registered in
`lib/testids.ts`.
