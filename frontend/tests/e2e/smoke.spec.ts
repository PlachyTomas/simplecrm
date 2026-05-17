import { expect, test } from "@playwright/test";

import { testIds } from "../../src/lib/testids";

/**
 * Single smoke test for the Playwright/agent-friendliness baseline.
 *
 * Confirms the central `testIds` map resolves on the live app — if any
 * of these break, an AI agent driving the app via Playwright MCP will
 * hit dead-ends. Bigger flows are out of scope; this is the canary.
 */
test("authenticated user sees the primary nav with stable test ids", async ({ page }) => {
  await page.goto("/login");

  // The dev-auth login form is the default in `APP_ENV=dev`. Credentials
  // come from env so this test can also run against a staging seed.
  const email = process.env.PLAYWRIGHT_TEST_EMAIL ?? "admin@example.cz";
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "TestPass123!";
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByRole("textbox", { name: "Heslo" }).fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 10000 });

  // The full set of primary-nav testids should all be present.
  await expect(page.getByTestId(testIds.nav.overview)).toBeVisible();
  await expect(page.getByTestId(testIds.nav.pipeline)).toBeVisible();
  await expect(page.getByTestId(testIds.nav.companies)).toBeVisible();
  await expect(page.getByTestId(testIds.nav.contacts)).toBeVisible();
  await expect(page.getByTestId(testIds.nav.deals)).toBeVisible();
});
