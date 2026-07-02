# Settings sub-nav redesign — design spec

**Date:** 2026-07-02
**Status:** approved by owner (option A of three proposed; audit §2 option A follow-through)
**Scope:** navigation shell + routing of `/app/settings`. Section *contents* (cards,
forms) are intentionally untouched.

## Problem

The June UX audit (`docs/qa/2026-06-15-ui-ux-audit.md` §2) called Settings out as 11
flat tabs. The stopgap shipped in `916dc0d` grouped the tabs into labeled pill rows,
but on desktop the group labels visually compete with the pills and the strip wraps
into two noisy lines; on mobile a native `<select>` hides the structure entirely.
Tab state is not URL-driven (no deep links, back button dead between tabs), and the
page is a 2,510-line monolith.

Owner's goals: **navigation & orientation** (always know where you are and what
exists) and **visual polish**, working well on both mobile and desktop.

## Decision

Stripe/GitHub-style **settings sub-navigation** (audit option A):

- **Desktop (`md+`):** a slim grouped nav column inside Settings, always visible.
- **Mobile (`<md`):** a settings *home screen* (grouped list) with drill-in section
  pages and a back link — the native phone-Settings pattern.
- Every section becomes a **route**.

Rejected alternatives: full-takeover settings shell (Linear-style; more work, loses
global nav) and hub-landing-only (macOS-style; two clicks to hop between sections).
A hub landing on top of A was offered and declined — desktop index redirects to a
default section instead.

## 1. Routing & information architecture

Route structure under the existing app shell:

```
/app/settings                → SettingsLayout (guards + sub-nav + <Outlet/>)
  index                      → mobile: SettingsHome list; desktop: replace-redirect
                               to default section
  :section                   → the section page (slug = existing tab key)
/app/settings/import         → existing ImportPage, now also a nav item
/app/nastaveni/predplatne    → replace-redirect to /app/settings/billing
```

- **Slugs** reuse the existing `SettingsTab` keys verbatim: `pipeline`, `teams`,
  `users`, `invitations`, `appearance`, `permissions`, `blocked-companies`,
  `organization`, `billing`, `integrations`, `privacy`. No new naming scheme; the
  old `?tab=` values map 1:1.
- **Default section** for the desktop index redirect: `pipeline` for admins (same
  as today), otherwise the user's first visible section (`appearance`).
- **Back-compat:** `/app/settings?tab=X&rest…` replace-redirects to
  `/app/settings/X?rest…` (query params other than `tab` are preserved). This keeps
  the Google Calendar OAuth callback
  (`/app/settings?tab=integrations&gcal=…`, see `backend/app/api/v1/google_calendar.py:65`)
  working with **zero backend change** — the one-shot gcal toast logic moves into
  the layout/Integrations section unchanged.
- **Role gating:** `visibleTabKeys(role, can_invite)` logic is unchanged. A user
  navigating (or deep-linking) to a section they may not see is replace-redirected
  to their first visible section. Unknown slugs get the same treatment.
- **Group structure** (unchanged from `916dc0d`): Osobní (Vzhled, Integrace) ·
  Organizace (Organizace, Týmy, Uživatelé, Pozvánky, Oprávnění) · Prodej & data
  (Pipeline, Blokovaná IČO, Import z CSV, Soukromí) · Předplatné (Fakturace).
  Import z CSV joins Prodej & data as a first-class item (admin-only, as today);
  the contextual "Hromadný import z CSV →" link under the page header is removed.

## 2. Desktop layout (`md+`)

Two panes inside the settings route (app sidebar and header untouched):

- **Sub-nav column:** ~220px wide, sticky under the app header, scrolls
  independently if needed. Top: "Nastavení" heading. Then the four groups — group
  label in small uppercase `text-text-tertiary`, items as rounded rows with a
  lucide icon (size 16, strokeWidth 1.75) + label. Active item:
  `bg-accent-subtle text-accent` (matches the main sidebar's active style); hover:
  `bg-surface-overlay`. Transitions use the existing `duration-fast` token.
- **Icons:** Vzhled `Palette`, Integrace `Plug`, Organizace `Building2`, Týmy
  `Users`, Uživatelé `UserRound`, Pozvánky `MailPlus`, Oprávnění `ShieldCheck`,
  Pipeline `Kanban`, Blokovaná IČO `Ban`, Soukromí `Lock`, Fakturace `CreditCard`,
  Import z CSV `Upload`.
- **Content pane:** the existing section cards, unchanged, wrapped in `max-w-3xl`
  for readability. Each section page renders its own header: `h1` = section label,
  description line below (both from existing `TABS` meta). The old page-level
  "Nastavení — X" `h1` is gone; `document.title` remains "Nastavení — X".
- The grouped pill strip and the mobile `<select>` are deleted.

## 3. Mobile (`<md`)

- **`/app/settings` home:** full-width grouped list. Each row: the section icon in
  a small soft-rounded tile, section name, its one-line description underneath,
  chevron on the right. Group labels above each cluster. Tap → section route.
- **Section page:** a "← Nastavení" back link (Link to `/app/settings`) above the
  section title + description, content below. Browser back does the same thing.
- Bottom tab bar and app header are untouched.

## 4. Code restructuring (mechanical moves, no behavior change)

`frontend/src/app/settings/`:

- `settingsNav.ts` — section meta: key/slug, label, description, group, `personal`
  flag, icon. (Today's `TABS` array + icons; single source of truth.)
- `SettingsLayout.tsx` — route guards (`?tab=` redirect, role gating, unknown
  slug), desktop sub-nav, mobile back-link chrome, `<Outlet/>`, gcal one-shot
  toast handling.
- `SettingsHome.tsx` — mobile home list (+ desktop index redirect).
- `sections/` — extracted **as-is** from the monolith: `PipelineSection.tsx`
  (StageForm/StageRow included), `AppearanceSection.tsx`, `PermissionsSection.tsx`
  (with LeaderboardVisibilityToggle, OwnershipWindowSetting),
  `OrganizationSection.tsx` (SeatCountCard, BillingIntervalCard, InvoiceDetailsCard),
  `BillingSection.tsx` (plan cards, ChoosePlanModal, invoices, payments, cancel),
  `IntegrationsSection.tsx` (SmtpSettingsCard + GoogleCalendarCard + the static
  integrations list, as currently composed).
- Already-standalone sections (`TeamsSection`, `UsersSection`, `InvitationsSection`,
  `PrivacySection`, `BlockedCompaniesSection`) stay where they are.
- `SettingsPage.tsx` is deleted; `App.tsx` routes are updated per §1.

## 5. Error handling & testing

- Unknown slug / forbidden section / bare `?tab=` garbage → replace-redirect to the
  user's default section; no error screens for navigation.
- Per-section loading and error states are unchanged (they live in the sections).
- **Tests:**
  - `ownershipWindow.test.tsx` clicks `role="tab"` — update to click the nav link
    (`role="link"`, name `Oprávnění`).
  - `billingSettings.test.tsx` mounts `/app/nastaveni/predplatne` — passes via the
    redirect; assert it lands on billing.
  - New routing test: `?tab=integrations&gcal=connected` redirects to
    `/app/settings/integrations` preserving `gcal`, and a non-admin requesting an
    admin section is redirected to `appearance`.
  - `smtpSettings.test.tsx` mounts the card directly — unaffected.
- **Verification:** Playwright screenshots at 1440×900 and 390×844 (home + a
  section + back navigation), console clean; then the local CI mirror (eslint,
  prettier check, tsc, `pnpm test`, `pnpm build`) before the closing commit.

## Out of scope

- Section content redesign (forms, cards, density).
- Settings search / command palette (possible later layer on top of routes).
- Live status hints in nav rows (e.g. "SMTP: nenastaveno") — enabled by this
  structure, not built now.
- Backend changes of any kind.
