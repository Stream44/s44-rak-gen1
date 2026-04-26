import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendOnlyJournalContract } from "../storage-space/storage-space.test.ts";
import { createFilesystemJournalSpace } from "./filesystem-journal-space.ts";

async function withTmpDir(run: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "filesystem-journal-space-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function collectEntries(path: string): Promise<string[]> {
  return readFileSync(path, "utf8").trim().split("\n");
}

appendOnlyJournalContract("filesystem-journal-space", async () => {
  const dir = mkdtempSync(join(tmpdir(), "filesystem-journal-space-contract-"));
  const path = join(dir, "journal.ndjson");
  const store = createFilesystemJournalSpace({ name: "contract", path, debounceMs: 0 });
  await store.open({});
  return { store };
});

describe("filesystem-journal-space", () => {
  test("open with no file creates the header line", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "journal.ndjson");
      const store = createFilesystemJournalSpace({ name: "orders", path });

      await store.open({});

      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf8").trim())).toMatchObject({
        "@context":
          "https://github.com/Stream44/s44-rak-gen1@1.0/L08-kinds/filesystem-journal-space/1.0",
        "@type": "JournalHeader",
      });
    });
  });

  test("flush then re-open preserves appended entries", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "journal.ndjson");
      const first = createFilesystemJournalSpace({ name: "orders", path, debounceMs: 0 });
      await first.open({});
      first.append("orders", { verb: "submit", aggregateKey: "ord-1" });
      await first.flush?.();

      const second = createFilesystemJournalSpace({ name: "orders", path, debounceMs: 0 });
      await second.open({});

      const entries: Record<string, unknown>[] = [];
      for await (const entry of second.scanFrom("orders", undefined)) entries.push(entry);
      expect(entries).toEqual([
        { "@binding": "orders", "verb": "submit", "aggregateKey": "ord-1" },
      ]);
    });
  });

  test("append writes NDJSON lines with a per-line binding envelope", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "journal.ndjson");
      const store = createFilesystemJournalSpace({ name: "orders", path, debounceMs: 0 });
      await store.open({});

      store.append("orders", { verb: "submit", aggregateKey: "ord-1" });
      store.append("orders", { verb: "pay", aggregateKey: "ord-1" });
      await store.flush?.();

      const lines = await collectEntries(path);
      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[1])).toEqual({
        "@binding": "orders",
        "verb": "submit",
        "aggregateKey": "ord-1",
      });
      expect(JSON.parse(lines[2])).toEqual({
        "@binding": "orders",
        "verb": "pay",
        "aggregateKey": "ord-1",
      });
    });
  });
});
