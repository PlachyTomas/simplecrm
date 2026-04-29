# SimpleCRM — Design Brief

You are designing **SimpleCRM**, a minimal Czech CRM for small sales teams (5–25 users). Produce a cohesive visual direction and deliver the priority screens below. This brief gives you the product, the constraints, and the locked-in palette — then gets out of your way on execution.

---

## 1. The product in one paragraph

SimpleCRM is positioned as *"CRM pro prodej. Nic víc, nic míň."* (CRM for sales. Nothing more, nothing less.) It deliberately ships less than its competitors — no calendars, no email sequences, no marketing automation. It competes on **price** (99 CZK/user/month against RAYNET at 390 and Pipedrive at 322) and on **Czech-nativeness** (ARES business registry integration, Czech UI throughout, vykání everywhere). The two signature features are one-click company creation via IČO (ARES lookup) and automatic release of companies from salespeople who haven't closed a deal in 365 days.

Users are Czech SMB sales teams migrating from spreadsheets or expensive legacy CRMs. The app must feel **lightweight and fast**, **speak Czech naturally**, make the common actions (add company, move deal, mark won) feel **good**, and not look like another Salesforce clone or a toy.

---

## 2. Three tensions to resolve

**Familiar vs fresh.** Blue dominates the CRM category — Salesforce, monday.com, Close, Zoho all lead with it. A migrator's brain looks for green-for-won, red-for-lost, kanban pipelines, pill badges for stages. Preserve that semantic grammar. But the visual execution needs to feel 2026, not 2015. Default cobalt-on-cool-slate is dead.

**Dense vs calm.** Sales reps look at this app eight hours a day. Tables, pipelines, and dashboards must be high-density but never noisy. Target ratio per screen: ~80% neutral surfaces and text, ~10% single accent for interactive states, ~5% semantic colors, <5% brand accent for special moments.

**Czech vs global.** The UI ships in Czech only. Data model already supports multi-currency and multi-locale. The identity should feel confident and decisive, not provincial — imagine a product that could ship in San Francisco tomorrow if translated, but would lose something if it did.

---

## 3. Visual direction — locked

### Primary palette

**Indigo-violet primary on warm-neutral zinc, dark-first.** The Linear/Attio pocket. Familiar enough that a Salesforce migrator registers "blue" at a glance, fresh enough to pass the AI-slop test.

- **Primary interactive — `#5B5BD6`** (Radix iris-9). Dark mode lightens to `#818CF8` (indigo-400). Used for buttons, links, focus rings, selected states, progress bars. **Tune deliberately a few degrees off Tailwind's default `#6366F1`** — that exact value is the AI-slop signature.
- **Neutrals — warm zinc.** Light: `#FFFFFF → #FAFAFA → #F4F4F5 → #D4D4D8 → #18181B`. Dark: `#0A0A0A → #18181B → #27272A → #3F3F46 → #FAFAFA`. Do **not** use cool slate (2019 B2B cliché). Do **not** use pure `#000` or `#FFF` as base surfaces (templated look, eye strain).
- **Semantic — CVD-aware.** Success `#16A34A` with subtle `#F0FDF4`. Warning `#F59E0B` (use amber-600 `#D97706` for warning text on white to pass WCAG). **Lost/error: `#DC2626`** — kept as a traditional pure red specifically to create clean color separation from the magenta brand accent. Do not substitute rose `#E11D48` here; the two pinks would read as the same color at a glance in the Kanban.
- **Info** — cyan `#0EA5E9`, distinct from the indigo primary so "new information" doesn't blur with "this is an action."

### Brand accent — magenta `#EC4899`

The brand's punctuation mark. **Max 1–2 instances per screen. Never a standing UI color.** Every appearance should feel earned.

**Appropriate use:**
- The "Označit jako vyhráno" button and the one-second moment immediately after clicking it
- Won-deal celebration (confetti, a one-time flash on the won card)
- Badge on the leaderboard leader
- Logo mark
- Hero accent on the landing page — a magenta underline under the single most important word, a magenta/indigo glow behind the hero visual
- Sparkline trend leader on the dashboard

**Never for:**
- Any primary button (that's indigo)
- Navigation, links, selected rows, focus rings (indigo)
- Generic success toasts (green)
- Body text, headings, or anything that appears in blocks of text

**Why magenta and not a safer pick.** Deliberate category-differentiation move. No Czech CRM looks like this. Magenta + indigo reads **confident and slightly rebellious**, which fits a product positioned as the minimal underdog against RAYNET and Pipedrive. The alternative — warm coral — would be the safer, easier-to-land choice; magenta is the choice that gets the product remembered.

### Two hazards specific to this palette — internalize these

**1. Magenta reads louder in light mode than in dark mode.** On black it feels celebratory; on white it feels urgent. The 80/10/5/<5 color ratio applies even more strictly in light mode. Three magenta elements on a white page reads "startup demo," not "sales infrastructure." In light mode, usually one magenta moment per screen is the right count.

**2. Magenta and indigo are both cool-violet-adjacent.** Placed in close proximity, the pairing tips into cyberpunk/vaporwave territory. The rule is: **indigo is the standing color, magenta is the interruption. Never together in the same grouping or on the same element.** If you find yourself placing a magenta badge inside an indigo-tinted card, stop.

### Magenta text and fills — specific rules

- **Solid fill** (win button, "Vyhráno" pill): text is `#0A0A0A` (near-black). **Not white.** White text on magenta is the universal "sign up for our newsletter" look; near-black reads deliberate and brand-aligned.
- **Subtle tint for backgrounds:** dark mode `rgba(236, 72, 153, 0.12)`, light mode `#FBEAF0` (Radix pink-50). Text on that tint: `#4B1528` (Radix pink-900).
- **Never magenta text on white.** The WCAG contrast passes but the register is wrong — it reads "notification dot" rather than "brand moment."

### Dark mode is primary, light mode is parallel (not inverted)

- Off-black page background, never pure black. Elevation via lighter surfaces (each level 4–6% lighter than the one below), **not shadows**.
- Primary color **lightens and slightly desaturates** in dark mode — don't reuse the light-mode hex.
- Magenta does not change between modes (same `#EC4899`), but the context around it does, which is why the light-mode discipline is stricter.
- Tinted alert backgrounds invert direction: light mode error-bg is `#FEF2F2`, dark mode error-bg is `#450A0A`.
- Light mode uses warm off-white `#FAFAFA`, not clinical `#FFFFFF`. Borders carry more weight in light mode; shadows carry more weight.

---

## 4. Semantic grammar — preserve this, buyers have internalized it

- **Won deal** — green check + text label "Vyhráno" as the ongoing state. The **magenta brand accent appears at the moment of transition** (the "Označit jako vyhráno" button, the one-time celebration flash), not on the settled card. Magenta is the dopamine hit; green is the record. This separation is important — it's what makes magenta feel earned each time instead of becoming visual wallpaper.
- **Lost deal** — red `#DC2626`, X icon, text label "Prohráno".
- **Color is never the sole signal.** Every state pairs color + icon + text.
- **Kanban columns** — neutral cards with a **left-seam color accent** (2–3px border-left). Do **not** tint the full card background — destroys scannability at 40+ deals visible.
- **Stage badges** — colored pill, subtle background tint (~10–15% opacity) with full-color text on top.
- **Pipeline progression defaults** — gray/cool for cold, amber for active, orange for hot, green for won, red for lost. Admin can reconfigure; these are seeds.
- **Trial badge in sidebar** — neutral text when > 7 days remain, amber ≤ 7 days, red ≤ 3 days.

---

## 5. Accessibility — non-negotiable

**~8% of men have color vision deficiency** (1 in 12, rising to 10–11% in Northern Europe). A 25-person sales team likely has 2–3 affected people, most undiagnosed. **Green-vs-red alone for won-vs-lost is the worst possible semantic pairing for the most common accessibility need in the category.**

- Every color-coded state pairs color + icon + text label. No exceptions.
- WCAG AA: 4.5:1 body text, 3:1 large text and UI chrome. Verify in both themes using Stark, Coblis, or Chrome DevTools' vision-deficiency simulator.
- Prefer the **blue-to-orange axis** over green-red for categorical charts — preserved under all three dichromacies.
- Ship a **"Barvoslepý režim"** toggle that swaps won/lost from green/red to blue/orange. Magenta's role doesn't change in that mode — it's already distinguishable from every other color in the system under all dichromacies.

---

## 6. Typography and density

- **Inter** for UI and body (weights 400/500/600, 700 for display only). **JetBrains Mono** for IČO, DIČ, and copy-able IDs — never body.
- Scale: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 / 48 / 64 px. Nothing off-scale.
- All numeric columns: `font-variant-numeric: tabular-nums` — columns align, digits don't wiggle on updates.
- Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 px.
- Radii: 6 (inputs, small badges), 10 (buttons, cards), 14 (modals), 20 (marketing hero), 9999 (pills, avatars).
- Czech copy is **vykání** throughout. Errors are human ("Tuhle firmu jsme nenašli v ARES. Zkontrolujte prosím IČO."), not system voice. Buttons are imperative verbs ("Uložit", not "Uložení").

---

## 7. Screens to design — in priority order

Design these in dark mode first (it's the default), then show the light-mode variant, then the 390px mobile variant where relevant.

**1. Pipeline / Kanban — the signature screen.**  
4–6 stage columns, cards showing deal name, company, value, owner avatar, days-in-stage. Show the screen at realistic density (8+ cards per column). Include the "Označit jako vyhráno" moment — this is the screen where the magenta accent earns its keep. Mobile: horizontally scrollable, one column visible at a time with scroll-snap.

**2. Dashboard — salesperson view.**  
4 KPI cards (pipeline value, deals this month, won this quarter, companies at risk of freeing). Recent activity feed. Mini-pipeline snapshot. "Firmy blížící se uvolnění" widget with 30/14/7-day countdowns color-coded (neutral → amber → red). Number counters animate up on first mount only. Magenta appears here only if the user is currently leading the team's leaderboard — a single magenta badge on their rank chip.

**3. Companies list — the dense table.**  
TanStack Table, max 7 visible columns. Filterable, searchable, paginated. The ownership-expiry countdown is a color-coded badge on each row. Include empty state and loading skeleton variants. Mobile: stacked card layout. **No magenta on this screen** — it's pure operational density.

**4. Add-company modal with ARES integration — the product's signature micro-interaction.**  
Draw the full state machine: empty → typing IČO → loading (with spinner inline in the IČO input) → success (fields auto-fill with a subtle stagger animation) → not-found (friendly Czech error) → network error. This interaction is where SimpleCRM earns its differentiation; it deserves design love. A subtle magenta flash on the success moment (first-time users only) would be appropriate — this is one of the product's "wow" moments.

**5. Company detail page.**  
Tabs: Přehled / Kontakty / Obchody / Aktivita / Poznámky. The ownership timeline is distinctive — show when the company was claimed, reassigned, or freed. Include the countdown-to-freeing indicator prominently. No magenta on this screen.

**6. Deal detail — modal or split-view.**  
Value (with currency), stage, probability, expected close date, primary contact, activity timeline. **The "Označit jako vyhráno" button is the biggest showcase of magenta in the entire app.** Design the transition deliberately: button press → one-time magenta flash or confetti → card settles into its green "Vyhráno" state. The magenta lives for under a second; the green persists. Get this moment right and the whole accent choice justifies itself.

**7. Trial-expired gate.**  
Not a modal — a full-screen takeover replacing the normal app route. Czech headline: "Vaše zkušební doba skončila." Subtext: "Pokračujte za 99 Kč/uživatel/měsíc. Vaše data zůstanou v bezpečí." Two CTAs: "Přejít na předplatné" (primary indigo) and "Exportovat data" (ghost). Blurred app visible behind. Must feel **fair and respectful**, not dark-pattern. No magenta here — this screen is about trust, not celebration.

**8. Landing page hero — mobile-first.**  
Headline "CRM pro prodej. Nic víc, nic míň." — the word **"prodej"** carries a magenta underline (single brand punctuation mark in the most visually weighted area of the page). Subhead "Jednoduchý český CRM pro malé týmy. Funguje s ARES. 30 dní zdarma." Primary CTA "Vyzkoušet 30 dní zdarma" → Google OAuth, in indigo. Hero visual: a mocked pipeline screenshot floating with a subtle magenta/indigo dual glow. Emphasize: "Žádná kreditní karta při registraci." Target Lighthouse mobile ≥ 90.

---

## 8. Anti-patterns — reject these actively

- **Tailwind's default `indigo-500` paired with a purple gradient on white.** The AI-slop signature. Adam Wathan publicly apologized for making this the framework default. Tune several degrees off.
- **Magenta and indigo on the same element or in close proximity.** The pairing is legitimate across a screen; it's illegal within a grouping. Cyberpunk/vaporwave drift starts here.
- **White text on magenta solid fills.** Looks like every "sign up for our newsletter" button on the internet. Near-black text reads as deliberate and brand-aligned.
- **Magenta text on white.** WCAG passes but register is wrong — reads "notification dot," not "brand moment."
- **More than one magenta element per light-mode screen.** The color reads louder on white than on black. Restraint scales with surface brightness.
- **Cool slate + cobalt blue + pure white.** The 2019 B2B SaaS cliché. Migrating buyers already associate this with Salesforce and Zoho.
- **Mesh gradients or harsh multi-stop gradients.** Stripe-2017 era. The one exception: the hero visual's subtle magenta/indigo glow on the landing page.
- **Full card tints on Kanban.** Destroys scannability at density. Left-seam only.
- **Rainbow status pills everywhere in data tables.** monday.com gets away with it because that IS their product; in a CRM chart it's noise.
- **Pure `#000` and `#FFF` as base surfaces.** Templated look, eye strain in long sessions.
- **Stock photography of smiling business people.** Zero exceptions.
- **AI-generated illustrations** with the over-polished gradient style. Monochromatic line-art (undraw.co, Blush, re-colored to tertiary text color) if illustrations are needed at all.
- **Parallax, scroll-hijacking, reveal-on-scroll everywhere** on the landing page. One subtle fade-in per section, max.
- **Bouncy spring animations.** Decisive `ease-out` only. Motion respects `prefers-reduced-motion`.

---

## 9. Deliverable format

For each screen:
- **Full composition** at desktop (1440px)
- **Dark mode primary, light mode parallel**
- **390px mobile variant** for Pipeline, Dashboard, Companies list, Landing hero
- **State variants** where relevant: default, hover, loading skeleton, empty, error
- **The magenta transition moment** designed explicitly for screens 1, 4, 6, and 8 — this is where the brand accent does its work and it needs to be shown, not described
- **Brief annotation** of any decisions that deviate from this brief, with rationale
- **Tokens used** — a short list of the semantic tokens referenced on that screen, so the tokens file writes itself from the designs

**Start with the Pipeline / Kanban screen.** It's the product's signature view and will anchor decisions for everything else. Design the "Označit jako vyhráno" moment in detail — the button press, the one-second flash, the settled green state. That single transition contains the whole design philosophy in miniature. Pause for review before scaling to the next screens.

---

## 10. The one-line anchor for every decision

> **SimpleCRM should look like Linear and Pipedrive had a Czech baby that got really into Tesla's product UI — with the confidence to put a magenta accent in a sales tool.** Confident, modern, unapologetic. If a design choice doesn't serve data legibility, interaction speed, or brand personality — at least two of those — cut it. The magenta moments are punctuation: earned, not decorative. Everything else is quiet.
