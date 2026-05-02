# PAYGATE-F6 — Super-admin UI

Source: `docs/prompts/PAYGATE_TASK.md` §6 F6 + `RESUME.md`.

## What's there now

Backend (B3) ships every endpoint this UI needs except two small
gaps:

1. **`CurrentUser` schema doesn't expose `is_super_admin`.** The DB
   model has it (`User.is_super_admin: bool`) but the Pydantic schema
   in `backend/app/schemas/auth.py` doesn't include it. Without that,
   the frontend can't gate `/admin` without an extra fetch.
2. **No `GET /admin/organizations/{org_id}/activity` endpoint.** The
   §6 F6 brief calls for "History list: read-only timeline of
   subscription Activity records." The Activity model has every field
   we need (`activity_type`, `payload`, `user_id`, `created_at`) and
   B2 shipped subscription-related enum values. Adding the endpoint is
   small.

Both backend additions land in this commit before the frontend work.

Frontend has no `/admin` route today. AppShell's user menu has no
gear icon. TanStack Table is already used in `CompaniesListPage.tsx`
— the same import pattern works here.

## Files touched

### Backend

- `backend/app/schemas/auth.py` — add `is_super_admin: bool` to
  `CurrentUser`.
- `backend/app/api/v1/admin.py` — add
  `GET /admin/organizations/{org_id}/activity` returning a list of
  `AdminActivityRow` (id, activity_type, payload, actor user id +
  display name + email if not deleted, created_at). Limit + offset
  query params, default limit 50, ordered by `created_at DESC`. Scope
  to `entity_type == 'subscription'` so the timeline shows only
  subscription-relevant rows even if other activity types start
  writing to the org's row in the future.
- `backend/app/schemas/billing.py` — new `AdminActivityRow` and
  `AdminActivityList` Pydantic models.
- `backend/tests/api/v1/test_admin.py` — extend with tests for the
  new endpoint (requires super-admin; returns rows; respects
  pagination).

### Frontend (after types regenerate)

- `frontend/src/App.tsx` — register `/admin` as a top-level route
  (NOT under `/app`). Wrap in a new `RequireSuperAdmin` component.
- `frontend/src/auth/RequireSuperAdmin.tsx` — **new**. Reads
  `useCurrentUser()`, redirects to `/app` when `is_super_admin` is
  false (or to `/login` when no user). Mirrors `ProtectedRoute`
  shape.
- `frontend/src/admin/AdminPage.tsx` — **new**. Top-level surface
  with two sub-tabs (`Organizace` / `Nastavení`).
- `frontend/src/admin/OrgList.tsx` — **new**. TanStack Table with
  search, columns: Název / Plán / Stav / Uživatelé / Trial nebo
  Period končí / Poslední aktivita. Pagination via offset+limit.
  `onSelect(orgId)` callback.
- `frontend/src/admin/OrgDetailDrawer.tsx` — **new**. Subscription
  detail card + five action buttons + activity timeline. Each button
  opens an inline modal (forms differ enough that one
  `<AdminActionModal>` would be a switch-on-type prop — keep them
  separate).
- `frontend/src/admin/AdminBillingSettings.tsx` — **new**. Form for
  the singleton billing settings (DPH toggle + IBAN + IČO + contact
  email). PUT on submit; toast on success.
- `frontend/src/admin/hooks.ts` — **new**. TanStack hooks for
  `useAdminOrgList(query)`, `useAdminOrgSubscription(orgId)`,
  `useAdminOrgActivity(orgId)`, `useAdminBillingSettings()`. All
  swallow errors to `null` (consistent with F4/F5 hook pattern).
- `frontend/src/app/AppShell.tsx` — render a small gear icon link to
  `/admin` in the user menu for super-admins only. Hidden for
  everyone else.
- `frontend/src/__tests__/admin.test.tsx` — **new**. See *Testing*
  below.

## Component shape — `AdminPage`

```
<AdminPage>
  <AdminHeader />        // h1 "Admin", logout, theme toggle, link back to /app
  <AdminTabs />          // 2 tabs: Organizace | Nastavení
  {activeTab === "organizations" && (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-6">
      <OrgList onSelect={setSelectedOrgId} />
      {selectedOrgId ? <OrgDetailDrawer orgId={selectedOrgId} /> : <EmptyState />}
    </div>
  )}
  {activeTab === "settings" && <AdminBillingSettings />}
</AdminPage>
```

No AppShell wrapping — `/admin` is a standalone surface.

## OrgList — TanStack Table

Search box (`Hledat organizaci…`) above the table; debounce 300 ms.
Pagination footer with `Předchozí` / `Další` and `{offset+1}–{end} z
{total}`.

Columns:

| Sloupec          | Source                          | Render |
| ---              | ---                             | --- |
| Název            | `row.name`                      | plain |
| Plán             | `row.plan_display`              | plain |
| Stav             | `row.status` + `row.is_comp`    | reuse F5 status pill helper or copy a small inline version |
| Uživatelé        | `row.user_count`                | right-aligned |
| Končí            | `row.current_period_ends_at` ?? `row.trial_ends_at` | `Intl.DateTimeFormat('cs-CZ').format(...)` |
| Poslední aktivita | `row.last_activity_at`         | relative ("před 3 dny") via inline helper, or absolute fallback |

Whole row is clickable; hover state matches the existing
CompaniesListPage pattern.

## OrgDetailDrawer

Top: org name + IČO + member count (read from the subscription
detail's nested data, plus a small `useAdminOrgUsers(orgId)` if
needed — actually the detail endpoint returns the Subscription only;
member count comes from the list row that's already cached. Pass it
as a prop or read from the cached list query.).

Subscription card: pill + plan name + key dates (started_at,
current_period_starts/ends, canceled_at), override price if set, comp
reason if set, notes if set. Reuse `<PriceDisplay>` and
`formatCzkMinor` for currency; date Intl is fine inline.

Action buttons (each opens a modal):

### `Aktivovat předplatné` modal

- Plan select (`Měsíční` / `Roční` / `Enterprise`).
- `Cena za uživatele (Kč bez DPH)` number input — required for
  Enterprise, optional for monthly/annual (server falls back to
  `Plan.price_per_user_minor`). Convert Kč → minor (×100) on submit.
- `Délka období (měsíce)` — required for Enterprise (`period_months`),
  optional for monthly/annual (server has defaults).
- Submit → POST `/admin/organizations/:id/subscription/activate`.

### `Nastavit jako komplementární` modal

- `Důvod` textarea (1–2000 chars, required).
- `Platnost do (volitelné)` date input — converted to ISO datetime
  on submit.
- Submit → POST `.../set-comp`.

### `Nastavit Enterprise cenu` modal

- `Cena za uživatele (Kč bez DPH)` number input (required).
- `Délka období (měsíce)` number input (required, 1–120).
- `Poznámky` textarea (optional, ≤2000).
- **Live preview**: `Měsíční účet: {users × override} Kč / měsíc bez
  DPH`. Recompute on input change. Use `formatCzkMinor` for the total.
- Submit → POST `.../set-enterprise`.

### `Prodloužit zkušební dobu` modal

- `Počet dní` number input (1–365, required).
- **Live preview**: `Nový konec zkušební doby: {existing trial_ends_at + days}`.
- Submit → POST `.../extend-trial`.

### `Zrušit předplatné` modal

- `Účinnost (volitelné)` date input.
- **Typed-name confirmation**: input field labeled `Pro potvrzení
  napište název organizace` — submit disabled until exact match.
- Confirm button styled `bg-danger` instead of `bg-accent`.
- Submit → POST `.../cancel`.

All modals invalidate `["admin", "org-subscription", orgId]` and
`["admin", "org-list"]` on success. Toast confirmation per existing
project pattern.

### Activity timeline

Below the action buttons. Reads `useAdminOrgActivity(orgId)`. Renders
a vertical list:

- `{actor display name}` · `{activity_type}` · `{relative time}`
- For activity_type values like `subscription.activate` the row shows
  a small detail line summarizing `payload` (e.g. `plan=annual,
  override=199 Kč`).

Empty-state: `Žádná aktivita dosud nezaznamenána.`

## AdminBillingSettings tab

Form bound to `useAdminBillingSettings()`:

- `Jsem plátce DPH` checkbox (with helper text: `Při zapnutí všechny
  ceny v aplikaci přepočtou s DPH`).
- `Sazba DPH (%)` number input (decimal, 0–100). Default 21.
- `IBAN` text input.
- `IČO` text input.
- `Kontaktní e-mail` text input.

Submit → PUT `/admin/billing-settings`. Toast on success.

## Gear icon in AppShell

Add a small `<Settings />` (lucide) icon link to `/admin` in the
existing user menu, rendered only when `useCurrentUser().data
.is_super_admin === true`. Tooltip `Admin`. Sits between the user
identity row and the existing settings/logout block.

## Testing

`frontend/src/__tests__/admin.test.tsx`:

1. Non-super-admin user navigating to `/admin` → redirected to `/app`.
2. Super-admin → `/admin` renders the page with the org list.
3. Search box filters the list (mock receives the `q` query param).
4. Clicking a row opens the drawer with subscription details.
5. `Aktivovat předplatné` modal → submit → POST fired with the right
   body → drawer query invalidated.
6. `Zrušit předplatné` typed-name confirmation gates the submit.
7. `Nastavit Enterprise cenu` live preview updates on input change.
8. `Prodloužit zkušební dobu` ends_at preview updates on input change.
9. Nastavení tab → DPH toggle changes → PUT fired with the right body.
10. AppShell user menu shows the gear icon for super-admin, hidden for
    regular admin.

`backend/tests/api/v1/test_admin.py`:
- `GET /admin/organizations/:id/activity` — requires super-admin
  (403 for regular admin), returns rows ordered by created_at desc,
  respects limit + offset, scoped to subscription entity_type.

## Verification (Playwright per CLAUDE.md)

1. Start backend + frontend.
2. Dev-login. Via psql, `UPDATE users SET is_super_admin = true
   WHERE email = 'admin@example.com';`.
3. Reload `/app`. Verify gear icon appears in the user menu.
4. Click gear → lands on `/admin`. URL stays at `/admin`.
5. Org table renders. Click the seeded org row.
6. Drawer opens with subscription card. Screenshot 1280 dark.
7. Click `Prodloužit zkušební dobu` → enter `30` → see preview →
   submit → drawer reloads with the new trial_ends_at + 30d.
   DB confirms.
8. Click `Nastavit Enterprise cenu` → enter `19900` Kč × `12` months
   → see live preview `Měsíční účet: {N × 19900} Kč / měsíc bez DPH`
   → submit. DB confirms `override_price_per_user_minor = 1990000`
   (minor units), plan code switches to `enterprise`.
9. Click `Zrušit předplatné` → typed name disabled until exact match
   → enter org name → submit. DB confirms `status='canceled'`.
10. Switch to `Nastavení` tab. Toggle `Jsem plátce DPH`. Submit.
    DB confirms.
11. Set `is_super_admin = false` again. Reload — gear icon gone;
    typing `/admin` redirects to `/app`.
12. Reset DB.

Screenshots: 1280 dark for the table, drawer, each modal, and the
Nastavení tab. 390 mobile for the table (drawer stacks below).

## Acceptance for F6

- `/admin` accessible only to super-admins; route gate intercepts
  others.
- All five mutations work end-to-end: form → POST → drawer reloads
  → DB confirms.
- Activity timeline shows the new mutation as the most-recent row
  (the service writes Activity records on every mutation per B2).
- Gear icon in user menu, super-admin only.
- Nastavení tab persists changes via PUT.
- Currency through `<PriceDisplay>` / `formatCzkMinor`. No new
  `Intl.NumberFormat` for currency outside `format.ts`.
- 64+ frontend tests still pass with new ones added; backend pytest
  green.

## Out of scope

- Activity-history pagination beyond limit/offset (no infinite
  scroll or filters).
- Bulk operations across multiple orgs.
- Editing user records (super-admin org-scoped focus only).
- Real-time activity feed via websockets.
- The "extract a shared `<PlanChooser>` once F6 makes it the third
  caller" idea — none of the F6 modals chooses a plan in the same
  shape as F4/F5 (this is a generic plan-code select with optional
  override, not the magenta-badge two-card chooser). Skip the
  extraction.

## Commit

`feat(admin): super-admin org and subscription management`
