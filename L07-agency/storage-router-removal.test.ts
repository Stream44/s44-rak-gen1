import { describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AlgebraicKernel, IntentProcessor } from "../L13-facade/index.ts";
import { bootNode } from "../L14-hosts/projection-runtime/index.ts";
import type { StorageBindingDef } from "../L14-hosts/projection-runtime/sds-schema.ts";
import type { AppendOnlyJournal } from "../L08-kinds/storage-space/append-only-journal.ts";
import type { KeyedValueStore } from "../L08-kinds/storage-space/keyed-value.ts";
import { createStorageRouter } from "./storage-router.ts";
import type { RemovedEvent, TransactionCommittedEvent } from "./intent.ts";

class MemoryKeyedSpace implements KeyedValueStore {
  readonly data = new Map<string, Map<string, unknown>>();
  flushCount = 0;

  async open() {}
  get(bindingName: string, key: string) {
    return this.data.get(bindingName)?.get(key);
  }
  put(bindingName: string, key: string, value: unknown) {
    const binding = this.data.get(bindingName) ?? new Map<string, unknown>();
    binding.set(key, value);
    this.data.set(bindingName, binding);
  }
  delete(bindingName: string, key: string) {
    this.data.get(bindingName)?.delete(key);
  }
  has(bindingName: string, key: string) {
    return this.data.get(bindingName)?.has(key) ?? false;
  }
  snapshot(bindingName: string) {
    return Object.fromEntries(this.data.get(bindingName) ?? new Map<string, unknown>());
  }
  hydrate(bindingName: string, records: Record<string, unknown>) {
    this.data.set(bindingName, new Map(Object.entries(records)));
  }
  async flush() {
    this.flushCount += 1;
  }
  async close() {}
}

class MemoryJournalSpace implements AppendOnlyJournal {
  readonly entries = new Map<string, Record<string, unknown>[]>();
  flushCount = 0;

  async open() {}
  append(bindingName: string, entry: Record<string, unknown>) {
    const current = this.entries.get(bindingName) ?? [];
    current.push(entry);
    this.entries.set(bindingName, current);
  }
  async *scanFrom(bindingName: string, cursor: string | undefined) {
    yield* this.scanFromSync?.(bindingName, cursor) ?? [];
  }
  *scanFromSync(bindingName: string, cursor: string | undefined) {
    const start = cursor === undefined ? 0 : Number(cursor) + 1;
    const current = this.entries.get(bindingName) ?? [];
    for (let index = start; index < current.length; index += 1) yield current[index];
  }
  latestCursor(bindingName: string) {
    const current = this.entries.get(bindingName) ?? [];
    return current.length > 0 ? String(current.length - 1) : undefined;
  }
  async flush() {
    this.flushCount += 1;
  }
  async close() {}
}

const TODOMVC_MODEL = resolve(import.meta.dir, "../examples/todomvc/models/todos.model.yaml");

function parseRecords(path: string): Record<string, unknown> {
  const blob = JSON.parse(readFileSync(path, "utf8")) as { records?: Record<string, unknown> };
  return blob.records ?? {};
}

function withTmpDir(run: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "storage-router-removal-"));
  return Promise.resolve(run(dir)).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

describe("storage-router removal propagation", () => {
  test("routeRemoval deletes keyed records, appends a remove journal entry, and flushes touched spaces", async () => {
    const keyed = new MemoryKeyedSpace();
    keyed.hydrate("todo-records", {
      "todo-1": { title: "Write tests", completed: false },
    });
    const journal = new MemoryJournalSpace();
    const processor = new IntentProcessor(AlgebraicKernel.create());
    processor.setStateForBinding("todo-records", "todo-1", {
      id: "todo-1",
      title: "Write tests",
      completed: false,
    });

    const bindings: StorageBindingDef[] = [
      {
        name: "todo-records",
        space: "todos",
        aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
        shape: { stored: ["title", "completed"], derived: { id: "$key" } },
      },
      {
        name: "todo-events",
        space: "journal",
        aspect: { kind: "eventJournal", entity: "Todo" },
        shape: { stored: "$self" },
      },
    ];
    const router = createStorageRouter({
      bindings,
      spaces: new Map([
        ["todos", keyed],
        ["journal", journal],
      ]),
      processor,
    });
    const warn = spyOn(console, "warn").mockImplementation(mock(() => {}));

    router.routeRemoval({
      id: "evt-remove-1",
      kind: "removed",
      entity: "Todo",
      targetKey: "todo-1",
      at: "2026-04-24T00:00:00.000Z",
      previousState: { id: "todo-1", title: "Write tests", completed: false },
      newState: undefined,
      timestamp: "2026-04-24T00:00:00.000Z",
    });
    await router.onTransactionCommit({
      kind: "transactionCommitted",
      id: "tx-1",
      transactionId: "tx-1",
      events: [] as TransactionCommittedEvent["events"],
      timestamp: "2026-04-24T00:00:01.000Z",
    });

    expect(keyed.snapshot("todo-records")).toEqual({});
    expect(processor.readStoreForBinding("todo-records", "todo-1")).toBeUndefined();
    expect(journal.entries.get("todo-events")).toEqual([
      {
        kind: "remove",
        verb: "remove",
        aggregateKey: "todo-1",
        at: "2026-04-24T00:00:00.000Z",
      },
    ]);
    expect(keyed.flushCount).toBe(1);
    expect(journal.flushCount).toBe(1);
    warn.mockRestore();
  });

  test("DeleteTodo removes the row from the persisted JSON file", async () => {
    await withTmpDir(async (dir) => {
      const dataPath = join(dir, "todos.json");
      writeFileSync(
        join(dir, "sds.yaml"),
        `name: todomvc-removal-test
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/todomvc-removal"
models:
  - path: ${TODOMVC_MODEL}
    role: primary
    initialBinding: true
storageSpaces:
  - name: todos-fs
    kind: filesystem
    path: ${dataPath}
    format: json
    debounceMs: 0
bindings:
  - name: todo-records
    space: todos-fs
    aspect:
      kind: entityCollection
      entity: Todo
      keyField: id
    shape:
      stored: [title, completed]
      derived: { id: "$key" }
`,
        "utf8",
      );

      const runtime = bootNode(dir);
      await runtime.app.submit("add", "todo-1", {
        id: "todo-1",
        title: "Write tests",
        completed: false,
      });
      await runtime.app.submit("add", "todo-2", {
        id: "todo-2",
        title: "Ship fix",
        completed: false,
      });

      expect(parseRecords(dataPath)).toEqual({
        "todo-1": { title: "Write tests", completed: false },
        "todo-2": { title: "Ship fix", completed: false },
      });

      await runtime.app.submit("delete", "todo-1", { id: "todo-1" });

      expect(parseRecords(dataPath)).toEqual({
        "todo-2": { title: "Ship fix", completed: false },
      });

      runtime.dispose();

      const rebooted = bootNode(dir);
      expect(rebooted.app.listInstances()).toEqual([
        {
          key: "todo-2",
          state: { title: "Ship fix", completed: false, id: "todo-2" },
        },
      ]);
      rebooted.dispose();
    });
  });
});
