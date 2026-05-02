# PAYGATE-F2 — Public pricing page (`/cenik`)

Source: `docs/prompts/PAYGATE_TASK.md` §6 F2 + `RESUME.md` ("Next task — F2").

## Scope

A standalone public route at `/cenik` (no auth) that lays out the three
public plan tiers — **Měsíční**, **Roční** (highlighted), **Enterprise** —
in three cards that stack vertically below `md`. Czech, vykání throughout.

The page is the marketing surface for the pricing model rather than the
in-app pay-gate (which lives in F4). Visitors land here from the landing
nav (`Ceník`), from the footer, and from any `/login` upsell link.

## Files touched

- `frontend/src/marketing/CenikPage.tsx` — new. Whole page module: nav
  reuse, three cards, helper section, contact-enterprise modal, route
  export.
- `frontend/src/marketing/cenikData.ts` — new. Tiny `useCenikData()` hook
  that bundles the existing `useBillingSettings()` + a TanStack `useQuery`
  for `GET /api/v1/plans/public`. Returns `{ settings, plans, loading,
  error }`.
- `frontend/src/App.tsx` — register `<Route path="/cenik" element={<CenikPage />} />`.
- `frontend/src/marketing/LandingPage.tsx` — flip the nav `Ceník` link
  from `#cenik` (in-page anchor) to `/cenik` (Link to the new dedicated
  page) so visitors discover it. Footer link too. Keep the in-page
  Pricing teaser section as is (the landing-page section still serves as
  a quick at-a-glance preview for one-screen scrollers); don't duplicate
  copy by yanking it.
- `frontend/src/__tests__/cenik.test.tsx` — new. Renders `/cenik`,
  asserts the three card titles, the magenta `Doporučujeme` badge
  appears exactly once, both prices render via `<PriceDisplay>`, the
  Enterprise CTA opens a modal whose Submit posts to
  `/api/v1/contact/enterprise`-style form (or for unauth visitors,
  resolves to a `mailto:` link).

No backend work. The `/plans/public` and `/plans/billing-settings/public`
endpoints already exist (see `backend/app/api/v1/plans.py`).

## Layout details

### Page frame

Reuse the landing-page `<Nav />` and `<Footer />` patterns rather than
inventing new chrome. Put both in `CenikPage` directly to keep the
landing module self-contained, OR — preferred — extract them into
`frontend/src/marketing/SiteChrome.tsx` so they're shared. Decision:
extract, since F-series will keep adding marketing pages and copying
the 200-line nav block isn't sustainable. Landing page imports from
`SiteChrome`, `CenikPage` does too.

### Cards (grid-cols-1 → md:grid-cols-3, gap-6)

Each card is a `<article>` with:

- Background `surface`, border `border`, radius `xl`, padding `space-8`
  on desktop / `space-6` on mobile.
- Header: small uppercase eyebrow (`text-tertiary`, font 12/500), then
  card title (font 18/600/primary).
- Big price slot: `<PriceDisplay size="xl" hideVatLine />` (the global
  DPH note lives below all three cards, so the inner sub-line is
  redundant).
- For the annual card: a `text-success` line under the price reading
  `Ušetříte 189 Kč na uživatele · 2 měsíce zdarma` (static; the dynamic
  N-user math lives on F4 pay-gate, not here).
- Bullets: `<ul>` with check icon (lucide `Check` size 16, stroke 1.75,
  `text-success`), font 14/regular/primary, gap `space-3`.
- CTA: full-width button at the bottom. Monthly + Annual point at
  `/login` (Google login URL is one click further, keeping parity with
  the landing CTA flow). Enterprise opens the contact modal.

### Highlighted (annual) card

- Border 2px `accent` instead of 1px `border`. Slight shadow upgrade
  (`shadow-md`).
- Magenta `Doporučujeme · Ušetříte 16 %` badge anchored top-right
  (negative top + right offset so it sits on the card edge). Uses
  `bg-brand-accent text-text-on-brand-accent` solid fill, radius-full,
  px-3 py-1, font 12/600. **One** magenta element on the screen — no
  other use of `bg-brand-accent` or `text-brand-accent` in this page.

### Enterprise card

Instead of `<PriceDisplay>` it shows the literal string `Vlastní balíček`
in the same `text-5xl font-bold tracking-tight` slot so the three
cards' visual rhythm matches.

### Helper section (below cards)

Centered, max-w-2xl, mt-`space-12`. Two short `<p>` lines:

- `is_vat_payer = false` (current): "Všechny ceny jsou bez DPH."
- `is_vat_payer = true`: "Ceny bez DPH; konečné ceny zobrazujeme s 21%
  DPH."
- Always: "Zkušební doba je 30 dní. Žádná kreditní karta při registraci."

Both lines `text-sm text-text-secondary text-center`.

### Contact modal (Enterprise)

For F2 keep this lightweight — the proper modal lives in F4/F6's
contact-enterprise flow. Acceptable shape: a small modal with name,
e-mail, expected user count, message; submit posts to
`POST /api/v1/contact/enterprise` if it exists, else falls back to
`mailto:podpora@simplecrm.cz?subject=...&body=...`.

Reality check: there's no public `/api/v1/contact/enterprise` endpoint
(it requires auth). For unauthenticated visitors the only option is
`mailto:`. So the modal opens, but the Submit button **builds a mailto
URL** and `window.location` -navigates the user to their mail client.
Authenticated visitors who land on `/cenik` can take the same path
(mailto is universally available); deferring the in-app POST to F5/F6
keeps F2 focused.

## Mobile behaviour (390px)

- Cards stack vertically; annual stays in middle (cards 1/2/3 in DOM
  order).
- Container `px-4`, top padding `space-12`, bottom `space-16`.
- Helper section copy line-wraps cleanly.
- Magenta badge sits at the top of the annual card without overflowing
  off-screen.
- Contact-enterprise modal becomes full-width (already the modal
  default per ui-design.md §5.6).

## Copy

All Czech, vykání. Sources:

- Headline: "Cena za to, co nabízíme."
- Sub: "Stejná cena bez ohledu na velikost týmu. Bez závazků, bez
  zbytečností. Vyzkoušejte 30 dní zdarma a rozhodněte se pak."
- Card 1 bullets:
  - Bez závazků
  - Zrušení kdykoliv
  - Plná funkcionalita
- Card 2 bullets:
  - Vše z měsíčního plánu
  - Účtováno jednou ročně
  - Bez závazků po skončení období
- Card 3 bullets:
  - 25+ uživatelů
  - Vlastní cena a podmínky
  - Dedikovaná podpora
  - Jednání o SLA
- CTAs: "Vyzkoušet 30 dní zdarma" (Měsíční / Roční), "Domluvte se s
  námi" (Enterprise).

## Verification

Per CLAUDE.md, use Playwright MCP:

1. `pnpm dev` (frontend) + uvicorn (backend) running.
2. Navigate to `http://localhost:5173/cenik`.
3. Screenshot at 1280×800 light + dark.
4. Resize to 768 + 390, screenshot each.
5. Confirm no console errors.
6. Confirm the magenta badge appears exactly once on the annual card.
7. Click Enterprise CTA → confirm modal opens.

## Acceptance for F2

- `/cenik` route renders the three cards described.
- `<PriceDisplay>` is reused for the two priced cards; no manual
  `Intl.NumberFormat` invocation in the page.
- Magenta `Doporučujeme` badge is the only `bg-brand-accent` element on
  the page.
- Helper-section copy switches based on `is_vat_payer`.
- Mobile (390px) stacks cards vertically without overflow.
- Page works without auth (verify with logged-out browser session).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green.
- `no-lime.test.ts` passes (no regression).
- Landing-page nav `Ceník` now links to `/cenik`.

## Commit

`feat(landing): pricing page with monthly/annual/enterprise tiers`

(Single commit; followed by a work-log update + RESUME refresh
pointing at F3.)

## Out of scope

- F3 trial countdown UI updates.
- F4 trial-expired pay gate (reuses these card patterns later).
- F5 in-app `/app/nastaveni/predplatne` settings page.
- F6 super-admin UI.
- Any backend changes — `/plans/public` already returns the data we
  need.
- A real public `POST /api/v1/contact/enterprise` endpoint — handled
  later (F4 ties contact-enterprise to authenticated org admins; F2's
  unauthenticated visitors get the mailto fallback).
