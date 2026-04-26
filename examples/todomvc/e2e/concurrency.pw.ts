import { expect, test } from "@playwright/test";
import { bootTodoServer, gotoTodo, type TodoServerHandle } from "./server-fixture.ts";

// End-to-end witness for per-socket serialization.
// Fires N rapid AddTodo actions on one socket with ZERO awaits between
// sends, then asserts the final DOM matches the serial outcome:
// every title present exactly once, in insertion order. This is the
// test whose absence masked the race.

const RAPID_COUNT = 10;
let server: TodoServerHandle;

test.beforeEach(async ({ page }) => {
  server = await bootTodoServer();
  await gotoTodo(page, server.baseUrl, "/");
  await expect(page.locator(".todo-list li")).toHaveCount(0);
});

test.afterEach(async () => {
  await server.stop();
});

test(`S19 TodoMVC — ${RAPID_COUNT} rapid AddTodo actions preserve order`, async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  await expect(page.locator(".new-todo")).toBeVisible();

  const titles = Array.from({ length: RAPID_COUNT }, (_, i) => `rapid-${i}`);

  // Fire all N adds back-to-back in the browser context, WITHOUT any
  // awaits between sends. Doing the sequence inside page.evaluate
  // guarantees the WS frames flush in one microtask turn, which is the
  // worst case for the server's per-socket queue.
  await page.evaluate((ts: string[]) => {
    const input = document.querySelector(".new-todo") as HTMLInputElement | null;
    if (!input) throw new Error("missing .new-todo");
    for (const t of ts) {
      input.value = t;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
  }, titles);

  // Wait for the DOM to stabilize. `toHaveCount` polls; no explicit sleep.
  const items = page.locator(".todo-list li");
  await expect(items).toHaveCount(RAPID_COUNT);

  // All titles present, in insertion order, none duplicated, none dropped.
  const labels = page.locator(".todo-list li label");
  await expect(labels).toHaveCount(RAPID_COUNT);
  const rendered: string[] = await labels.evaluateAll((els) =>
    els.map((el) => (el.textContent ?? "").trim()),
  );
  expect(rendered).toEqual(titles);

  // And as a secondary witness: the count label reports N active items.
  await expect(page.locator(".todo-count")).toHaveText(`${RAPID_COUNT} items left`);
});
