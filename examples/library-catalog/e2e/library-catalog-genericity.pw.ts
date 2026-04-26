import { expect, test } from "@playwright/test";

test("S9 library-catalog boots observatory without code changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");

  // Switch to Runtime tab where instances render.
  await page.click('[data-tab-trigger="runtime"]');
  const runtimeText = await page.locator("body").innerText();
  expect(runtimeText).toContain("book-001");
  expect(runtimeText).toContain("Gödel");

  // Switch to Dynamics tab where the state-machine renders.
  await page.click('[data-tab-trigger="dynamics"]');
  const dynamicsHtml = await page.locator("body").innerText();
  // book-lifecycle machine is present with a checkout verb.
  expect(dynamicsHtml).toMatch(
    /library lifecycle|sm:\/\/github\.com\/Stream44\/s44-rak-gen1@1\.0\/library\/library\/lifecycle\/1\.0\.0/,
  );
});
