import { expect, test } from "@playwright/test";

test("S5 websocket reconnection restores the observatory view", async ({ page }) => {
  await page.goto("/observatory");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");
  await page.evaluate(() => window.ws?.close());
  await expect(page.locator("[data-connection-state]")).toHaveText("reconnecting");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected", { timeout: 6_000 });
  expect(await page.locator('[data-tab="kernel"] table').count()).toBeGreaterThanOrEqual(3);
});
