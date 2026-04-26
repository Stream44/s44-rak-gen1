import { expect, test } from "@playwright/test";

test("S7 acceptance play auto-runs UC2 cancel-pending; side panel reflects cancelled state", async ({
  page,
}) => {
  await page.goto("/observatory");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");

  // Activate the Acceptance tab.
  await page.click('[data-tab-trigger="acceptance"]');

  // Initial state: no step cards yet.
  await expect(page.locator("[data-tab='acceptance'] .step-card")).toHaveCount(0);

  // Click the trace Play button for the single-step scenario sc-cancel-pending.
  await page
    .locator('[data-scenario-id="sc-cancel-pending"] [data-acceptance-trace-play]')
    .first()
    .click();

  // Auto-play lands the single step with status=passed.
  await expect(
    page.locator('[data-tab="acceptance"] .step-card[data-step-status="passed"]'),
  ).toHaveCount(1, { timeout: 5000 });

  // Instance row reflects the cancelled status after the cancel verb lands.
  const ordRow = page.locator('[data-tab="acceptance"] [data-instance-key="ord-001"]').first();
  await expect(ordRow).toContainText("cancelled");
});

test("S8 acceptance manual stepping — reset clears session, Back reverts last verdict", async ({
  page,
}) => {
  await page.goto("/observatory");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");
  await page.click('[data-tab-trigger="acceptance"]');

  // Play the happy-path trace (4 steps), then Pause immediately to freeze partway.
  await page
    .locator('[data-scenario-id="sc-full-lifecycle"] [data-acceptance-trace-play]')
    .first()
    .click();
  await page.locator('[data-session-action="pause"]').first().click();

  // Reset clears everything.
  await page.locator('[data-session-action="reset"]').first().click();
  await expect(page.locator('[data-tab="acceptance"] .step-card')).toHaveCount(0);

  // Play again, wait for auto-play to complete all 4 steps.
  await page
    .locator('[data-scenario-id="sc-full-lifecycle"] [data-acceptance-trace-play]')
    .first()
    .click();
  await expect(
    page.locator('[data-tab="acceptance"] .step-card[data-step-status="passed"]'),
  ).toHaveCount(4, { timeout: 8000 });

  // Final state: ord-001 is delivered.
  await expect(
    page.locator('[data-tab="acceptance"] [data-instance-key="ord-001"]').first(),
  ).toContainText("delivered");

  // Step back: last step reverts to pending; first three remain passed.
  await page.locator('[data-session-action="back"]').first().click();
  await expect(
    page.locator('[data-tab="acceptance"] .step-card[data-step-status="pending"]'),
  ).toHaveCount(1, { timeout: 3000 });
  await expect(
    page.locator('[data-tab="acceptance"] .step-card[data-step-status="passed"]'),
  ).toHaveCount(3);
});
