import { expect, test } from "@playwright/test";

test("S2 dynamics tab switches locally via ui-set only", async ({ page }) => {
  await page.goto("/observatory");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");
  const before = await page.evaluate(() => ({
    sent: (window.__adkSentFrames ?? []).length,
    received: (window.__adkReceivedFrames ?? []).length,
  }));
  await page.locator('[data-tab-trigger="dynamics"]').click();
  await expect(page.locator('[data-tab="dynamics"]')).toBeVisible();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    sent: window.__adkSentFrames ?? [],
  }));
  expect(after.sent.slice(before.sent)).toEqual([
    { type: "ui-set", ctxPath: "page", path: "activeTab", value: "dynamics" },
  ]);
});
