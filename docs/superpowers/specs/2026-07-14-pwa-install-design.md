# PWA install option — design

**Date:** 2026-07-14 · **Status:** approved (owner, in-chat) · **Verifier:** Playwright

## Goal

Let users install SimpleCRM on their phone (and desktop) as an app: make the site a
valid installable PWA (manifest + icons) and add UI so users actually discover and
trigger the install. No service worker in this pass.

## Decisions (owner Q&A)

- **Discovery:** permanent menu entries **plus** a one-time mobile nudge with
  "remind later" and "never show again" choices.
- **Scope:** installability + install UI only. Service worker / offline / update
  toast explicitly out of scope (can be layered on later without touching this work).
- **Icons:** derived from the current `favicon.svg` mark; will be redone when the
  on-hold app-brand logo track lands.
- **Verifier:** Playwright (mobile emulation); real install prompt can't fire under
  automation — verify the UI states around it.

## 1. Installability (manifest + icons)

- `frontend/public/manifest.webmanifest` — `name` "SimpleCRM", `short_name`
  "SimpleCRM", cs description (reference language), `start_url: "/app"`,
  `display: "standalone"`, `background_color` `#0A0A0B`, `theme_color` `#0A0A0B`
  (matches the existing dark-default theme-color meta), `lang: "cs"`.
- Icons in `frontend/public/icons/`: `icon-192.png`, `icon-512.png`,
  `icon-512-maskable.png` (safe-zone padded), `apple-touch-icon.png` (180×180,
  opaque background — iOS doesn't composite transparency). Generated from
  `favicon.svg` via a one-off script run from the scratchpad — only the generated
  PNGs are committed, not the script.
- `index.html` head additions: `<link rel="manifest">`, `<link rel="apple-touch-icon">`.
  The existing dynamic theme-color script stays as-is.
- Chrome (desktop + Android, since mid-2024) and iOS Safari both consider this
  installable without a service worker.

## 2. Install plumbing — `usePwaInstall()` hook

`frontend/src/lib/usePwaInstall.ts`, single source of truth for every surface:

- Captures `beforeinstallprompt` (module-level listener registered at import time so
  the event isn't missed before React mounts; stored in a module singleton).
- Returns:
  - `isInstalled` — `matchMedia("(display-mode: standalone)")` OR
    `navigator.standalone === true` (iOS). Live via media-query listener.
  - `isIos` — UA check (iPhone/iPad incl. iPadOS-on-Mac heuristic:
    `maxTouchPoints > 1` + Mac platform).
  - `canPrompt` — a captured `beforeinstallprompt` event is available.
  - `promptInstall()` — calls `.prompt()` on the captured event, resolves with the
    user choice, clears the singleton after use.
- Surfaces decide visibility: a surface renders when `!isInstalled && (canPrompt || isIos)`.

## 3. UI surfaces (all hidden when running installed)

### 3a. More page row (mobile)

New row in `MorePage.tsx` above Logout: icon `MonitorDown`/`Smartphone`, label
"Nainstalovat aplikaci" / "Install app". Android/Chrome → `promptInstall()`;
iOS → opens the instruction modal (3c). Hidden when `isInstalled` or
(`!canPrompt && !isIos`).

### 3b. Settings → Appearance card

Card in the personal **appearance** section: short description + install button.
Same visibility + behavior as 3a; also serves desktop Chrome/Edge. On browsers
that can't install (Firefox, or already installed) the card hides entirely —
no dead UI.

### 3c. iOS instruction modal

`useModalDialog`-based sheet (copy patterns from an existing modal), reused by every
surface on iOS: two steps with inline icons — 1. tap **Share** (share icon) in
Safari's toolbar, 2. choose **"Add to Home Screen"** (plus-square icon). One
"Got it" close button.

### 3d. One-time nudge (mobile browser only)

Compact card fixed above the `MobileTabBar`, TrialBanner-style visuals but
bottom-anchored: one line of copy ("SimpleCRM funguje jako aplikace…"),
**Install** (primary, accent), **Later** (secondary), small "Don't show again"
text link. Rendered from `AppShell` only when: mobile viewport ∧ `!isInstalled`
∧ (`canPrompt` ∨ `isIos`) ∧ not suppressed by storage.

**Storage** (`localStorage`, deliberately device-scoped — installing is
per-device, so dismissing on the phone must not silence a tablet):
key `simplecrm-pwa-nudge`, JSON `{ never?: true, remindAfter?: epochMs }`.
"Later" → `remindAfter = now + 14 days`. "Don't show again" → `never: true`.
Install click → treat as `never` (prompt shown; user decided).

## 4. Cross-cutting

- **i18n:** all strings in `frontend/src/locales/{cs,en}` (`common` ns for
  nav/nudge, `settings` ns for the card); `pnpm i18n:check` must pass.
- **testids:** nudge buttons, More row, settings install button, iOS modal in
  `lib/testids.ts`.
- **Testing:** vitest for `usePwaInstall` (mock `matchMedia`, dispatch synthetic
  `beforeinstallprompt`) and nudge storage logic (fake timers for the 14-day
  window). Playwright MCP visual pass: More row, Appearance card, nudge, iOS
  modal (UA/viewport emulation), console clean. Existing e2e must stay green —
  the nudge must not obstruct the tab bar (e2e runs are `canPrompt=false`
  chromium… if the nudge can still appear there, pin storage/UA in e2e setup —
  verify during implementation).
- **Out of scope:** service worker, offline caching, push notifications,
  install analytics.
