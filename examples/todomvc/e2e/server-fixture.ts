import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { parse as parseYaml } from "yaml";

const testDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(testDir, "..");
const packageDir = resolve(exampleDir, "../..");
const rakPath = resolve(packageDir, "bin", "rak.ts");

// The runtime data file's path is declared once, in this example's sds.yaml,
// at storageSpaces[name=todos-fs].path. Read it here so tests don't duplicate
// the path constant. If sds.yaml's storage-space path moves, this discovers it.
// Uses the `yaml` package rather than Bun.YAML because Playwright runs tests
// under Node, where `Bun` is undefined.
const sds = parseYaml(readFileSync(resolve(exampleDir, "sds.yaml"), "utf-8")) as {
  storageSpaces: Array<{ name: string; path: string }>;
};
const todosSpace = sds.storageSpaces.find((s) => s.name === "todos-fs");
if (!todosSpace) throw new Error('todomvc/sds.yaml is missing storageSpaces[name="todos-fs"]');
export const todoDataFile = resolve(exampleDir, todosSpace.path);
const todoStateFile = resolve(exampleDir, ".o", "local", "model", "todomvc.state.json");

function resetTodoFiles(): void {
  rmSync(todoDataFile, { force: true });
  rmSync(todoStateFile, { force: true });
}

async function waitForServer(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for TodoMVC server at ${baseUrl}`);
}

function nextPort(): number {
  return 46_000 + Math.floor(Math.random() * 1000);
}

export type TodoServerHandle = {
  baseUrl: string;
  stop: () => Promise<void>;
};

export async function bootTodoServer(): Promise<TodoServerHandle> {
  resetTodoFiles();
  const port = nextPort();
  const child = spawn("bun", [rakPath, "serve", "--example", "todomvc", "--port", String(port)], {
    cwd: packageDir,
    stdio: "ignore",
  }) as ChildProcessWithoutNullStreams;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(baseUrl);
  } catch (error) {
    child.kill("SIGKILL");
    throw error;
  }
  return {
    baseUrl,
    async stop() {
      resetTodoFiles();
      child.kill("SIGTERM");
      await new Promise<void>((resolveStop) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 2_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolveStop();
        });
      });
      resetTodoFiles();
    },
  };
}

export async function gotoTodo(page: Page, baseUrl: string, path = "/"): Promise<void> {
  await page.goto(new URL(path, `${baseUrl}/`).toString());
}
