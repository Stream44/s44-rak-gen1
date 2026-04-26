import { expect, test } from "@playwright/test";

test("S4 reflective tree expands and inspector updates", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");
  await page.locator('[data-tab-trigger="reflective"]').click();
  await expect(page.locator(".shared-query").first()).toContainText("ecommerce");
  await page.evaluate(() => {
    window.ws?.send(
      JSON.stringify({ type: "action", ref: "model.select", payload: { modelId: "core" } }),
    );
  });
  await expect(page.locator(".shared-query").first()).toContainText("core");
  await expect(page.locator("body")).toContainText("Model · core");
});
