# Task 1.4 — Frontend auth context + login + trial gate

## Goal
Wire the React app to the backend's auth endpoints. A visitor lands on a
Czech login page; "Přihlásit se přes Google" takes them through the OAuth
flow; they come back to `/app` with a token in the URL fragment; the app
persists the token in memory, calls `/auth/me`, and renders a minimal authed
shell. Protected routes redirect to `/login` for anonymous visitors; a 402
(trial expired) renders the gate component from ui-design.md §5.11.

## Design notes
- **Access token lives in memory only** (React state in `AuthContext`), per
  the brief. Never localStorage. Page refresh triggers a silent refresh via
  the refresh cookie — but wiring the refresh endpoint is out of scope for
  this task (tracked for a later phase). For now, a page refresh on `/app`
  without a fragment bounces to `/login` — acceptable for MVP pre-refresh.
- **Router**: React Router v6 with data APIs not strictly needed yet; the
  standard JSX routes are enough. `/` and `/cenik` / `/faq` are reserved for
  Phase 11's landing page; this task ships a placeholder at `/`.
- **TanStack Query** provides the `useCurrentUser` hook. The mutation wiring
  for logout uses the same client.
- **API client**: a tiny typed `apiFetch` wrapper in `src/lib/api.ts`. It
  reads the access token from `AuthContext`, sets `Authorization: Bearer …`,
  throws typed errors that React Query can surface.
- **Trial gate** renders whenever any authed query returns 402. Central
  handler lives on the `QueryClient` (via `defaultOptions.queries.retry`
  + a global `onError` via a small `QueryClientProvider` wrapper that inspects
  error shape). Simplest path: throw a typed `TrialExpiredError` from the
  fetch wrapper, catch it at the `ProtectedRoute` level, render `<TrialGate/>`
  instead of the protected content.

## Files in scope
- `frontend/src/auth/AuthContext.tsx` — `AccessToken | null` state, setter,
  provider, `useAuth()` hook.
- `frontend/src/auth/useCurrentUser.ts` — `useQuery({ queryKey: ["me"] })`.
- `frontend/src/auth/ProtectedRoute.tsx` — redirects / renders gate / renders
  children.
- `frontend/src/auth/TrialExpiredGate.tsx` — §5.11 gate.
- `frontend/src/auth/LoginPage.tsx` — Czech login screen, Google CTA.
- `frontend/src/lib/api.ts` — `apiFetch` with typed errors.
- `frontend/src/lib/queryClient.ts` — shared `QueryClient`.
- `frontend/src/app/AppShell.tsx` — minimal authed shell (user avatar +
  email + logout button). Not the real app shell from Task 4.1.
- `frontend/src/marketing/LandingStub.tsx` — placeholder `/` page; the real
  landing page lands in Phase 11.
- `frontend/src/App.tsx` — replace with router.
- `frontend/src/__tests__/App.test.tsx` — replace with router-aware tests:
  anonymous → `/login` renders hero + Google CTA; with token in fragment,
  `/app` renders user info; 402 renders the gate.

## Acceptance criteria
1. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`
   all green.
2. Manual run against the dev backend:
   - `pnpm dev` → visit `http://localhost:5173/` — sees landing stub.
   - Click "Přihlásit se přes Google" on `/login` — the window navigates
     to `http://localhost:8000/api/v1/auth/google/login` (real Google redirect
     needs real OAuth credentials; the CTA itself points the right place).
   - Mock/paste a valid access token into the URL fragment at `/app` — the
     app calls `/auth/me` and renders the email and org name. (Can be
     exercised automatically in a test without a real browser.)
3. 402 from `/auth/me` renders the trial gate component with the expected
   copy.
4. No hex codes, no default Tailwind colors, no hard-coded `Kč` — Czech
   copy everywhere in the auth UI uses vykání.
5. One commit: `feat(frontend): auth context, login, trial gate — Task 1.4`.

## Non-goals
- Real refresh-token flow (access token is held in memory only; reload loses
  it). Tracked for a later follow-up.
- Landing page design (Phase 11).
- App shell sidebar / bottom nav (Task 4.1).
- E2E via Playwright.
