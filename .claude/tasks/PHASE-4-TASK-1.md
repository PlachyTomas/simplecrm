# Task 4.1 — Responsive app shell

## Goal
Upgrade the minimal authed shell from Task 1.4 into the real thing: left
sidebar on desktop, bottom tab bar on mobile (≤ `md`), top bar with org
info + user menu, `<Outlet/>` main area. Stub routes for Kontakty / Pipeline
/ Reports so nav works even before those pages exist.

## Design rules (from ui-design.md §6.1)
- Max content width 1440 px.
- Sidebar 240 px expanded; 64 px icon-only collapse for future use.
- Top bar 64 px, sticky.
- Main content padding `space-8` desktop, `space-4` mobile.
- Active link: `bg-accent-subtle text-accent` pill (already used).
- Mobile bottom tab bar (5 destinations): Přehled, Pipeline, Firmy,
  Kontakty, Více.
- All interactive elements have visible focus-visible rings (already
  globally applied via `tokens.css`).

## Routes
- `/app` — Přehled (AppHome).
- `/app/companies`, `/app/companies/:id` — existing.
- `/app/pipeline` — stub ("Brzy hotové" empty state).
- `/app/contacts` — stub ("Brzy hotové" empty state).
- `/app/more` — a simple list page with links: Nastavení, Obchody, Reporty,
  Odhlásit se. Used as the target of the "Více" mobile tab.

## Files in scope
- `frontend/src/app/AppShell.tsx` — rewrite.
- `frontend/src/app/Sidebar.tsx` — desktop-only sidebar component.
- `frontend/src/app/MobileTabBar.tsx` — bottom tabs.
- `frontend/src/app/ComingSoonPage.tsx` — shared placeholder for not-yet
  built routes (pipeline, contacts index, reports, deals-list).
- `frontend/src/app/MorePage.tsx` — Více menu (mobile surface for hidden
  destinations).
- `frontend/src/App.tsx` — wire up new routes.
- `frontend/src/__tests__/App.test.tsx` — tests still render at `/app`;
  minor adjustments so they find the existing "Vítejte zpět" via AppHome.
- `frontend/src/__tests__/shell.test.tsx` — new file: desktop nav items
  visible, mobile tab bar visible, stub pages render.

## Acceptance criteria
1. At desktop viewport, the top-bar nav is replaced by a left sidebar with
   the 4 primary links (Přehled, Pipeline, Firmy, Kontakty) + a secondary
   group (Nastavení, Odhlásit se).
2. At mobile (simulated via JSDOM viewport; real test runs Playwright later)
   the bottom tab bar renders with 5 destinations.
3. Clicking a tab navigates and shows active state on the corresponding
   link.
4. `/app/pipeline`, `/app/contacts`, `/app/more/*` render without crashing.
5. Onboarding modal still renders for admins without an ICO.
6. All existing tests still pass; ≥ 3 new tests for the shell.
7. `pnpm lint / typecheck / test / format:check / build` all green.
8. Backend suite unchanged.
9. One commit: `feat(frontend): responsive app shell — Task 4.1`.

## Non-goals
- Real Pipeline / Contacts / Deals / Reports / Settings pages (later tasks).
- Collapsed sidebar (icon-only) toggle — ship expanded-only first.
- Command palette (Task 4.5).
