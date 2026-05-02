# PAYGATE-F4 — Trial-expired pay gate (full-screen takeover)

Source: `docs/prompts/PAYGATE_TASK.md` §6 F4 + `RESUME.md`.

## What's already there vs. what F4 builds

`frontend/src/auth/TrialExpiredGate.tsx` exists as a Phase-1 placeholder
— a centered card with hardcoded `99 Kč`, a direct `Intl.NumberFormat`
call, and a `Přejít na předplatné` button that mailtos support. It
violates AC6 (PriceDisplay must be the only `Intl.NumberFormat` for
currency) and predates the choose-plan API. F4 substantially rewrites
it.

`ProtectedRoute.tsx` already mounts the gate when `useCurrentUser`
(`/auth/me`) returns 402. Its existing `downloadDataExport` helper
already drives `/api/v1/reports/export-csv` — F4 reuses it as `onExport`.

The B4 backend reshaped the 402 payload to
`{code: 'subscription_required', current_status, is_comp,
can_choose_plan, ends_at}` but the frontend types in `lib/api.ts`
weren't updated — `TrialExpiredPayload` still expects the pre-B4
`{detail: "Trial expired", trial_ends_at, organization_id}` shape and
`isTrialExpired` checks `detail === "Trial expired"`. **In its current
state the gate would never fire** even with a real expired trial. F4
fixes this.

## Files touched

- `frontend/src/lib/api.ts` — refresh `TrialExpiredPayload` to the B4
  shape (`code`, `current_status`, `is_comp`, `can_choose_plan`,
  `ends_at`); refresh `isTrialExpired` to detect
  `code === 'subscription_required'`.
- `frontend/src/auth/ProtectedRoute.tsx` — `extractTrialPayload` now
  returns the new shape; remove the inline `onSubscribe` mailto
  fallback (gate handles its own POST). Keep `onExport` plumbing.
- `frontend/src/components/billing/useBillingSummary.ts` — **new**.
  TanStack hook for `GET /api/v1/organizations/current/billing-summary`
  (60 s cache; `ApiError → undefined`). Exposes `user_count` plus
  pre-computed `monthly_total_minor`, `annual_total_minor`,
  `savings_minor` so the gate doesn't recompute.
- `frontend/src/components/billing/PriceDisplay.tsx` — **add export**
  `formatCzkMinor(minor: number): string` so callers can render
  inline currency text (e.g. "ušetříte 1 512 Kč ročně") without
  importing `Intl.NumberFormat` themselves. Keeps AC6 intact —
  Intl.NumberFormat still lives in this one file.
- `frontend/src/auth/TrialExpiredGate.tsx` — full rewrite. See
  Component shape below.
- `frontend/src/__tests__/trialExpiredGate.test.tsx` — **new**.
- Any existing test that mocks `/api/v1/auth/me` returning 402 with
  the old `{detail: "Trial expired"}` shape — update to new shape.

No backend changes. All endpoints in use (`/billing-summary`,
`/plans/public`, `/billing-settings/public`, `/subscription`,
`/choose-plan`, `/contact-enterprise`) ship in B3.

## Component shape

`<TrialExpiredGate payload onExport />` (no longer takes `onSubscribe`
— the gate runs its own POST internally).

State machine:

| State | Trigger | UI |
| --- | --- | --- |
| `loading` | any of billing-summary / plans / subscription pending | small spinner card |
| `idle` | data loaded, no plan selected | two-card chooser, primary CTA disabled |
| `selected` | user clicked monthly or annual | chooser with one card highlighted, CTA enabled |
| `submitting` | POST `/choose-plan` in flight | CTA shows "Odesíláme..."; cards locked |
| `submitted` | 200 from POST | confirmation card replaces chooser |
| `error` | non-OK from POST | inline error above CTA, chooser still usable |
| `enterprise_expired` | subscription is enterprise + period ended | single "Kontaktovat obchod" CTA, no cards |

`is_comp = true` is **never** rendered — `is_app_access_allowed`
returns true unconditionally for comp orgs, so the 402 won't fire.
Defensive: if `payload.is_comp` is somehow true here, render the
loading spinner forever (treat as "should not be here") — failing
closed beats accidentally collecting payment intent from a comp org.

Enterprise detection: read `useCurrentSubscription()` (F3) and check
`subscription.plan.code === "enterprise"`. The `/subscription`
endpoint is mounted under `require_org_membership` only (B4) so it's
reachable from inside the gate.

## Layout (per §6 F4)

- Full-viewport overlay. Backdrop is the previously-rendering app
  shell shown blurred (`backdrop-filter: blur(8px)`). One-screen
  exception to the no-glassmorphism rule. The gate replaces children
  in `ProtectedRoute`, so the app shell isn't actually behind it —
  use a full-bleed `bg-bg/90 backdrop-blur-md` *inside* the overlay
  card stack as a visual nod, since the real app DOM isn't present.
- Centered card, `max-w-2xl`, on a dimmed `bg-bg` ground.
- Headline (`text-2xl font-semibold`): `Vaše zkušební doba skončila.`
- Sub (`text-text-secondary`): `Pokračujte výběrem plánu. Vaše data
  zůstávají v bezpečí.`
- Two cards (mobile stacks, desktop side-by-side):
  - Monthly: `Měsíční`, `<PriceDisplay baseMinor={...} interval="monthly" />`
  - Annual: `Roční`, `<PriceDisplay baseMinor={...} interval="annual" />`,
    magenta badge top-right `Ušetříte 16 %` (`bg-brand-accent text-white`
    — single magenta element on the screen),
    plus dynamic line: `S Vašimi {user_count} {csNoun(user_count, "uživatel")} ušetříte {formatCzkMinor(savings_minor)} ročně.`
  - Whole card is the radio target (`role="radio"`, `aria-checked`,
    keyboard `Enter`/`Space` selects). Selected card gets a
    `border-accent` + subtle accent glow.
- Below cards, link `Potřebujete víc? Domluvte se na enterprise balíčku.`
  → opens an inline `<dialog>` modal:
  - Subject: `Kontaktovat enterprise tým`
  - `expected_users` number input (default `user_count`, `min=1`,
    `max=10000`)
  - `message` textarea (≥1, ≤2000 chars)
  - Submit POST `/api/v1/organizations/current/subscription/contact-enterprise`
    with both fields
  - 200 → "Děkujeme. Ozveme se vám na e-mail do 24 hodin." then close
  - Error → inline error
  - The modal is local to the gate file (no shared `<Modal>` extraction
    — premature). Use the native `<dialog>` element with
    `useRef().current?.showModal()` and the standard `::backdrop`.
- Footer row: `Vybrat plán` (primary indigo, `disabled` until card
  selected) + `Exportovat data` (ghost, calls `onExport`).
- Tertiary line: `Máte otázky? Napište nám na podpora@simplecrm.cz`
  (mailto link, single).

After successful `Vybrat plán` POST:

- Confirmation card replaces the chooser:
  - Heading: `Děkujeme. Pošleme vám platební instrukce.`
  - Body: `Na váš e-mail odešleme fakturu a platební údaje. Po
    připsání platby vás aktivujeme do 24 hodin. Mezitím můžete data
    exportovat.`
  - Single CTA `Exportovat data` (ghost) — same handler.
- **Divergence from §6 F4 brief:** the brief calls for echoing
  `{billingEmail}` literally. We can't fetch it from the gate —
  `/auth/me` is the gated endpoint we got 402'd from, and there's
  no other read for the user record without rotating the refresh
  cookie. Generic copy is good enough; F5 can revisit by including
  `email` in the 402 detail payload.

For `enterprise_expired`:

- No cards.
- Body: `Vaše enterprise předplatné skončilo. Domluvte se s naším
  obchodním týmem na prodloužení.`
- Single primary `Kontaktovat obchod` button → opens the same
  contact-enterprise modal.
- `Exportovat data` ghost still present.

## Czech plurals

Reuse the existing `csNoun` helper used in `AppShell.tsx` for the
trial badge. Forms: 1 → `uživatel`, 2-4 → `uživatelé` (or `uživateli`
in instrumental — context here is "S Vašimi N uživateli", instrumental
plural is `uživateli` for both small and ≥5 sets), 5+ → `uživateli`.
Confirm by reading `csNoun`'s current call sites before assuming.

## Testing

`frontend/src/__tests__/trialExpiredGate.test.tsx`:

1. Renders the chooser with both cards, primary disabled until select.
2. Clicking annual highlights it and enables the primary.
3. Clicking primary fires POST `/choose-plan` with the right body and
   shows the confirmation card on 200.
4. The savings caption interpolates `user_count` correctly for N=1,
   N=8, N=25 (covers `csNoun` boundaries — though here the
   instrumental plural is the same for N=2 and N=8, we still verify
   the price math).
5. Single magenta `bg-brand-accent` element on the screen.
6. Enterprise variant (mock `useCurrentSubscription` returns
   `plan.code === "enterprise"`, `current_period_ends_at` past) →
   no cards, single `Kontaktovat obchod` CTA.
7. `Exportovat data` calls the passed `onExport`.

Update existing `App.test.tsx` / `protectedRoute.test.tsx` (whichever
mocks the 402 with the old shape) to use the new shape.

## Verification (Playwright per CLAUDE.md)

Per RESUME.md house rule: dev-login creates a fresh org each time,
so seed via psql against the **latest** org for the dev user.

1. Start backend + frontend (`pnpm dev` + uvicorn).
2. Dev-login as the test user.
3. Via psql on `simplecrm-postgres-1`:
   - find `org_id = (select id from organizations where ... order by created_at desc limit 1)`;
   - `update organizations set trial_ends_at = now() - interval '1 day' where id = <org_id>;`
   - `update subscriptions set status = 'canceled', current_period_ends_at = now() - interval '1 day' where organization_id = <org_id>;`
4. Hard reload `/app/...` → gate renders. Screenshot at 1280 light + dark, 768, 390.
5. Select annual → primary enables → click → confirmation card appears.
   Screenshot.
6. Reset `subscriptions.status = 'trialing'` and flip to enterprise:
   `update subscriptions set plan_id = (select id from plans where code='enterprise'), status='past_due', current_period_ends_at = now() - interval '1 day' where organization_id = <org_id>;`
   Reload → enterprise variant. Screenshot.
7. Click `Kontaktovat obchod` → modal opens. Cancel.
8. Click `Exportovat data` → CSV downloads (or 200 from network panel
   — no need to verify the file content).
9. Reset DB (set status back to `trialing`, `trial_ends_at` to 30+
   days out).
10. Console clean throughout.

## Acceptance for F4

- Gate fires when API returns 402 `subscription_required` (verify by
  hand-crafting a test where `/auth/me` returns the new B4 shape).
- Comp orgs: gate never fires (B4 already enforces; spot-check by
  setting `is_comp=true` in DB and seeing the gate not render).
- Both cards selectable; primary disabled until selection.
- Choose-plan POST → confirmation; org stays gated until founder
  activates via super-admin (F6).
- Enterprise expired → `Kontaktovat obchod` only, no cards.
- Magenta `Ušetříte 16 %` badge appears at most once on the screen.
- All currency through `<PriceDisplay>` or `formatCzkMinor` — grep
  proves no new `Intl.NumberFormat` outside `PriceDisplay.tsx`.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` green.

## Out of scope

- F5 in-app `/app/nastaveni/predplatne` settings page.
- F6 super-admin UI.
- Real payment integration — choose-plan still just flips org to
  `pending_activation`.
- A reusable global `<Modal>` component — the contact dialog stays
  inline in the gate. Extract later if F5/F6 need the same shape.
- Adjusting `TrialBanner.tsx` (separate ≤3-day banner, untouched).

## Commit

`feat(billing): trial-expired pay gate with monthly/annual choice`
