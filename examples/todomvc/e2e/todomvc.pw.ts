import { expect, test, type Page } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { bootTodoServer, gotoTodo, todoDataFile, type TodoServerHandle } from "./server-fixture.ts";

let server: TodoServerHandle;

export interface TodoFile {
  records: Record<string, { title?: string; completed?: boolean }>;
}

export function readTodosFile(): TodoFile {
  if (!existsSync(todoDataFile)) return { records: {} };
  const raw = JSON.parse(readFileSync(todoDataFile, "utf-8")) as {
    records?: TodoFile["records"];
  };
  return { records: raw.records ?? {} };
}

export function fileTitles(): string[] {
  const file = readTodosFile();
  return Object.values(file.records)
    .map((record) => record.title ?? "")
    .filter(Boolean)
    .sort();
}

export function fileCount(): number {
  return Object.keys(readTodosFile().records).length;
}

function findFileRecord(title: string) {
  return Object.values(readTodosFile().records).find((record) => record.title === title);
}

function todoRow(page: Page, title: string) {
  return page.locator(".todo-list li").filter({ hasText: title }).first();
}

async function clickElement(locator: Locator): Promise<void> {
  const clicked = await locator.evaluateAll((elements) => {
    const target = elements.find(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
    target?.click();
    return Boolean(target);
  });
  if (!clicked) {
    throw new Error("Element handle not found for clickElement");
  }
}

async function addTodo(
  page: import("@playwright/test").Page,
  title: string,
  expectedCount: number,
): Promise<void> {
  await page.locator(".new-todo").fill(title);
  await page.locator(".new-todo").press("Enter");
  await expect(page.locator(".todo-list li")).toHaveCount(expectedCount);
}

test.beforeEach(async ({ page }) => {
  server = await bootTodoServer();
  await gotoTodo(page, server.baseUrl, "/");
  await expect(page.locator(".todo-list li")).toHaveCount(0);
});

test.afterEach(async () => {
  await server.stop();
});

test("S13 TodoMVC — add / complete / delete happy path", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  await expect(page.locator(".new-todo")).toBeVisible();

  await addTodo(page, "buy milk", 1);
  await expect(page.locator(".todo-list li")).toContainText("buy milk");
  await expect(page.locator(".new-todo")).toHaveValue("");
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toContain("buy milk");

  await addTodo(page, "do laundry", 2);
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["buy milk", "do laundry"]);

  await clickElement(todoRow(page, "buy milk").locator(".toggle"));
  await expect.poll(() => findFileRecord("buy milk")?.completed, { timeout: 5000 }).toBe(true);
  await gotoTodo(page, server.baseUrl, "/#/completed");
  await expect(page.locator(".todo-list li")).toHaveCount(1);
  await expect(page.locator(".todo-list li")).toContainText("buy milk");
  await gotoTodo(page, server.baseUrl, "/#/");
  await expect(page.locator(".clear-completed")).toBeVisible();

  await clickElement(todoRow(page, "buy milk").locator(".destroy"));
  await expect(page.locator(".todo-list li")).toHaveCount(1);
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["do laundry"]);
  await expect.poll(() => fileCount(), { timeout: 5000 }).toBe(1);
});

test("S14 TodoMVC — filter via URL hash", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  let count = 0;
  for (const title of ["a", "b", "c"]) {
    count += 1;
    await addTodo(page, title, count);
  }
  await clickElement(todoRow(page, "a").locator(".toggle"));

  await gotoTodo(page, server.baseUrl, "/#/active");
  await expect(page.locator(".todo-list li")).toHaveCount(2);

  await gotoTodo(page, server.baseUrl, "/#/completed");
  await expect(page.locator(".todo-list li")).toHaveCount(1);

  await gotoTodo(page, server.baseUrl, "/#/");
  await expect(page.locator(".todo-list li")).toHaveCount(3);
});

test("S15 TodoMVC — clear completed", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  let count = 0;
  for (const title of ["keep", "trash"]) {
    count += 1;
    await addTodo(page, title, count);
  }
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["keep", "trash"]);
  await clickElement(page.locator(".todo-list li").nth(1).locator(".toggle"));
  await expect.poll(() => findFileRecord("trash")?.completed, { timeout: 5000 }).toBe(true);
  await page.locator(".clear-completed").click();
  await expect(page.locator(".todo-list li")).toHaveCount(1);
  await expect(page.locator(".todo-list li")).toContainText("keep");
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["keep"]);
  await expect.poll(() => fileCount(), { timeout: 5000 }).toBe(1);
});

test("S16 TodoMVC — toggle all on / off", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  let count = 0;
  for (const title of ["a", "b", "c"]) {
    count += 1;
    await addTodo(page, title, count);
  }
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["a", "b", "c"]);
  await clickElement(page.locator(".toggle-all"));
  await expect
    .poll(
      () => Object.values(readTodosFile().records).every((record) => record.completed === true),
      { timeout: 5000 },
    )
    .toBe(true);
  await gotoTodo(page, server.baseUrl, "/#/completed");
  await expect(page.locator(".todo-list li")).toHaveCount(3);
  await gotoTodo(page, server.baseUrl, "/#/");
  await clickElement(page.locator(".toggle-all"));
  await expect
    .poll(
      () => Object.values(readTodosFile().records).every((record) => record.completed === false),
      { timeout: 5000 },
    )
    .toBe(true);
  await gotoTodo(page, server.baseUrl, "/#/completed");
  await expect(page.locator(".todo-list li")).toHaveCount(0);
});

test("S18 TodoMVC — DOM structure matches the standard TodoMVC shape", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  await addTodo(page, "one", 1);
  await addTodo(page, "two", 2);

  // Each <li> has exactly one label (no duplicate title text). This is the
  // regression that escaped earlier because `.toContainText("one")` was
  // happy with "oneone".
  const itemLabels = page.locator(".todo-list li label");
  await expect(itemLabels).toHaveCount(2);
  await expect(itemLabels.nth(0)).toHaveText("one");
  await expect(itemLabels.nth(1)).toHaveText("two");

  // The toggle is a checkbox sibling of its label, and the label never duplicates.
  for (let i = 0; i < 2; i += 1) {
    const li = page.locator(".todo-list li").nth(i);
    await expect(li.locator(".toggle")).toHaveCount(1);
    await expect(li.locator("label")).toHaveCount(1);
  }

  // Complete "one": li gets .completed and .toggle is :checked.
  await clickElement(todoRow(page, "one").locator(".toggle"));
  await expect(todoRow(page, "one")).toHaveClass(/completed/);
  await expect(todoRow(page, "one").locator(".toggle")).toBeChecked();

  // Counter reports active (incomplete) count, not total.
  await expect(page.locator(".todo-count")).toHaveText("1 item left");
  await clickElement(todoRow(page, "two").locator(".toggle"));
  await expect(page.locator(".todo-count")).toHaveText("0 items left");
});

test("S17 TodoMVC — state survives restart", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page1 = await ctx.newPage();
  await gotoTodo(page1, server.baseUrl, "/");
  await addTodo(page1, "persist-me", 1);
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toContain("persist-me");

  await page1.waitForTimeout(200);
  await ctx.close();

  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await gotoTodo(page2, server.baseUrl, "/");
  await expect(page2.locator(".todo-list li")).toHaveCount(1);
  await expect(page2.locator(".todo-list li")).toContainText("persist-me");
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toContain("persist-me");
  await ctx2.close();
});

test("S19 TodoMVC — deleting a row shrinks the persisted JSON file", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  for (const [i, title] of ["alpha", "beta", "gamma"].entries()) {
    await page.locator(".new-todo").fill(title);
    await page.locator(".new-todo").press("Enter");
    await expect(page.locator(".todo-list li")).toHaveCount(i + 1);
  }
  await expect.poll(() => fileCount(), { timeout: 5000 }).toBe(3);

  await clickElement(todoRow(page, "beta").locator(".destroy"));
  await expect(page.locator(".todo-list li")).toHaveCount(2);
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["alpha", "gamma"]);
});

test("S20 TodoMVC — Enter exits edit mode and persists the new title", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  await page.locator(".new-todo").fill("orig");
  await page.locator(".new-todo").press("Enter");
  await expect(page.locator(".todo-list li")).toHaveCount(1);

  await todoRow(page, "orig").locator("label").click();
  await expect(todoRow(page, "orig").locator("input.edit")).toBeVisible();

  const editInput = todoRow(page, "orig").locator("input.edit");
  await editInput.fill("renamed");
  await editInput.press("Enter");

  await expect(todoRow(page, "renamed").locator("input.edit")).toHaveCount(0);
  await expect(todoRow(page, "renamed").locator("label")).toHaveText("renamed");
  // Edit mutates the existing row — file must still have exactly one record,
  // not a fresh entry keyed by the action ref. Pins the regression where
  // EditTodo persisted under key "EditTodo" alongside the original.
  await expect.poll(() => fileCount(), { timeout: 5000 }).toBe(1);
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["renamed"]);
  await expect(page.locator(".todo-list li")).toHaveCount(1);
});

test("S21 TodoMVC — clicking outside the edit input commits and exits edit mode", async ({
  page,
}) => {
  await gotoTodo(page, server.baseUrl, "/");
  await page.locator(".new-todo").fill("a");
  await page.locator(".new-todo").press("Enter");
  await expect(page.locator(".todo-list li")).toHaveCount(1);

  await todoRow(page, "a").locator("label").click();
  const editInput = todoRow(page, "a").locator("input.edit");
  await expect(editInput).toBeVisible();
  await editInput.fill("b");
  await page.locator(".new-todo").click();

  await expect(todoRow(page, "b").locator("input.edit")).toHaveCount(0);
  await expect(todoRow(page, "b").locator("label")).toHaveText("b");
  await expect.poll(() => fileCount(), { timeout: 5000 }).toBe(1);
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["b"]);
  await expect(page.locator(".todo-list li")).toHaveCount(1);
});

test("S22 TodoMVC — Escape exits edit mode and reverts the value", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  await page.locator(".new-todo").fill("keep");
  await page.locator(".new-todo").press("Enter");
  await expect(page.locator(".todo-list li")).toHaveCount(1);

  await todoRow(page, "keep").locator("label").click();
  const editInput = todoRow(page, "keep").locator("input.edit");
  await expect(editInput).toBeVisible();

  await editInput.fill("discarded");
  await editInput.press("Escape");

  await expect(todoRow(page, "keep").locator("input.edit")).toHaveCount(0);
  await expect(todoRow(page, "keep").locator("label")).toHaveText("keep");
  await expect
    .poll(() => fileTitles(), { timeout: 5000 })
    .toEqual(expect.arrayContaining(["keep"]));
  await expect.poll(() => fileTitles(), { timeout: 5000 }).not.toContain("discarded");
});

test("S23 TodoMVC — new-todo input keeps focus after Enter (rapid entry)", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  const newTodo = page.locator(".new-todo");
  await newTodo.click();
  await newTodo.fill("first");
  await newTodo.press("Enter");
  await expect(page.locator(".todo-list li")).toHaveCount(1);

  // Focus must survive the rerender so the user can keep typing without
  // re-clicking. Mirrors the scroll-restore contract: snapshot-and-restore
  // around innerHTML replacement.
  await expect(newTodo).toBeFocused();
  await expect(newTodo).toHaveValue("");

  // Smoke: typing more goes straight into the same input without an extra click.
  await page.keyboard.type("second");
  await page.keyboard.press("Enter");
  await expect(page.locator(".todo-list li")).toHaveCount(2);
  await expect(newTodo).toBeFocused();
});

test("S24 TodoMVC — single click enters edit mode focused with cursor at end", async ({ page }) => {
  await gotoTodo(page, server.baseUrl, "/");
  await page.locator(".new-todo").fill("hello world");
  await page.locator(".new-todo").press("Enter");
  await expect(page.locator(".todo-list li")).toHaveCount(1);

  // ONE click enters edit mode AND focuses the input AND positions cursor at end.
  // The previous behaviour required a second click to focus.
  await todoRow(page, "hello world").locator("label").click();
  const editInput = todoRow(page, "hello world").locator("input.edit");
  await expect(editInput).toBeVisible();
  await expect(editInput).toBeFocused();

  // Cursor must be at end-of-value: typing appends, doesn't overwrite or
  // insert in the middle.
  await page.keyboard.type("!!");
  await editInput.press("Enter");
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["hello world!!"]);
});

test("S25 TodoMVC — Tab in edit mode commits and moves to next row in edit mode", async ({
  page,
}) => {
  await gotoTodo(page, server.baseUrl, "/");
  for (const [i, title] of ["one", "two", "three"].entries()) {
    await page.locator(".new-todo").fill(title);
    await page.locator(".new-todo").press("Enter");
    await expect(page.locator(".todo-list li")).toHaveCount(i + 1);
  }

  // Click first row to enter edit mode.
  await todoRow(page, "one").locator("label").click();
  await expect(todoRow(page, "one").locator("input.edit")).toBeFocused();

  // Type a rename, press Tab → row 1 commits, row 2 enters edit mode focused.
  await page.keyboard.type("-edited");
  await page.keyboard.press("Tab");
  await expect(todoRow(page, "two").locator("input.edit")).toBeFocused();
  await expect
    .poll(() => fileTitles(), { timeout: 5000 })
    .toEqual(["one-edited", "three", "two"].sort());

  // Tab again → row 3 in edit mode (no value change for row 2).
  await page.keyboard.press("Tab");
  await expect(todoRow(page, "three").locator("input.edit")).toBeFocused();

  // Shift+Tab → row 2 in edit mode.
  await page.keyboard.press("Shift+Tab");
  await expect(todoRow(page, "two").locator("input.edit")).toBeFocused();

  // Shift+Tab → row 1 in edit mode (row 1 is row 2's previous sibling).
  await page.keyboard.press("Shift+Tab");
  await expect(todoRow(page, "one-edited").locator("input.edit")).toBeFocused();
});

test("S26 TodoMVC — Tab from last row commits and exits edit mode (no further row)", async ({
  page,
}) => {
  await gotoTodo(page, server.baseUrl, "/");
  await page.locator(".new-todo").fill("only");
  await page.locator(".new-todo").press("Enter");
  await expect(page.locator(".todo-list li")).toHaveCount(1);

  await todoRow(page, "only").locator("label").click();
  const editInput = todoRow(page, "only").locator("input.edit");
  await expect(editInput).toBeFocused();
  await page.keyboard.type("-end");
  await page.keyboard.press("Tab");

  // No next row → edit mode falls through; commit still persists via blur.
  await expect.poll(() => fileTitles(), { timeout: 5000 }).toEqual(["only-end"]);
});
