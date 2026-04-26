import { expect, test } from "@playwright/test";

test("S1 structure tab loads with model data", async ({ page }) => {
  await page.goto("/observatory");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");
  expect(await page.locator('[data-tab="kernel"] table').count()).toBeGreaterThanOrEqual(3);
  expect(await page.locator('[data-tab="kernel"] .pill').count()).toBeGreaterThan(2);
  expect(await page.locator('[data-tab="kernel"] code').count()).toBeGreaterThan(1);
});
