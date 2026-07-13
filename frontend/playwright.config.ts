import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal Playwright config. Tests live under `tests/e2e/`.
 *
 * Assumes the dev stack is already running (`pnpm dev` + a backend on
 * :8000). Booting the servers from inside Playwright would also need
 * postgres + an alembic upgrade run, so we keep that out-of-band; the
 * smoke test only covers what's stable across schema changes.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    // Pin the browser to Czech so the app's language detector resolves to cs
    // (the reference language). Without this the test Chromium's en-US
    // navigator.language flips the UI to English and the Czech-string
    // assertions below fail. The suite intentionally verifies the cs default.
    locale: "cs-CZ",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
