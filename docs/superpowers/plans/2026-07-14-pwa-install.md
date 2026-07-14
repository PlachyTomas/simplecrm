# PWA Install Option Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SimpleCRM installable as a PWA (manifest + icons) and add discovery UI: a mobile More-page row, a Settings → Appearance card, a one-time mobile nudge with later/never options, and an iOS instruction modal.

**Architecture:** No service worker. A module-level `beforeinstallprompt` capture feeds a `usePwaInstall()` hook that every surface consumes; nudge dismissal state is device-scoped in `localStorage` (pure helpers in `pwaInstallPrefs.ts`). Spec: `docs/superpowers/specs/2026-07-14-pwa-install-design.md`.

**Tech Stack:** Vite/React/TS, react-i18next, Tailwind semantic tokens, vitest + @testing-library/react, Playwright MCP for visual verification.

## Global Constraints

- Branch: `pwa-install` (already created; spec committed as aaa5936).
- All UI strings in BOTH `frontend/src/locales/cs/*` (reference, vykání) and `en/*`; `pnpm i18n:check` must pass after every task that adds strings.
- Interactive elements get `data-testid` from `frontend/src/lib/testids.ts` (kebab-case, `pwa-*`).
- Semantic Tailwind tokens only (no raw hex/palette classes); Lucide icons `strokeWidth={1.75}`; indigo accent for the install CTA (not magenta — installing is not a win moment).
- Run FE checks with `npx` (`npx vitest run`, `npx tsc -b --noEmit`) — `pnpm vitest` intermittently dies in deps-status-check.
- All commands run from `frontend/` unless stated otherwise.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Installability — icons, manifest, index.html

**Files:**
- Create: `frontend/public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` (generated)
- Create: `frontend/public/manifest.webmanifest`
- Modify: `frontend/index.html` (head, after the favicon link)
- Create (scratchpad only, NOT committed): `<scratchpad>/gen-icons.mjs`

**Interfaces:**
- Produces: `/manifest.webmanifest` + `/icons/*.png` served from public root; later tasks don't depend on this task's code, only on installability being real when testing in a browser.

- [x] **Step 1: Write the icon-generation script in the scratchpad**

`<scratchpad>/gen-icons.mjs` (run with node from `frontend/` so `@playwright/test` resolves). The maskable/apple icons put the mark on a full-bleed `#EC4899` square — the favicon's rounded rect is the same color, so it blends seamlessly; glyph stays inside the maskable safe zone.

```js
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const ROOT = "/Users/tomasplachy/Documents/SideHustles/simplecrm/frontend";
const svg = readFileSync(`${ROOT}/public/favicon.svg`, "utf8");
mkdirSync(`${ROOT}/public/icons`, { recursive: true });

const plain = (size) =>
  `<style>*{margin:0}body{width:${size}px;height:${size}px}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`;
const fullBleed = (size, scale) => {
  const glyph = Math.round(size * scale);
  return `<style>*{margin:0}body{width:${size}px;height:${size}px;background:#EC4899;display:grid;place-items:center}svg{width:${glyph}px;height:${glyph}px;display:block}</style>${svg}`;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const jobs = [
  [192, plain(192), "icon-192.png", true],
  [512, plain(512), "icon-512.png", true],
  [512, fullBleed(512, 0.8), "icon-512-maskable.png", false],
  [180, fullBleed(180, 0.85), "apple-touch-icon.png", false],
];
for (const [size, html, name, transparent] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.screenshot({ path: `${ROOT}/public/icons/${name}`, omitBackground: transparent });
}
await browser.close();
```

- [x] **Step 2: Run it and verify the PNGs**

Run: `cd frontend && node <scratchpad>/gen-icons.mjs && file public/icons/*.png`
Expected: four PNGs with dimensions 192x192, 512x512, 512x512, 180x180. Eyeball them (Read tool renders PNGs) — pink box + white sparkles, maskable has extra bleed.

- [x] **Step 3: Create the manifest**

`frontend/public/manifest.webmanifest`:

```json
{
  "name": "SimpleCRM",
  "short_name": "SimpleCRM",
  "description": "Jednoduchý český CRM pro malé prodejní týmy.",
  "lang": "cs",
  "id": "/app",
  "start_url": "/app",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0A0A0B",
  "theme_color": "#0A0A0B",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [x] **Step 4: Link manifest + apple-touch-icon in index.html**

In `frontend/index.html`, directly after the `<link rel="icon" ...>` line, add:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

- [x] **Step 5: Verify the dev server serves both**

Dev server must be running (see `running-simplecrm` skill; owner may already have it up — check first).
Run: `curl -s http://localhost:5173/manifest.webmanifest | head -5 && curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/icons/icon-192.png`
Expected: manifest JSON + `200`.

- [x] **Step 6: Commit**

```bash
git add frontend/public/manifest.webmanifest frontend/public/icons frontend/index.html
git commit -m "feat(pwa): web app manifest + install icons"
```

---

### Task 2: Nudge dismissal storage — `pwaInstallPrefs`

**Files:**
- Create: `frontend/src/lib/pwaInstallPrefs.ts`
- Test: `frontend/src/lib/__tests__/pwaInstallPrefs.test.ts`

**Interfaces:**
- Produces: `shouldShowNudge(now?: number): boolean`, `snoozeNudge(now?: number): void` (14 days), `suppressNudge(): void`. Storage key `simplecrm-pwa-nudge`, JSON `{ never?: boolean; remindAfter?: number }`.

- [x] **Step 1: Write the failing test**

`frontend/src/lib/__tests__/pwaInstallPrefs.test.ts`:

```ts
import { shouldShowNudge, snoozeNudge, suppressNudge } from "@/lib/pwaInstallPrefs";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("pwaInstallPrefs", () => {
  beforeEach(() => localStorage.clear());

  it("shows the nudge by default", () => {
    expect(shouldShowNudge()).toBe(true);
  });

  it("hides forever after suppressNudge", () => {
    suppressNudge();
    expect(shouldShowNudge()).toBe(false);
  });

  it("hides for 14 days after snoozeNudge, then shows again", () => {
    const now = 1_000_000;
    snoozeNudge(now);
    expect(shouldShowNudge(now)).toBe(false);
    expect(shouldShowNudge(now + 13 * DAY_MS)).toBe(false);
    expect(shouldShowNudge(now + 14 * DAY_MS)).toBe(true);
  });

  it("treats corrupt storage as default-visible", () => {
    localStorage.setItem("simplecrm-pwa-nudge", "{not json");
    expect(shouldShowNudge()).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pwaInstallPrefs.test.ts`
Expected: FAIL — cannot resolve `@/lib/pwaInstallPrefs`.

- [x] **Step 3: Implement**

`frontend/src/lib/pwaInstallPrefs.ts`:

```ts
const STORAGE_KEY = "simplecrm-pwa-nudge";
const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_LATER_DAYS = 14;

/**
 * Install-nudge dismissal state. Deliberately device-scoped (localStorage,
 * not a server-side user pref): installing is per-device, so dismissing the
 * nudge on a phone must not silence it on a tablet.
 */
interface NudgeState {
  never?: boolean;
  remindAfter?: number;
}

function readState(): NudgeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as NudgeState) : {};
  } catch {
    return {};
  }
}

function writeState(state: NudgeState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the nudge simply reappears next visit */
  }
}

export function shouldShowNudge(now: number = Date.now()): boolean {
  const state = readState();
  if (state.never) return false;
  if (typeof state.remindAfter === "number" && now < state.remindAfter) return false;
  return true;
}

export function snoozeNudge(now: number = Date.now()): void {
  writeState({ remindAfter: now + REMIND_LATER_DAYS * DAY_MS });
}

export function suppressNudge(): void {
  writeState({ never: true });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/pwaInstallPrefs.test.ts`
Expected: 4 passed.

- [x] **Step 5: Commit**

```bash
git add src/lib/pwaInstallPrefs.ts src/lib/__tests__/pwaInstallPrefs.test.ts
git commit -m "feat(pwa): device-scoped install-nudge dismissal state"
```

---

### Task 3: `usePwaInstall` hook

**Files:**
- Create: `frontend/src/lib/usePwaInstall.ts`
- Test: `frontend/src/lib/__tests__/usePwaInstall.test.tsx`

**Interfaces:**
- Produces: `usePwaInstall(): { canPrompt: boolean; isInstalled: boolean; isIos: boolean; promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> }`. Also exports `isIos()` / `isStandalone()` helpers and the `BeforeInstallPromptEvent` type.
- Consumes: nothing from earlier tasks.

- [x] **Step 1: Write the failing test**

Note: the module captures `beforeinstallprompt` at import time and keeps it in module state; tests reset it by dispatching `appinstalled` in `afterEach`. jsdom's `matchMedia` is stubbed in `src/test-setup.ts` (`matches: false`).

`frontend/src/lib/__tests__/usePwaInstall.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";

import { usePwaInstall } from "@/lib/usePwaInstall";

function dispatchInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  window.dispatchEvent(event);
  return { prompt };
}

describe("usePwaInstall", () => {
  afterEach(() => {
    // Clears the module-level captured prompt.
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
  });

  it("reports canPrompt=false with no captured event", () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.isIos).toBe(false);
  });

  it("captures beforeinstallprompt and flips canPrompt", () => {
    const { result } = renderHook(() => usePwaInstall());
    act(() => {
      dispatchInstallPrompt();
    });
    expect(result.current.canPrompt).toBe(true);
  });

  it("promptInstall fires the native prompt, reports the outcome, and clears canPrompt", async () => {
    const { prompt } = dispatchInstallPrompt("accepted");
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canPrompt).toBe(true);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(outcome).toBe("accepted");
    expect(result.current.canPrompt).toBe(false);
  });

  it("promptInstall returns 'unavailable' with no captured event", async () => {
    const { result } = renderHook(() => usePwaInstall());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe("unavailable");
  });

  it("reports isInstalled in standalone display-mode", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstalled).toBe(true);
    window.matchMedia = original;
  });

  it("detects iOS from the user agent", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isIos).toBe(true);
    if (descriptor) Object.defineProperty(window.navigator, "userAgent", descriptor);
    else Reflect.deleteProperty(window.navigator, "userAgent");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/usePwaInstall.test.tsx`
Expected: FAIL — cannot resolve `@/lib/usePwaInstall`.

- [x] **Step 3: Implement**

`frontend/src/lib/usePwaInstall.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

/** Chrome's non-standard install event — not in lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

// Module-level capture: Chrome fires `beforeinstallprompt` once, early —
// often before React mounts — so the listener can't live inside the hook.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/** Running as an installed app (Android/desktop standalone or iOS A2HS). */
export function isStandalone(): boolean {
  return (
    (window.matchMedia("(display-mode: standalone)")?.matches ?? false) ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPadOS 13+ reports as Macintosh; it's the only "Mac" with multi-touch. */
export function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (ua.includes("Macintosh") && window.navigator.maxTouchPoints > 1)
  );
}

/**
 * Single source of truth for every install surface. A surface should render
 * when `!isInstalled && (canPrompt || isIos)` — Chromium exposes a prompt,
 * iOS gets manual Add-to-Home-Screen instructions instead.
 */
export function usePwaInstall() {
  const [canPrompt, setCanPrompt] = useState(() => deferredPrompt !== null);
  const [isInstalled, setIsInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const update = () => setCanPrompt(deferredPrompt !== null);
    subscribers.add(update);
    update();
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setIsInstalled(isStandalone());
    mql?.addEventListener?.("change", onChange);
    return () => {
      subscribers.delete(update);
      mql?.removeEventListener?.("change", onChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const event = deferredPrompt;
    if (!event) return "unavailable";
    // One-shot: Chrome forbids reusing a spent prompt event.
    deferredPrompt = null;
    notify();
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  }, []);

  return { canPrompt, isInstalled, isIos: isIos(), promptInstall };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/usePwaInstall.test.tsx`
Expected: 6 passed.

- [x] **Step 5: Commit**

```bash
git add src/lib/usePwaInstall.ts src/lib/__tests__/usePwaInstall.test.tsx
git commit -m "feat(pwa): usePwaInstall hook with module-level prompt capture"
```

---

### Task 4: iOS instruction modal + pwa testids + pwa strings

**Files:**
- Create: `frontend/src/app/pwa/IosInstallModal.tsx`
- Test: `frontend/src/app/pwa/__tests__/IosInstallModal.test.tsx`
- Modify: `frontend/src/lib/testids.ts` (add `pwa` group)
- Modify: `frontend/src/locales/cs/common.json`, `frontend/src/locales/en/common.json` (add `pwa` group)

**Interfaces:**
- Consumes: `useModalDialog` (existing), `actions.close` common key (exists: "Zavřít").
- Produces: `<IosInstallModal open onClose />` — reused by Tasks 5–7. `testIds.pwa.*` for all pwa surfaces (defined here once): `nudge`, `nudgeInstall`, `nudgeLater`, `nudgeNever`, `moreInstall`, `settingsInstall`, `iosModalClose`.

- [x] **Step 1: Add testids**

In `frontend/src/lib/testids.ts`, add inside `testIds` (after the `nav` group):

```ts
  pwa: {
    nudge: "pwa-nudge",
    nudgeInstall: "pwa-nudge-install",
    nudgeLater: "pwa-nudge-later",
    nudgeNever: "pwa-nudge-never",
    moreInstall: "pwa-more-install",
    settingsInstall: "pwa-settings-install",
    iosModalClose: "pwa-ios-modal-close",
  },
```

- [x] **Step 2: Add strings (both catalogs)**

`frontend/src/locales/cs/common.json` — add a top-level `pwa` group:

```json
  "pwa": {
    "nudge": {
      "message": "SimpleCRM můžete mít jako aplikaci přímo na ploše telefonu.",
      "install": "Nainstalovat",
      "later": "Později",
      "never": "Už nezobrazovat"
    },
    "iosModal": {
      "title": "Přidat na plochu",
      "step1": "V prohlížeči klepněte na tlačítko Sdílet.",
      "step2": "Zvolte možnost „Přidat na plochu“.",
      "done": "Rozumím"
    }
  }
```

`frontend/src/locales/en/common.json`:

```json
  "pwa": {
    "nudge": {
      "message": "You can have SimpleCRM as an app right on your home screen.",
      "install": "Install",
      "later": "Later",
      "never": "Don't show again"
    },
    "iosModal": {
      "title": "Add to Home Screen",
      "step1": "In your browser, tap the Share button.",
      "step2": "Choose “Add to Home Screen”.",
      "done": "Got it"
    }
  }
```

- [x] **Step 3: Write the failing test**

`frontend/src/app/pwa/__tests__/IosInstallModal.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { IosInstallModal } from "@/app/pwa/IosInstallModal";
import { testIds } from "@/lib/testids";

describe("IosInstallModal", () => {
  it("renders nothing when closed", () => {
    render(<IosInstallModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows both steps and closes via the done button", async () => {
    const onClose = vi.fn();
    render(<IosInstallModal open onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // cs catalog is the test language (see test-setup).
    expect(screen.getByText("V prohlížeči klepněte na tlačítko Sdílet.")).toBeInTheDocument();
    expect(screen.getByText("Zvolte možnost „Přidat na plochu“.")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(testIds.pwa.iosModalClose));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [x] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/app/pwa/__tests__/IosInstallModal.test.tsx`
Expected: FAIL — cannot resolve `@/app/pwa/IosInstallModal`.

- [x] **Step 5: Implement the modal**

`frontend/src/app/pwa/IosInstallModal.tsx` (house modal pattern per ui-design §5.6: `bg-bg/80 backdrop-blur-sm` backdrop, bottom sheet on mobile, `useModalDialog` focus trap):

```tsx
import { Share, SquarePlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

interface IosInstallModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * iOS has no install-prompt API — every install surface opens this sheet
 * with the two manual Add-to-Home-Screen steps instead.
 */
export function IosInstallModal({ open, onClose }: IosInstallModalProps) {
  const { t } = useTranslation("common");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-4 backdrop-blur-sm md:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-install-title"
        className="w-full max-w-lg rounded-t-lg border border-border bg-surface p-6 shadow-lg md:rounded-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="ios-install-title" className="text-2xl font-semibold">
            {t("pwa.iosModal.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("actions.close")}
            className="rounded-md p-1 text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <ol className="mt-4 space-y-3">
          <li className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
              <Share size={18} strokeWidth={1.75} aria-hidden />
            </span>
            {t("pwa.iosModal.step1")}
          </li>
          <li className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
              <SquarePlus size={18} strokeWidth={1.75} aria-hidden />
            </span>
            {t("pwa.iosModal.step2")}
          </li>
        </ol>
        <button
          type="button"
          data-testid={testIds.pwa.iosModalClose}
          onClick={onClose}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          {t("pwa.iosModal.done")}
        </button>
      </div>
    </div>
  );
}
```

- [x] **Step 6: Run test + i18n check**

Run: `npx vitest run src/app/pwa/__tests__/IosInstallModal.test.tsx && pnpm i18n:check`
Expected: 2 passed; i18n parity OK.

- [x] **Step 7: Commit**

```bash
git add src/app/pwa src/lib/testids.ts src/locales/cs/common.json src/locales/en/common.json
git commit -m "feat(pwa): iOS add-to-home-screen instruction modal"
```

---

### Task 5: Install nudge + AppShell mount

**Files:**
- Create: `frontend/src/app/pwa/InstallNudge.tsx`
- Test: `frontend/src/app/pwa/__tests__/InstallNudge.test.tsx`
- Modify: `frontend/src/app/AppShell.tsx` (mount next to `<MobileTabBar />`)

**Interfaces:**
- Consumes: `usePwaInstall`, `pwaInstallPrefs`, `IosInstallModal`, `useMediaQuery`, `testIds.pwa.*`, `pwa.nudge.*` strings (all from earlier tasks).
- Produces: `<InstallNudge />` (no props).

- [x] **Step 1: Write the failing test**

`frontend/src/app/pwa/__tests__/InstallNudge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InstallNudge } from "@/app/pwa/InstallNudge";
import { shouldShowNudge } from "@/lib/pwaInstallPrefs";
import { testIds } from "@/lib/testids";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function mockMobileViewport() {
  window.matchMedia = ((query: string) => ({
    matches: query === "(max-width: 767px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("InstallNudge", () => {
  const originalMatchMedia = window.matchMedia;
  const uaDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window.navigator, "userAgent", { value: IPHONE_UA, configurable: true });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    if (uaDescriptor) Object.defineProperty(window.navigator, "userAgent", uaDescriptor);
    else Reflect.deleteProperty(window.navigator, "userAgent");
  });

  it("renders nothing on desktop viewports", () => {
    render(<InstallNudge />);
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
  });

  it("renders on mobile and snoozes via 'Later'", async () => {
    mockMobileViewport();
    render(<InstallNudge />);
    expect(screen.getByTestId(testIds.pwa.nudge)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(testIds.pwa.nudgeLater));
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
    expect(shouldShowNudge()).toBe(false);
    expect(shouldShowNudge(Date.now() + 15 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it("suppresses forever via 'Don't show again'", async () => {
    mockMobileViewport();
    render(<InstallNudge />);
    await userEvent.click(screen.getByTestId(testIds.pwa.nudgeNever));
    expect(shouldShowNudge(Date.now() + 365 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("opens the iOS modal from Install on iOS and suppresses the nudge", async () => {
    mockMobileViewport();
    render(<InstallNudge />);
    await userEvent.click(screen.getByTestId(testIds.pwa.nudgeInstall));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
    expect(shouldShowNudge(Date.now() + 365 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("does not render when already suppressed", () => {
    mockMobileViewport();
    localStorage.setItem("simplecrm-pwa-nudge", JSON.stringify({ never: true }));
    render(<InstallNudge />);
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/pwa/__tests__/InstallNudge.test.tsx`
Expected: FAIL — cannot resolve `@/app/pwa/InstallNudge`.

- [x] **Step 3: Implement**

`frontend/src/app/pwa/InstallNudge.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { IosInstallModal } from "@/app/pwa/IosInstallModal";
import { shouldShowNudge, snoozeNudge, suppressNudge } from "@/lib/pwaInstallPrefs";
import { testIds } from "@/lib/testids";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePwaInstall } from "@/lib/usePwaInstall";

/**
 * One-time "install SimpleCRM" hint for mobile browsers, anchored above the
 * tab bar. Shows only when installing is actually possible here (Chromium
 * prompt captured, or iOS where instructions replace the prompt).
 */
export function InstallNudge() {
  const { t } = useTranslation("common");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall();
  const [visible, setVisible] = useState(() => shouldShowNudge());
  const [iosModalOpen, setIosModalOpen] = useState(false);

  if (!isMobile || isInstalled || (!canPrompt && !isIos)) return null;
  if (!visible && !iosModalOpen) return null;

  const handleInstall = () => {
    // The user made a decision — never nag again on this device.
    suppressNudge();
    setVisible(false);
    if (isIos) {
      setIosModalOpen(true);
      return;
    }
    void promptInstall();
  };

  const handleLater = () => {
    snoozeNudge();
    setVisible(false);
  };

  const handleNever = () => {
    suppressNudge();
    setVisible(false);
  };

  return (
    <>
      {visible ? (
        <div data-testid={testIds.pwa.nudge} className="fixed inset-x-0 bottom-16 z-40 px-3 md:hidden">
          <div className="rounded-lg border border-border bg-surface-elevated p-3 shadow-lg">
            <p className="text-sm text-text-secondary">{t("pwa.nudge.message")}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                data-testid={testIds.pwa.nudgeInstall}
                onClick={handleInstall}
                className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-xs font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
              >
                {t("pwa.nudge.install")}
              </button>
              <button
                type="button"
                data-testid={testIds.pwa.nudgeLater}
                onClick={handleLater}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface-overlay px-3 text-xs font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
              >
                {t("pwa.nudge.later")}
              </button>
              <button
                type="button"
                data-testid={testIds.pwa.nudgeNever}
                onClick={handleNever}
                className="ml-auto rounded-md text-xs text-text-tertiary underline-offset-2 transition-colors duration-fast hover:text-text-secondary hover:underline"
              >
                {t("pwa.nudge.never")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <IosInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />
    </>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/pwa/__tests__/InstallNudge.test.tsx`
Expected: 5 passed.

- [x] **Step 5: Mount in AppShell**

In `frontend/src/app/AppShell.tsx`: add `import { InstallNudge } from "@/app/pwa/InstallNudge";` (alphabetical, after the MobileTabBar import) and render `<InstallNudge />` directly after `<MobileTabBar />`:

```tsx
      <MobileTabBar />
      <InstallNudge />
      <TourOverlay />
```

- [x] **Step 6: Commit**

```bash
git add src/app/pwa src/app/AppShell.tsx
git commit -m "feat(pwa): one-time mobile install nudge above the tab bar"
```

---

### Task 6: More page row

**Files:**
- Modify: `frontend/src/app/MorePage.tsx`
- Modify: `frontend/src/locales/cs/common.json`, `frontend/src/locales/en/common.json` (add `nav.installApp`)

**Interfaces:**
- Consumes: `usePwaInstall`, `IosInstallModal`, `testIds.pwa.moreInstall`.

- [x] **Step 1: Add the nav string to both catalogs**

cs `common.json`, inside `nav` (after `"feedback"`): `"installApp": "Nainstalovat aplikaci",`
en `common.json`, same position: `"installApp": "Install app",`

- [x] **Step 2: Modify MorePage**

In `frontend/src/app/MorePage.tsx`:

1. Add `MonitorSmartphone` to the lucide-react import list.
2. Add imports: `import { useState } from "react";`, `import { IosInstallModal } from "@/app/pwa/IosInstallModal";`, `import { testIds } from "@/lib/testids";`, `import { usePwaInstall } from "@/lib/usePwaInstall";`.
3. Extend the `Row` interface with `testId?: string;` and render `data-testid={row.testId}` on BOTH the `<Link>` and the `<button>` variants.
4. Inside the component (after the `logout` mutation), add:

```tsx
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const showInstall = !isInstalled && (canPrompt || isIos);
```

5. In the `rows` array, insert between the feedback row and the logout row:

```tsx
    ...(showInstall
      ? [
          {
            onClick: () => (isIos ? setIosModalOpen(true) : void promptInstall()),
            labelKey: "nav.installApp" as const,
            icon: MonitorSmartphone,
            testId: testIds.pwa.moreInstall,
          },
        ]
      : []),
```

6. Render the modal after the `</ul>` (inside the `<section>`):

```tsx
      <IosInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />
```

- [x] **Step 3: Verify: typecheck + i18n + full lib/pwa tests**

Run: `npx tsc -b --noEmit && pnpm i18n:check && npx vitest run src/app/pwa src/lib/__tests__`
Expected: clean typecheck, i18n parity, all pwa tests pass.

- [x] **Step 4: Commit**

```bash
git add src/app/MorePage.tsx src/locales/cs/common.json src/locales/en/common.json
git commit -m "feat(pwa): install-app row on the mobile More page"
```

---

### Task 7: Settings → Appearance install card

**Files:**
- Modify: `frontend/src/app/settings/sections/AppearanceSection.tsx`
- Modify: `frontend/src/locales/cs/settings.json`, `frontend/src/locales/en/settings.json` (add `appearance.installApp.*`)

**Interfaces:**
- Consumes: `usePwaInstall`, `IosInstallModal`, `testIds.pwa.settingsInstall`.

- [x] **Step 1: Add strings**

cs `settings.json`, inside `appearance`:

```json
    "installApp": {
      "title": "Aplikace",
      "description": "Nainstalujte si SimpleCRM jako aplikaci — otevře se v samostatném okně přímo z plochy.",
      "button": "Nainstalovat aplikaci"
    }
```

en `settings.json`, inside `appearance`:

```json
    "installApp": {
      "title": "App",
      "description": "Install SimpleCRM as an app — it opens in its own window right from your home screen.",
      "button": "Install app"
    }
```

- [x] **Step 2: Modify AppearanceSection**

Replace `frontend/src/app/settings/sections/AppearanceSection.tsx` with:

```tsx
import { MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { IosInstallModal } from "@/app/pwa/IosInstallModal";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { testIds } from "@/lib/testids";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePwaInstall } from "@/lib/usePwaInstall";

export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);
  // Hide entirely where installing is impossible (Firefox, already installed) —
  // no dead UI.
  const showInstall = !isInstalled && (canPrompt || isIos);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("appearance.title")}</h2>
      <p className="mt-1 text-sm text-text-tertiary">{t("appearance.subtitle")}</p>
      <div className="mt-4">
        <ThemeToggle />
      </div>
      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-text-secondary">{t("appearance.language")}</p>
        <LanguageSwitcher persistToAccount />
      </div>
      {showInstall ? (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-text-secondary">
            {t("appearance.installApp.title")}
          </p>
          <p className="text-sm text-text-tertiary">{t("appearance.installApp.description")}</p>
          <button
            type="button"
            data-testid={testIds.pwa.settingsInstall}
            onClick={() => (isIos ? setIosModalOpen(true) : void promptInstall())}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            <MonitorSmartphone size={16} strokeWidth={1.75} aria-hidden />
            {t("appearance.installApp.button")}
          </button>
        </div>
      ) : null}
      <IosInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />
    </section>
  );
}
```

- [x] **Step 3: Verify: typecheck + i18n**

Run: `npx tsc -b --noEmit && pnpm i18n:check`
Expected: clean.

- [x] **Step 4: Commit**

```bash
git add src/app/settings/sections/AppearanceSection.tsx src/locales/cs/settings.json src/locales/en/settings.json
git commit -m "feat(pwa): install-app card in settings appearance section"
```

---

### Task 8: Full verification (suites + Playwright visual pass)

**Files:** none new (fixes only if verification finds issues).

- [x] **Step 1: Full frontend suites**

Run from `frontend/`: `npx tsc -b --noEmit && npx vitest run && pnpm i18n:check && npx eslint src/app/pwa src/lib/usePwaInstall.ts src/lib/pwaInstallPrefs.ts src/app/MorePage.tsx src/app/settings/sections/AppearanceSection.tsx src/app/AppShell.tsx`
Expected: all pass, no lint errors.

- [x] **Step 2: Playwright MCP visual pass** (dev stack running + logged in per `running-simplecrm` skill; screenshots go to scratchpad, never the repo)

1. Desktop 1280×800, `/app/settings` → Vzhled: card hidden or visible depending on `canPrompt` — no console errors either way; screenshot.
2. Resize to 390×844 (mobile). In the page, force-capture a fake prompt via `browser_run_code_unsafe`:
   `window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }) }))`
   → nudge appears above the tab bar; screenshot (dark theme). Toggle light theme; screenshot.
3. Click "Později" → nudge disappears; verify `localStorage["simplecrm-pwa-nudge"]` has `remindAfter`; reload → nudge stays hidden.
4. Clear the key, re-dispatch the fake event, navigate to `/app/more` → install row visible; screenshot.
5. iOS modal: `Object.defineProperty(navigator, "userAgent", { value: "<iPhone UA>", configurable: true })` via run_code, client-side-navigate away and back to `/app/more` (tab bar links, not full reload), click the install row → instruction modal; screenshot.
6. `browser_console_messages` → no errors throughout.
7. Manifest sanity in the real browser: `browser_navigate` to `http://localhost:5173/manifest.webmanifest` renders the JSON.

- [x] **Step 3: Update memory/tracker + final commit**

Update memory index entry for this track (branch, status, spec/plan paths). Commit any verification fixes.
