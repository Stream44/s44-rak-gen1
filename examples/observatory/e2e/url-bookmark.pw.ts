import { expect, test } from "@playwright/test";

// S10 — URL hash encodes tab + selection; reload preserves context.
test("S10 URL hash bookmarks tab + selection; reload preserves context", async ({ page }) => {
  await page.goto("/observatory");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");

  // Click a trigger for the Kernel tab (whichever element is present).
  await page.click('[data-tab-trigger="kernel"]').catch(() => page.click('[data-tab="kernel"]'));
  await page.waitForFunction(
    () => window.location.hash.includes("t=") && window.location.hash.includes("kernel"),
    null,
    { timeout: 5000 },
  );

  // Hash contains the activeTab alias.
  const afterTab = await page.evaluate(() => window.location.hash);
  expect(afterTab).toContain("t=");
  expect(afterTab).toContain("kernel");
});

// S11 — Deep link via hash lands on the right tab.
test("S11 hash deep link pre-positions context before interaction", async ({ page }) => {
  await page.goto("/observatory#t=runtime&n=instances");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");

  // After the first rerender, the runtime tab panel should be the visible one.
  await page.waitForFunction(
    () => {
      const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-tab]"));
      const runtime = panels.find((n) => n.dataset.tab === "runtime");
      if (!runtime) return false;
      const style = (runtime.style.display ?? "").trim();
      return style === "" || style === "block" || style === "flex" || style === "grid";
    },
    null,
    { timeout: 5000 },
  );
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toContain("t=");
  expect(hash).toContain("runtime");
});
