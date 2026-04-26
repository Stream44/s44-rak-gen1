import { expect, test } from "@playwright/test";

test("S6 mirrored sharedQuery fans out to a second client", async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto("/observatory");
  await pageB.goto("/observatory");
  await expect(pageA.locator("[data-connection-state]")).toHaveText("connected");
  await expect(pageB.locator("[data-connection-state]")).toHaveText("connected");

  await pageA.locator('[data-tab-trigger="reflective"]').click();
  await pageB.locator('[data-tab-trigger="reflective"]').click();
  await expect(pageA.locator(".shared-query").first()).toContainText("ecommerce");
  await expect(pageB.locator(".shared-query").first()).toContainText("ecommerce");
  await pageA.evaluate(() => {
    window.ws?.send(
      JSON.stringify({ type: "action", ref: "model.select", payload: { modelId: "core" } }),
    );
  });
  await expect(pageA.locator(".shared-query").first()).toContainText("core");
  await expect(pageB.locator(".shared-query").first()).toContainText("core");
});
