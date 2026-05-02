# PAYGATE-F5 — In-app billing settings page

Source: `docs/prompts/PAYGATE_TASK.md` §6 F5 + `RESUME.md`.

## What's there now

`frontend/src/app/settings/SettingsPage.tsx` already has a `billing`
tab that renders a small `BillingSection` placeholder. The placeholder
hardcodes `99 Kč`, instantiates its own `Intl.NumberFormat`
(AC6 violation), and shows a disabled `Spravovat platbu` button. F5
substantially rewrites it.

The settings page uses local `useState` for the active tab — there's
no URL sync today. F5 needs to add a route at the literal path the
brief calls out (`/app/nastaveni/predplatne`) and have it land
directly on the billing tab.

F3's trial-countdown CTA in `AppShell.tsx` currently routes to
`/app/settings` per a TODO ("until F5 builds the proper
`/app/nastaveni/predplatne` deep link"). F5 wires that up.

## Files touched

- `frontend/src/app/settings/SettingsPage.tsx`
  - Accept an `initialTab?: SettingsTab` prop; default `"pipeline"`.
  - Replace the existing `BillingSection` body with the F5
    implementation. Drop the local `priceFormatter` and
    `PRICE_PER_USER_CZK = 99` constants — all currency goes through
    `<PriceDisplay>` or `formatCzkMinor` from
    `components/billing/format.ts`.
- `frontend/src/App.tsx`
  - Add a sibling route under `/app`:
    `<Route path="nastaveni/predplatne" element={<SettingsPage initialTab="billing" />} />`.
    This is a real route, not a `<Navigate>` — the URL stays at
    `/app/nastaveni/predplatne` so the brief's address bar matches.
- `frontend/src/app/AppShell.tsx`
  - Update F3's `Vybrat plán →` CTA target from `/app/settings` to
    `/app/nastaveni/predplatne`.
- `frontend/src/__tests__/billingSettings.test.tsx` — new.
- Existing `frontend/src/__tests__/trialCountdown.test.tsx` may be
  asserting the old CTA target — update if so.

No backend changes.

## Component shape — `BillingSection` (the new F5 body)

Three sibling sections inside the existing tab container:

### 1. Aktuální plán

Header: `Aktuální plán` (h2).

Content depends on `useCurrentSubscription()` + `useCurrentUser()`:

| Status / type | Pill copy | Pill color | Action(s) |
| --- | --- | --- | --- |
| `trialing` | `Zkušební verze` | `bg-info-subtle text-info` | `Změnit plán` (primary) → mini-card modal |
| `pending_activation` | `Čeká na platbu` | `bg-warning-subtle text-warning` | none — wait |
| `active` (standard) | `Aktivní` | `bg-success-subtle text-success` | `Kontaktujte podporu` (mailto, primary). NOT a self-service plan change — `BillingService.choose_plan` always flips orgs to `pending_activation`, which would re-gate an active org. §9 lists self-service mid-period changes as out of scope. |
| `active` (comp) | `Komplementární` | `bg-info-subtle text-info` | none. Extra line: `Vaše organizace má speciální podmínky. Pro detaily kontaktujte podporu.` |
| `active` (enterprise) | `Aktivní · Enterprise` | `bg-info-subtle text-info` | `Kontaktovat obchod` (mailto, primary). Extra line: `Vlastní balíček · {effective_price} / uživatel / měsíc` (use `<PriceDisplay interval="custom" />`). |
| `past_due` | `Po splatnosti` | `bg-warning-subtle text-warning` | `Změnit plán` (primary). Same modal as trialing. |
| `canceled` | `Zrušeno` | `bg-danger-subtle text-danger` | `Kontaktujte podporu` (mailto). Note: in practice canceled orgs hit the F4 gate before reaching this page; defensive copy only. |

Plan name display:
- Standard plans: `Měsíční` / `Roční` (from `plan.display_name_cs`).
- Trial: `Zkušební verze (30 dní)`.
- Enterprise: `Vlastní balíček`.
- Comp: `Komplementární`.

Show effective price under the pill (when not comp / not pending):
`<PriceDisplay baseMinor={effective_price_per_user_minor} interval={inferred} hideVatLine />` where `interval` is derived from `plan.billing_interval` (`"monthly" | "annual" | "custom"`).

For `pending_activation` show: `Vyberte plán {plan.display_name_cs}. Po připsání platby vás aktivujeme do 24 hodin.`

### 2. Účtování (only renders for non-comp / non-enterprise active subs and for trialing/past_due)

Header: `Účtování` (h2).

Body lines (read from `useBillingSummary`):

- `{user_count} {csNoun(user_count, "uzivatel")} × {effective_price} = {total} / {period}`.
  Use `<PriceDisplay>` for the per-user price; `formatCzkMinor` for the inline total.
  `period` is `"měsíc"` or `"rok"` based on the plan interval.
- For `monthly` plans: a projection line:
  `Pokud byste platili ročně, ušetříte {formatCzkMinor(savings_minor)} ročně.`
  followed by an inline `<Link to="?…">Přejít na roční</Link>` that
  opens the Změnit plán modal pre-selected to annual. (Anchor inline,
  no separate component — keep scope tight.)
- For `annual` plans: `Šetříte {formatCzkMinor(savings_minor)} oproti měsíčnímu plánu.` (no CTA — they're already on the optimal plan.)
- Next renewal date: `Další obnova: {Intl.DateTimeFormat('cs-CZ').format(current_period_ends_at)}` — only for active/past_due, not trialing.

Date formatting can use a small `formatCsDate(iso: string)` helper
inline in the file or as a sibling `format.ts` export. AC6 only
constrains *currency* Intl, not date Intl, so this is fine.

Hidden entirely for: comp orgs, enterprise orgs, pending_activation,
canceled.

### 3. Faktury (always shown)

Placeholder card: `Faktury` h2 + body `Faktury budou dostupné po
první platbě.` No table, no CTA.

### Změnit plán modal

Only shown when `Změnit plán` button exists (trialing + past_due
only). Mirrors F4's chooser shape but inline in the settings file:

- Two `<PriceDisplay>` cards (monthly + annual), magenta `Ušetříte 16 %` badge on annual.
- Selection same way as F4 (whole card is the radio target).
- Submit POST `/organizations/current/subscription/choose-plan`.
- 200 → close modal + show toast `Plán vybrán. Pošleme vám platební instrukce.` + invalidate `["subscription","current"]` and `["billing-summary","current"]` queries so the page re-renders with `pending_activation`.
- Pre-selection: when invoked from "Přejít na roční" link, `selected = "annual"` initially; otherwise `null`.

**Don't extract the chooser** into a shared component. Per advisor:
F4 just shipped, F6 hasn't told us what shape it needs. Copy/simplify
inline; extract on F6 once a third caller exists.

## Czech plurals & dates

- `csNoun(user_count, "uzivatel")` — already supports nominative
  plural ("uživatel" / "uživatelé" / "uživatelů"). The Účtování line
  is nominative (no preposition forcing instrumental), so this works.
- Dates: `new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(new Date(iso))`.

## Testing

`frontend/src/__tests__/billingSettings.test.tsx`:

1. Trialing → status pill `Zkušební verze`, `Změnit plán` button, Účtování card with monthly projection.
2. Pending activation → `Čeká na platbu` pill, no action button.
3. Active monthly (standard) → `Aktivní` pill, `Kontaktujte podporu` mailto, NOT `Změnit plán`. Účtování shows monthly total + annual projection.
4. Active annual (standard) → `Aktivní` pill. Účtování shows annual total + savings caption.
5. Comp → `Komplementární` pill, speciální podmínky line, no actions.
6. Enterprise active → `Aktivní · Enterprise`, `Kontaktovat obchod` CTA, hides Účtování.
7. Past due → `Po splatnosti`, `Změnit plán` button.
8. Canceled → `Zrušeno`, `Kontaktujte podporu` (defensive — should rarely render).
9. Změnit plán modal → annual select → POST → confirmation toast + close.
10. Faktury card placeholder always renders.

If `trialCountdown.test.tsx` asserts the F3 CTA target, update to the new path.

## Verification (Playwright per CLAUDE.md)

Per RESUME.md house rule: dev-login creates a fresh org each time;
seed via psql against the **latest** org by `created_at` for the dev
user.

1. Start backend + frontend.
2. Dev-login.
3. Navigate to `/app/nastaveni/predplatne` directly (typed URL).
   Verify: URL stays at that path (no redirect flash), billing tab
   active, content matches trialing variant. Screenshot 1280 dark.
4. Click `AppShell` trial badge `Vybrat plán →` — verify it lands at
   `/app/nastaveni/predplatne` (was `/app/settings`).
5. Via psql: flip status / plan to walk through each variant
   (active monthly, active annual, comp, enterprise, past_due).
   Screenshot each at 1280 dark.
6. Open `Změnit plán` modal from a trialing state, choose annual,
   submit. Verify:
   - Toast appears.
   - Page re-renders with `Čeká na platbu` pill.
   - DB confirms `status='pending_activation', plan='annual'`.
7. Navigate to `/app/settings` directly — verify it still defaults
   to the pipeline tab (didn't break existing nav).
8. 390 mobile screenshot of the trialing variant — three cards stack.
9. Reset DB (status='trialing', plan='trial', trial_ends_at +30d).

## Acceptance for F5

- `/app/nastaveni/predplatne` is a real route — typed URL stays.
- All currency through `<PriceDisplay>` or `formatCzkMinor`. No new
  `Intl.NumberFormat` for currency outside `format.ts`.
- Each subscription variant renders the right pill, action(s), and
  optional Účtování card.
- `Změnit plán` is hidden for active / comp / enterprise / canceled
  orgs (only trialing + past_due offer self-service plan choice).
- F3's trial-badge CTA now lands at the new path.
- 54 frontend tests still pass; new tests cover all variants;
  `pnpm lint` + `pnpm typecheck` green.

## Out of scope

- F6 super-admin UI.
- Self-service plan changes for active orgs (mid-period switch with
  pro-rating). §9 explicit out.
- Real PDF invoices — `Faktury` is a placeholder.
- Extracting a shared `<PlanChooser>` component (advisor: wait until
  F6 is the third caller).
- Adding `email` to the 402 payload to fix F4's confirmation-card
  divergence — separate one-line change, not bundled here.

## Commit

`feat(billing): in-app subscription settings page`
