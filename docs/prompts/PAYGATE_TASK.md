# SimpleCRM — Pay Gate, Pricing & Subscription Management

You are a Claude Code session running on the host (no Docker container) with `--dangerously-skip-permissions`. This document is **self-bootstrapping**: §0 sets up an auto-loop wrapper that survives your session ending, then you proceed with the build. The operator is remote-controlling you and will not be at the terminal — everything happens autonomously after they paste this prompt.

Read `MANAGER_TASK.md`, `WORK_LOG.md`, and `.claude/skills/ui-design.md` before starting on §1 onwards. Follow the existing single-session protocol: plan → build → verify → commit → log, with `RESUME.md` written if you sense the session ending.

-----

## 0. Bootstrap — DO THIS FIRST, before §1

The build will likely span multiple 5-hour Claude sessions. An auto-loop wrapper relaunches you every 5 hours while `RESUME.md` is present, and exits when it isn’t.

### 0.1 Idempotency check

If you are running in a continuation session, the loop is already active. Check:

```bash
if [ -f .claude-loop.pid ] && kill -0 "$(cat .claude-loop.pid)" 2>/dev/null; then
  echo "Auto-loop already running (PID $(cat .claude-loop.pid)). Skipping bootstrap."
fi
```

If the loop is already running, **skip §0.2 and §0.3** and go directly to §1. Do not try to start a second loop instance.

If no loop is running (this is the first session), continue with §0.2.

### 0.2 Create the loop script

Use your file-writing tool to create `scripts/claude-loop.sh` with the **exact content from Appendix A** at the bottom of this document. Then:

```bash
chmod +x scripts/claude-loop.sh
mkdir -p logs
```

Verify:

```bash
test -x scripts/claude-loop.sh && head -3 scripts/claude-loop.sh
```

Commit it as a separate, isolated commit before any other work:

```
chore(scripts): add claude-loop.sh auto-restart wrapper
```

### 0.3 Start the loop detached

Critical: use `nohup` + `disown` so the loop survives this session ending. Use `< /dev/null` so it doesn’t try to read from your stdin.

```bash
nohup ./scripts/claude-loop.sh PAYGATE_TASK.md > logs/loop.out 2>&1 < /dev/null &
disown
sleep 3
```

Verify the loop is alive:

```bash
test -f .claude-loop.pid && kill -0 "$(cat .claude-loop.pid)" 2>/dev/null \
  && echo "Loop running (PID $(cat .claude-loop.pid))" \
  || echo "ERROR: loop did not start — inspect logs/loop.out"
```

If the verification fails, print the contents of `logs/loop.out` and `logs/claude-loop-*.log`, halt, and write a clear error message. Do not proceed with §1 — the operator is not present to debug.

### 0.4 Print operator confirmation

Once the loop is verified alive, print the following block to your output exactly so the operator (when they next look) can see the state:

```
================================================================
Auto-loop active. Operator may walk away.

  PID:        <fill in from .claude-loop.pid>
  Sleeps:     5h between sessions
  Relaunches: while RESUME.md is present
  Exits:      when RESUME.md is absent (= work complete)
  Logs:       logs/claude-loop-*.log
  Stop with:  kill <PID>
================================================================
```

Then proceed to §1.

-----

## 1. Goal

Wire up the full subscription lifecycle: trial → upgrade choice (monthly / annual / enterprise) → active paid subscription → renewal. Support three special org categories: **standard paying customers**, **enterprise customers with negotiated custom pricing**, and **complementary (comp) organizations that use SimpleCRM for free in exchange for exposure**. All prices are quoted **without DPH** in headlines, with the DPH-inclusive final price shown subtly underneath.

**Important scope note:** Real payment collection (Stripe / ComGate) is **out of scope for this task** per `MANAGER_TASK.md` Section 2. After a customer chooses a plan on the pay gate, the system records a `pending_activation` subscription and emails the founder; the founder manually marks the subscription `active` via the super-admin UI once payment arrives by bank transfer. The whole stack must be designed so that swapping in Stripe later is a localised change in the `BillingService` — no rewriting models or UI.

-----

## 2. Pricing model — single source of truth

All values stored in CZK **minor units (haléře, integer)** in the `Plan` table. Currency code: `CZK`. DPH rate: 21 % (stored in app settings, not hardcoded — when the SimpleCRM org becomes a DPH plátce, flipping a flag changes display behaviour, not data).

|Plan code   |Display name (CS)|Billing interval           |Price/user (without DPH)           |Public on pricing page?     |Notes                                                       |
|------------|-----------------|---------------------------|-----------------------------------|----------------------------|------------------------------------------------------------|
|`trial`     |Zkušební verze   |30 days, no billing        |0 Kč                               |No (auto-assigned on signup)|trial_ends_at = created_at + 30 days                        |
|`monthly`   |Měsíční          |monthly                    |**99 Kč / uživatel / měsíc**       |Yes                         |Standard public plan                                        |
|`annual`    |Roční            |annual (12 months upfront) |**999 Kč / uživatel / rok**        |Yes                         |Saves 189 Kč/user/year vs monthly (~16 %, “2 měsíce zdarma”)|
|`enterprise`|Enterprise       |custom                     |**null** (override on subscription)|No                          |Per-org negotiated price                                    |
|`comp`      |Komplementární   |indefinite or until ends_at|0 Kč                               |No                          |Bartered for exposure                                       |

**Annual savings math (use everywhere consistently):**

- Monthly cost over 12 months = 12 × 99 = **1 188 Kč / user / year**
- Annual cost = **999 Kč / user / year**
- Savings = **189 Kč / user / year** (≈ 16 %, ≈ “2 měsíce zdarma”)
- Display dynamically scaled by user count: “S 8 uživateli ušetříte **1 512 Kč ročně**”

-----

## 3. DPH display rules

The SimpleCRM organization (the seller) currently is **not** a DPH plátce, but the system must be DPH-aware from day one. Add `is_vat_payer: bool` to a `BillingSettings` singleton (must be runtime-toggleable without code change).

**When `is_vat_payer = false` (current state):**

- Headline: `99 Kč / uživatel / měsíc`
- Subtle line below in `text-tertiary`, font-size 12: `Nejsem plátce DPH`
- Final/displayed price = base price (no DPH added)

**When `is_vat_payer = true` (future state, after crossing 2 M Kč obrat):**

- Headline: `99 Kč / uživatel / měsíc bez DPH`
- Subtle line in `text-tertiary`, font-size 12: `(119,79 Kč s DPH)`
- Computation: `with_dph = round(base × 1.21, 2)` — formatted via `Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' })`

**Build a single utility component** `<PriceDisplay base={9900} interval="monthly" />` (price in minor units) used everywhere prices appear (pricing page, pay gate, billing settings, invoices preview, admin UI). This component reads the current `is_vat_payer` flag and renders both lines correctly.

-----

## 4. Data model changes

### 4.1 Extend `Plan` (Phase 1.1 already created the table; alter it)

```python
class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_name_cs: Mapped[str] = mapped_column(String(120))
    description_cs: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_interval: Mapped[str] = mapped_column(String(16))  # 'trial' | 'monthly' | 'annual' | 'custom' | 'free'
    price_per_user_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)  # in haléře; null for 'enterprise'
    currency: Mapped[str] = mapped_column(String(3), default="CZK")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    trial_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at, updated_at: standard timestamps
```

**Seed via migration** (idempotent — `ON CONFLICT (code) DO UPDATE`):

|code        |display_name_cs        |billing_interval|price_per_user_minor|is_public|sort_order|
|------------|-----------------------|----------------|--------------------|---------|----------|
|`trial`     |Zkušební verze (30 dní)|trial           |0                   |false    |0         |
|`monthly`   |Měsíční                |monthly         |9900                |true     |1         |
|`annual`    |Roční                  |annual          |99900               |true     |2         |
|`enterprise`|Enterprise             |custom          |null                |false    |3         |
|`comp`      |Komplementární         |free            |0                   |false    |4         |

### 4.2 New `Subscription` model

```python
class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), unique=True, index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"))
    status: Mapped[str] = mapped_column(String(32), index=True)
    # status values:
    #   'trialing'           — in 30-day trial
    #   'pending_activation' — chose plan, awaiting payment confirmation
    #   'active'             — paid subscription (or comp/enterprise active)
    #   'past_due'           — invoice unpaid past grace period
    #   'canceled'           — terminated
    started_at: Mapped[datetime]
    current_period_starts_at: Mapped[datetime | None]
    current_period_ends_at: Mapped[datetime | None]  # for trial = trial_ends_at; for paid = renewal date
    canceled_at: Mapped[datetime | None] = mapped_column(nullable=True)
    # Enterprise / comp overrides:
    override_price_per_user_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_comp: Mapped[bool] = mapped_column(Boolean, default=False)  # true → never gate this org
    comp_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at, updated_at: standard timestamps
```

Index on `(organization_id, status)` and `(current_period_ends_at)`.

### 4.3 `Organization` extension

`trial_ends_at` already exists. Add nothing new — the Subscription holds plan/status. Onboarding flow (Phase 1.5) must now also create a `Subscription` row with `plan='trial'`, `status='trialing'`, `current_period_ends_at = trial_ends_at`.

### 4.4 `BillingSettings` (singleton)

```python
class BillingSettings(Base):
    __tablename__ = "billing_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    is_vat_payer: Mapped[bool] = mapped_column(Boolean, default=False)
    vat_rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("21.00"))
    seller_iban: Mapped[str | None] = mapped_column(String(34), nullable=True)
    seller_ico: Mapped[str | None] = mapped_column(String(8), nullable=True)
    contact_email: Mapped[str] = mapped_column(String(120), default="podpora@simplecrm.cz")
    updated_at: standard timestamp
```

Seed one row on first migration. Editable only via super-admin UI.

### 4.5 `User` extension

Add `is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")`. Set to `true` only for the founder’s user account, manually via SQL after first deploy. Distinct from the org-level `role='admin'` — super-admin operates across all organizations.

-----

## 5. Backend tasks

### B1. Migrations & seed

- One Alembic migration: extend `plans`, create `subscriptions`, create `billing_settings`, add `users.is_super_admin`.
- Seed default plans + one billing_settings row.
- Update onboarding (Phase 1.5): on org creation, create a `Subscription(plan='trial', status='trialing', current_period_ends_at=trial_ends_at)`.
- Backfill: existing orgs without a Subscription get one created in the migration. Migration must be idempotent.
- Tests: migration up/down clean, seed values present, backfill correct.
- **Commit:** `feat(billing): add Plan/Subscription/BillingSettings models and seed`

### B2. `BillingService` (business logic)

Create `app/services/billing.py` with:

- `get_current_subscription(org_id) -> Subscription`
- `get_effective_price_per_user_minor(sub) -> int | None` — override if set, else plan’s price; `None` for enterprise without override
- `compute_savings(user_count) -> dict` — `{monthly_total_minor, annual_total_minor, savings_minor, savings_percent}`
- `compute_with_vat(base_minor) -> dict` — `{base_minor, with_vat_minor, vat_amount_minor}`; respects `is_vat_payer`
- `choose_plan(org_id, plan_code, requested_by_user_id) -> Subscription` — sets `pending_activation`; emits internal email to founder via SES (or logs to console if SES not configured); idempotent
- `activate_subscription(org_id, plan_id, override_price=None, period_months=None, by_admin_id) -> Subscription` — super-admin only
- `set_comp(org_id, reason, ends_at=None, by_admin_id) -> Subscription`
- `set_enterprise(org_id, override_price_per_user_minor, period_months, notes, by_admin_id) -> Subscription`
- `cancel(org_id, by_admin_id, effective_at=None) -> Subscription`
- `extend_trial(org_id, days, by_admin_id) -> Subscription`
- `is_app_access_allowed(sub, now=None) -> bool` — true if `is_comp` OR `status in ('trialing','active') and current_period_ends_at >= now` OR `status='past_due'` within 7-day grace; false otherwise

Every state transition writes an `Activity` record (entity_type=‘organization’).

Tests: happy-path per method, plus permission and validation cases. Mock email sending.

**Commit:** `feat(billing): add BillingService with subscription lifecycle`

### B3. API endpoints

All under `/api/v1`. JWT-protected unless noted.

**Public:**

- `GET /plans/public` — plans where `is_public=true`, ordered by `sort_order`. No auth. Includes computed `monthly_equivalent_minor` for annual and `savings_minor` per user vs monthly.

**Authenticated (any org member):**

- `GET /organizations/current/subscription` — full Subscription + Plan + computed effective price + access status (trialing | active | grace | gated | comp).
- `GET /organizations/current/billing-summary` — extends Phase 7.5 endpoint: trial status, user count, monthly total, annual total, savings if switched. Both `_minor` and `_with_vat_minor`.

**Authenticated (admin role within org):**

- `POST /organizations/current/subscription/choose-plan` — body `{plan_code: 'monthly'|'annual'}`. Sets `pending_activation`, emails founder. **Does NOT mark active.**
- `POST /organizations/current/subscription/contact-enterprise` — body `{message, expected_users}`. Emails founder.

**Super-admin only** (`require_super_admin` checks `User.is_super_admin`):

- `GET /admin/organizations` — paginated list with subscription + user counts + last activity.
- `GET /admin/organizations/:id` — full detail.
- `POST /admin/organizations/:id/subscription/activate` — body `{plan_code, override_price_per_user_minor?, period_months}`.
- `POST /admin/organizations/:id/subscription/set-comp` — body `{reason, ends_at?}`.
- `POST /admin/organizations/:id/subscription/set-enterprise` — body `{override_price_per_user_minor, period_months, notes?}`.
- `POST /admin/organizations/:id/subscription/extend-trial` — body `{days}`.
- `POST /admin/organizations/:id/subscription/cancel` — body `{effective_at?}`.
- `GET /admin/billing-settings` and `PUT /admin/billing-settings` — toggle `is_vat_payer`, edit IBAN/IČO.

Tests per endpoint: happy / validation-422 / permission-403 / cross-org-403. New files: `backend/tests/api/v1/test_subscriptions.py`, `test_admin_billing.py`. Service test: `test_billing.py`.

**Commit:** `feat(billing): add subscription and admin billing endpoints`

### B4. Pay-gate dependency

Update `require_active_trial_or_subscription` (Phase 1.3) to use `BillingService.is_app_access_allowed()`. Returns 402 Payment Required with body: `{code: 'subscription_required', current_status, can_choose_plan: true, ends_at}`. Frontend uses this to render the gate.

`/api/v1/auth/me` and read-only “self” endpoints continue working when gated — only mutating CRM endpoints are blocked. Public endpoints (plans, billing-summary) remain open.

**Commit:** `feat(billing): wire pay-gate into auth dependencies`

-----

## 6. Frontend tasks

**Re-read `.claude/skills/ui-design.md` before any UI work.** Magenta highlight rule: **at most one magenta element per pricing screen** (typically the “Doporučujeme” badge on the annual card, light mode only).

### F1. `<PriceDisplay>` shared component

`frontend/src/components/billing/PriceDisplay.tsx`. Props: `{ baseMinor: number; interval: 'monthly' | 'annual' | 'custom'; size?: 'sm' | 'md' | 'lg' | 'xl' }`. Reads `useBillingSettings()` hook (TanStack Query → `GET /admin/billing-settings`, cached 5 min; falls back to `is_vat_payer=false` if unauthenticated).

Renders:

- Large headline: formatted base price + suffix (`/uživatel/měsíc` or `/uživatel/rok`)
- Small line under: either `Nejsem plátce DPH` or `({with_vat} s DPH)`
- All formatting via `Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 })`; `2` for the with-DPH variant
- `tabular-nums` always

Component is the **only** place price formatting logic lives. Used in F2–F6.

### F2. Pricing page (public, `/cenik` route)

Three cards (stack on mobile). Czech, vykání throughout.

**Card 1 — Měsíční:** title `Měsíční`; `<PriceDisplay baseMinor={9900} interval="monthly" size="xl" />`; bullets “Bez závazků”, “Zrušení kdykoliv”, “Plná funkcionalita”; CTA `Vyzkoušet 30 dní zdarma`.

**Card 2 — Roční (highlighted):** magenta badge top-right `Doporučujeme · Ušetříte 16 %` (the **one** magenta element, light mode only); title `Roční`; `<PriceDisplay baseMinor={99900} interval="annual" size="xl" />`; below price in `text-success`: `Ušetříte 189 Kč na uživatele · 2 měsíce zdarma`; bullets “Vše z měsíčního plánu”, “Účtováno jednou ročně”, “Bez závazků po skončení období”; CTA `Vyzkoušet 30 dní zdarma`.

**Card 3 — Enterprise:** title `Enterprise`; instead of price `Vlastní balíček` size-xl; bullets “25+ uživatelů”, “Vlastní cena a podmínky”, “Dedikovaná podpora”, “Jednání o SLA”; CTA `Domluvte se s námi` → contact modal (name, email, expected user count, message; submits to `POST /api/v1/contact/enterprise`).

**Below cards, smaller helper section:**

- “Všechny ceny jsou bez DPH.” (when `is_vat_payer=false`) or “Ceny bez DPH; konečné ceny zobrazujeme s 21% DPH.” (when true)
- “Zkušební doba je 30 dní. Žádná kreditní karta při registraci.”

Mobile: cards stack vertically, annual stays second.

**Commit:** `feat(landing): pricing page with monthly/annual/enterprise tiers`

### F3. Trial countdown UI updates

- More than 7 days left: tertiary text `Zkušební verze · {days} dní zbývá`
- ≤ 7 days: warning + small CTA `Vybrat plán →` → `/app/nastaveni/predplatne`
- ≤ 3 days: danger color, same CTA bolder

**Commit:** `feat(billing): trial countdown with upgrade CTA`

### F4. Trial-expired pay gate (full-screen takeover)

Triggered when API returns 402 `subscription_required`.

Layout:

- Centered card on blurred app background (`backdrop-filter: blur(8px)` — one-screen exception to the no-glassmorphism rule)
- Headline: `Vaše zkušební doba skončila.`
- Subtext: `Pokračujte výběrem plánu. Vaše data zůstávají v bezpečí.`
- Two-card mini pricing (monthly + annual; mobile stacks). Annual carries magenta `Ušetříte 16 %` badge. Each shows dynamic `S Vašimi {userCount} uživateli ušetříte {userCount × 18900 minor → formatted}` on annual card.
- Below: link `Potřebujete víc? Domluvte se na enterprise balíčku.` → contact modal
- Footer: `Vybrat plán` (primary indigo, disabled until card selected) and `Exportovat data` (ghost)
- Tertiary: `Máte otázky? Napište nám na podpora@simplecrm.cz`

On `Vybrat plán` click after selecting:

- POST `/organizations/current/subscription/choose-plan`
- 200 → confirmation card: `Děkujeme. Pošleme vám platební instrukce.` / `Na e-mail {billingEmail} jsme odeslali fakturu a platební údaje. Po připsání platby vás aktivujeme do 24 hodin. Mezitím můžete data exportovat.` / one CTA `Exportovat data` (ghost)
- Org stays gated until founder activates via super-admin UI

For `is_comp=true` orgs the gate is **never** shown.

For enterprise orgs whose `current_period_ends_at` has passed, the gate’s CTA changes to `Kontaktovat obchod` only (no monthly/annual cards).

**Commit:** `feat(billing): trial-expired pay gate with monthly/annual choice`

### F5. In-app billing settings page (`/app/nastaveni/predplatne`)

Tab in Settings layout (Phase 10.2). Org admins only.

**Aktuální plán** card: plan name + status pill (`Zkušební verze` / `Aktivní` / `Čeká na platbu` / `Komplementární` / `Po splatnosti` / `Zrušeno`). For comp orgs: extra line `Vaše organizace má speciální podmínky. Pro detaily kontaktujte podporu.` + hide actions. For enterprise: `Vlastní balíček · {effective_price} / uživatel / {interval}` + hide change actions, show contact CTA. For trial/active/past_due standard: `Změnit plán` button → modal with monthly/annual mini cards.

**Účtování** card (only non-comp/non-enterprise active subs): users × effective price = total per period. If monthly: projection `Pokud byste platili ročně, ušetříte {dynamic_savings} ročně. [Přejít na roční]`. If annual: `Šetříte {savings} oproti měsíčnímu plánu.` Next renewal date via `Intl.DateTimeFormat('cs-CZ')`.

**Faktury** card: placeholder `Faktury budou dostupné po první platbě.` (real list when invoicing module ships).

All prices via `<PriceDisplay>`. No hardcoded `Kč`.

**Commit:** `feat(billing): in-app subscription settings page`

### F6. Super-admin UI (`/admin` route, gated by `User.is_super_admin`)

Hidden from regular users, no main-sidebar link. Accessible by typing `/admin` or via small gear icon in user menu (super-admins only).

**Layout:** two-pane — left search + table of orgs (TanStack Table, columns: Název, Plán, Stav, Uživatelé, Trial/Period končí, Poslední aktivita). Right detail drawer when row clicked.

**Detail drawer:** org info (name, IČO, created_at, admin user(s), user count), current subscription card with all dates, action buttons (each opens modal):

- `Aktivovat předplatné` — choose plan (monthly/annual/enterprise), optional override price, period_months
- `Nastavit jako komplementární` — required reason text; optional ends_at
- `Nastavit Enterprise cenu` — required override price (Kč without DPH → minor units on submit), period_months, notes; live preview `Měsíční účet: {users × override} Kč / měsíc bez DPH`
- `Prodloužit zkušební dobu` — number of days; preview new ends_at
- `Zrušit předplatné` — confirm by typing org name; optional effective_at

History list: read-only timeline of subscription Activity records.

**Billing settings tab:** toggle `Jsem plátce DPH` (with tooltip about effects), editable IBAN, IČO, podpora email.

All Czech vykání. All actions write Activity records. Every endpoint requires `is_super_admin`.

**Commit:** `feat(admin): super-admin org and subscription management`

-----

## 7. Special-case handling — explicit checklist

Verify end-to-end before finishing:

- [ ] **Standard signup** → trial subscription → after 30 days, gate shows → admin chooses annual → `pending_activation` → founder activates manually → access restored, period_ends_at = now + 12 months.
- [ ] **Comp org** → gate **never** appears; sidebar shows `Komplementární`; in-app billing page hides actions.
- [ ] **Enterprise org** → effective price is the override; pricing math throughout uses override; gate doesn’t fire until current_period_ends_at.
- [ ] **Trial extension** → trial_ends_at + Subscription.current_period_ends_at both updated; Activity row recorded.
- [ ] **DPH toggle** → all `<PriceDisplay>` instances re-render; pricing page footer copy switches.
- [ ] **Annual savings dynamic display** — N=1, 8, 25 all read correctly: `N × 189 Kč ročně`.

-----

## 8. Acceptance criteria

1. Migration runs cleanly forward + backward; existing orgs get backfilled trial Subscription matching `trial_ends_at`.
1. All five plans seeded with correct codes, prices, `is_public` flags.
1. `GET /plans/public` returns exactly two plans (monthly + annual) for unauthenticated request.
1. `GET /organizations/current/billing-summary` returns both `_minor` and `_with_vat_minor`; `_with_vat_minor` equals `_minor` when `is_vat_payer=false`.
1. Pay-gate fires precisely when `is_app_access_allowed` returns false; never fires for `is_comp=true` orgs.
1. `<PriceDisplay>` is the only place that imports/calls `Intl.NumberFormat` for currency. Grep verifies.
1. Pricing page renders correctly at 390 / 768 / 1280 px in both themes; magenta `Doporučujeme` badge appears at most once per screen, light mode only.
1. Super-admin UI inaccessible to non-super-admin users (403 every endpoint, route guard frontend).
1. Every state transition writes an Activity record with actor user_id.
1. Czech copy uses vykání throughout; no English in user-facing UI; no hardcoded `Kč` outside `<PriceDisplay>`.
1. `pnpm test`, `pytest`, `pnpm lint`, `mypy`, `tsc --noEmit` all green.
1. New endpoints have corresponding test files with 3+ tests per endpoint.

-----

## 9. Out of scope

- Real Stripe / ComGate / GoPay integration. `BillingService.choose_plan` only marks `pending_activation` and emails internally.
- PDF invoice generation (separate task).
- Customer-facing payment portal, dunning, retry logic.
- Discount codes / coupons.
- Multi-currency (everything CZK).
- Self-service plan changes that require pro-rating.
- Annual-to-monthly mid-period switches.
- Enterprise contract document generation.
- Email template polishing — placeholder body with org name + plan + amounts is fine.

-----

## 10. Commit plan (sequential)

1. `chore(scripts): add claude-loop.sh auto-restart wrapper` ← from §0
1. `feat(billing): add Plan/Subscription/BillingSettings models and seed`
1. `feat(billing): add BillingService with subscription lifecycle`
1. `feat(billing): add subscription and admin billing endpoints`
1. `feat(billing): wire pay-gate into auth dependencies`
1. `feat(landing): pricing page with monthly/annual/enterprise tiers`
1. `feat(billing): PriceDisplay component and trial countdown updates`
1. `feat(billing): trial-expired pay gate with monthly/annual choice`
1. `feat(billing): in-app subscription settings page`
1. `feat(admin): super-admin org and subscription management`
1. `test(billing): integration tests across pay-gate scenarios`
1. `chore(billing): update WORK_LOG.md and README billing section`

-----

## 11. Session-resilience reminders

- Update `WORK_LOG.md` after every commit and every meaningful intermediate step.
- If you sense the session ending mid-task, write `RESUME.md` with: last completed commit, current task, exact next step, files modified, working state. Commit WIP if it compiles.
- On resume: read `WORK_LOG.md` + `RESUME.md`, run the test suite, delete `RESUME.md`, continue.
- **When ALL work in this prompt is fully complete** — every commit in §10 made, every acceptance criterion in §8 met, all tests green — do NOT write a new `RESUME.md`, and ensure none exists in the repo. The **absence** of `RESUME.md` is the signal to the auto-loop wrapper that no further sessions are needed. While any task remains, `RESUME.md` MUST be present at session exit. Hard rule: at session end, work remains → write `RESUME.md`; work complete → ensure `RESUME.md` does not exist.
- Never go more than 30 minutes between commits.

Begin by completing §0, then read `MANAGER_TASK.md`, `WORK_LOG.md`, `.claude/skills/ui-design.md`, and the existing migration / model files. Write a brief task spec for B1 in `.claude/tasks/PAYGATE-B1.md`, then start implementation.

-----

## Appendix A — `scripts/claude-loop.sh` source

Write the following content **verbatim** to `scripts/claude-loop.sh`. Do not modify.

```bash
#!/usr/bin/env bash
# scripts/claude-loop.sh — autonomous Claude Code session loop
#
# Sleeps 5 hours, then on each iteration:
#   - waits for any running Claude session to exit
#   - if RESUME.md exists → launches a new Claude session that continues
#     from RESUME.md per the prompt's session-resilience protocol
#   - if RESUME.md absent → exits cleanly (work is done)
#
# Started by the first Claude session via:
#   nohup ./scripts/claude-loop.sh PAYGATE_TASK.md > logs/loop.out 2>&1 < /dev/null & disown
#
# Stop manually with: kill $(cat .claude-loop.pid)

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROMPT_FILE="${1:-PAYGATE_TASK.md}"
SLEEP_SECONDS=$((5 * 60 * 60))   # 5 hours
MAX_ITERATIONS=24                 # ~5 days of 5h sessions
PID_FILE=".claude-loop.pid"

mkdir -p logs
LOG_FILE="logs/claude-loop-$(date +%Y%m%d-%H%M%S).log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Refuse to start a second loop instance.
if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || echo "")"
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    log "ERROR: another claude-loop is already running (PID $EXISTING_PID). Exiting."
    exit 1
  fi
fi
echo "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

if [ ! -f "$PROMPT_FILE" ]; then
  log "ERROR: prompt file not found: $PROMPT_FILE"
  exit 1
fi

wait_for_no_claude() {
  local waited=0
  while pgrep -x claude >/dev/null 2>&1; do
    if [ $((waited % 600)) -eq 0 ]; then
      log "Claude is still running — waiting for it to exit..."
    fi
    sleep 30
    waited=$((waited + 30))
  done
}

wake_time() {
  if date -d "+5 hours" '+%Y-%m-%d %H:%M:%S' >/dev/null 2>&1; then
    date -d "+5 hours" '+%Y-%m-%d %H:%M:%S'
  else
    date -v +5H '+%Y-%m-%d %H:%M:%S'
  fi
}

log "claude-loop started (PID $$)"
log "  Repo:    $REPO_ROOT"
log "  Prompt:  $PROMPT_FILE"
log "  Sleep:   5h between sessions"
log "  Logs:    $LOG_FILE"

ITERATION=0
while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))

  log ""
  log "============================================================"
  log "Iteration $ITERATION — sleeping 5h until $(wake_time)"
  log "============================================================"
  sleep $SLEEP_SECONDS

  wait_for_no_claude

  if [ ! -f "RESUME.md" ]; then
    log "No RESUME.md present → work is complete. Exiting cleanly."
    exit 0
  fi

  log "RESUME.md present → launching new Claude session"
  CONTINUATION_PROMPT="RESUME.md is present. Read WORK_LOG.md and RESUME.md in full, then continue executing $PROMPT_FILE from the exact next step. Delete RESUME.md once you have absorbed it. The auto-loop is already running (PID $$) — do NOT re-bootstrap it. When ALL work in $PROMPT_FILE is complete (every commit in the commit plan made, all acceptance criteria met, all tests green), do NOT write a new RESUME.md — its absence signals that no further sessions are needed."

  claude --dangerously-skip-permissions "$CONTINUATION_PROMPT" 2>&1 | tee -a "$LOG_FILE" || true

  log "Claude session ended"
done

log "WARNING: hit max iterations ($MAX_ITERATIONS). Stopping for safety."
log "  Inspect WORK_LOG.md and RESUME.md, then re-launch manually if needed."
exit 1
```
