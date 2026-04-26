import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keyedValueStoreContract } from "../storage-space/storage-space.test.ts";
import { createFilesystemSpace } from "./filesystem-space.ts";

async function withTmpDir(run: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "filesystem-space-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

keyedValueStoreContract("filesystem-space", async () => {
  const dir = mkdtempSync(join(tmpdir(), "filesystem-space-contract-"));
  const path = join(dir, "state.json");
  const store = createFilesystemSpace({ name: "contract", path, debounceMs: 0 });
  await store.open({});
  return { store };
});

describe("filesystem-space", () => {
  test("flush then re-open preserves the same state", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "state.json");
      const first = createFilesystemSpace({ name: "todos", path, debounceMs: 0 });
      await first.open({});
      first.put("todos", "todo-1", { done: true });
      first.put("meta", "version", 1);
      await first.flush?.();

      const second = createFilesystemSpace({ name: "todos", path });
      await second.open({});

      expect(second.snapshot("todos")).toEqual({ "todo-1": { done: true } });
      expect(second.snapshot("meta")).toEqual({ version: 1 });
    });
  });

  test("debounceMs 0 writes synchronously", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "state.json");
      const store = createFilesystemSpace({ name: "todos", path, debounceMs: 0 });
      await store.open({});

      store.put("todos", "todo-1", { done: false });

      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
        "@context": "https://github.com/Stream44/s44-rak-gen1@1.0/L08-kinds/filesystem-space/1.0",
        "@binding": "todos",
        "records": {
          "todo-1": { done: false },
        },
      });
    });
  });

  test("open tolerates legacy single-binding and bare-record blobs", async () => {
    await withTmpDir(async (dir) => {
      const singlePath = join(dir, "single.json");
      writeFileSync(
        singlePath,
        JSON.stringify({
          "@binding": "todos",
          "@schemaVersion": "kind://legacy",
          "records": { "todo-1": { done: true } },
        }),
        "utf8",
      );

      const single = createFilesystemSpace({ name: "todos", path: singlePath, debounceMs: 0 });
      await single.open({});
      expect(single.snapshot("todos")).toEqual({ "todo-1": { done: true } });

      const barePath = join(dir, "bare.json");
      writeFileSync(barePath, JSON.stringify({ records: { "todo-2": { done: false } } }), "utf8");

      const bare = createFilesystemSpace({ name: "todos", path: barePath, debounceMs: 0 });
      await bare.open({});
      expect(bare.snapshot("default")).toEqual({ "todo-2": { done: false } });
    });
  });
});
