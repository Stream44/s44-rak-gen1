import { describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AlgebraicKernel } from "../../L13-facade/index.ts";
import { IntentProcessor, type SubmittedEvent } from "../../L07-agency/intent.ts";
import { createStorageRouter } from "../../L07-agency/storage-router.ts";
import { createFilesystemJournalSpace } from "../../L08-kinds/filesystem-journal-space/filesystem-journal-space.ts";
import { createFilesystemSpace } from "../../L08-kinds/filesystem-space/filesystem-space.ts";
import type { AppendOnlyJournal } from "../../L08-kinds/storage-space/append-only-journal.ts";
import type { KeyedValueStore } from "../../L08-kinds/storage-space/keyed-value.ts";
import type { StorageBindingDef } from "./sds-schema.ts";
import { bootNode } from "./boot-node.ts";

async function withTmpDir(run: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "storage-integration-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeEvent(overrides: Partial<SubmittedEvent>): SubmittedEvent {
  return {
    kind: "submitted",
    id: "evt-1",
    entity: "Todo",
    targetMachine: undefined,
    verb: "add",
    type: "event://tests/Action/1.0",
    source: "",
    targetKey: "key-1",
    beforeState: undefined,
    afterState: { title: "Write tests", completed: false },
    payload: { id: "key-1", title: "Write tests", completed: false },
    at: "2026-04-24T00:00:00.000Z",
    causationKey: "intent-1",
    data: {
      previousState: undefined,
      newState: { title: "Write tests", completed: false },
      payload: { id: "key-1", title: "Write tests", completed: false },
    },
    causedBy: "intent-1",
    timestamp: "2026-04-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeRouter(
  bindings: StorageBindingDef[],
  spaces: Map<string, KeyedValueStore | AppendOnlyJournal>,
) {
  const processor = new IntentProcessor(AlgebraicKernel.create());
  return createStorageRouter({
    bindings,
    spaces,
    processor,
    schemaEmitter: { contextFor: (binding) => `type://tests/${binding.name}/1.0` },
  });
}

function writeTodoModel(dir: string): void {
  writeFileSync(
    join(dir, "todo.model.yaml"),
    `model: todo
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/todo"
entities:
  Todo:
    attributes:
      id:
        type: string
      title:
        type: string
      completed:
        type: boolean
actions:
  AddTodo:
    verb: add
    kind: create
    keyField: id
    inputSchema:
      type: object
      required: [id, title, completed]
      properties:
        id:
          type: string
        title:
          type: string
        completed:
          type: boolean
`,
    "utf8",
  );
}

function writeOrderModel(dir: string): void {
  writeFileSync(
    join(dir, "order.model.yaml"),
    `model: order
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/order"
entities:
  Order:
    attributes:
      id:
        type: string
      number:
        type: string
actions:
  CreateOrder:
    verb: create
    kind: create
    keyField: id
    inputSchema:
      type: object
      required: [id, number]
      properties:
        id:
          type: string
        number:
          type: string
`,
    "utf8",
  );
}

describe("storage integration", () => {
  test("single binding round-trip writes the compact JSON-LD envelope", async () => {
    await withTmpDir(async (dir) => {
      writeTodoModel(dir);
      writeFileSync(
        join(dir, "sds.yaml"),
        `name: todo-node
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/todo-node"
models:
  - path: ./todo.model.yaml
    initialBinding: true
storageSpaces:
  - name: todo-fs
    kind: filesystem
    path: ./todo-state.json
    debounceMs: 0
bindings:
  - name: todo-records
    space: todo-fs
    aspect:
      kind: entityCollection
      entity: Todo
      keyField: id
    shape:
      stored: [title, completed]
      derived:
        id: "$key"
`,
        "utf8",
      );

      const runtime = bootNode(dir);
      await runtime.app.submit("add", "todo-1", {
        id: "todo-1",
        title: "Write tests",
        completed: false,
      });
      runtime.dispose();

      const blob = JSON.parse(readFileSync(join(dir, "todo-state.json"), "utf8")) as Record<
        string,
        unknown
      >;
      expect(blob["@context"]).toBe(
        "https://github.com/Stream44/s44-rak-gen1@1.0/L08-kinds/filesystem-space/1.0",
      );
      expect(blob["@binding"]).toBe("todo-records");
      expect(blob.records).toEqual({
        "todo-1": { title: "Write tests", completed: false },
      });
    });
  });

  test("multi-binding one space writes the @bindings envelope", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "multi.json");
      const space = createFilesystemSpace({ name: "core", path, debounceMs: 0 });
      const router = makeRouter(
        [
          {
            name: "order-records",
            space: "core",
            aspect: { kind: "entityCollection", entity: "Order", keyField: "id" },
            shape: { stored: ["number"] },
          },
          {
            name: "order-lifecycles",
            space: "core",
            aspect: { kind: "stateMachineAggregate", machine: "OrderLifecycle", keyField: "id" },
            shape: {
              stored: ["currentState", "transitionCount", "lastTransitionAt"],
              derived: "$stored",
            },
          },
        ],
        new Map([["core", space]]),
      );

      router.route(
        makeEvent({
          entity: "Order",
          targetKey: "ord-1",
          afterState: { id: "ord-1", number: "1001" },
          payload: { id: "ord-1", number: "1001" },
        }),
      );
      router.route(
        makeEvent({
          entity: undefined,
          targetMachine: "OrderLifecycle",
          targetKey: "ord-1",
          verb: "confirm",
          beforeState: "pending",
          afterState: "confirmed",
          payload: { orderId: "ord-1" },
          at: "2026-04-24T00:00:01.000Z",
        }),
      );
      await router.close();

      const blob = JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
      expect(blob["@bindings"]).toEqual({
        "order-records": {
          "@schemaVersion": "type://tests/order-records/1.0",
          "records": {
            "ord-1": { number: "1001" },
          },
        },
        "order-lifecycles": {
          "@schemaVersion": "type://tests/order-lifecycles/1.0",
          "records": {
            "ord-1": {
              currentState: "confirmed",
              transitionCount: 1,
              lastTransitionAt: "2026-04-24T00:00:01.000Z",
            },
          },
        },
      });
    });
  });

  test("state-machine snapshot cadence writes on cadence hit and state change", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "cadence.json");
      const real = createFilesystemSpace({ name: "snapshots", path, debounceMs: 0 });
      let putCount = 0;
      const space: KeyedValueStore = {
        ...real,
        put(bindingName, key, value) {
          putCount += 1;
          real.put(bindingName, key, value);
        },
      };
      const router = makeRouter(
        [
          {
            name: "order-lifecycles",
            space: "snapshots",
            aspect: {
              kind: "stateMachineAggregate",
              machine: "OrderLifecycle",
              keyField: "id",
              snapshotEvery: 3,
            },
            shape: {
              stored: ["currentState", "transitionCount", "lastTransitionAt"],
              derived: "$stored",
            },
          },
        ],
        new Map([["snapshots", space]]),
      );

      router.route(
        makeEvent({
          entity: undefined,
          targetMachine: "OrderLifecycle",
          targetKey: "ord-1",
          beforeState: "pending",
          afterState: "pending",
          at: "2026-04-24T00:00:01.000Z",
        }),
      );
      router.route(
        makeEvent({
          entity: undefined,
          targetMachine: "OrderLifecycle",
          targetKey: "ord-1",
          beforeState: "pending",
          afterState: "pending",
          at: "2026-04-24T00:00:02.000Z",
        }),
      );
      router.route(
        makeEvent({
          entity: undefined,
          targetMachine: "OrderLifecycle",
          targetKey: "ord-1",
          beforeState: "pending",
          afterState: "pending",
          at: "2026-04-24T00:00:03.000Z",
        }),
      );
      router.route(
        makeEvent({
          entity: undefined,
          targetMachine: "OrderLifecycle",
          targetKey: "ord-1",
          beforeState: "pending",
          afterState: "paid",
          at: "2026-04-24T00:00:04.000Z",
        }),
      );
      router.route(
        makeEvent({
          entity: undefined,
          targetMachine: "OrderLifecycle",
          targetKey: "ord-1",
          beforeState: "paid",
          afterState: "paid",
          at: "2026-04-24T00:00:05.000Z",
        }),
      );

      expect(putCount).toBe(2);
    });
  });

  test("event journal append + scan works with cursors", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "journal.ndjson");
      const journal = createFilesystemJournalSpace({ name: "orders", path, debounceMs: 0 });
      await journal.open({});
      journal.setBindingMeta?.("order-events", { schemaVersion: "type://tests/order-events/1.0" });
      journal.append("order-events", { verb: "create", aggregateKey: "ord-1" });
      await journal.flush?.();
      journal.append("order-events", { verb: "confirm", aggregateKey: "ord-1" });
      await journal.flush?.();
      const cursor = journal.latestCursor("order-events");
      journal.append("order-events", { verb: "pay", aggregateKey: "ord-1" });
      await journal.flush?.();

      const all: Record<string, unknown>[] = [];
      for await (const entry of journal.scanFrom("order-events", undefined)) all.push(entry);
      const tail: Record<string, unknown>[] = [];
      for await (const entry of journal.scanFrom("order-events", cursor)) tail.push(entry);

      expect(all).toHaveLength(3);
      expect(tail).toEqual([
        {
          "@binding": "order-events",
          "@schemaVersion": "type://tests/order-events/1.0",
          "verb": "pay",
          "aggregateKey": "ord-1",
        },
      ]);
    });
  });

  test("hydrate + replay restores the latest aggregate state", async () => {
    await withTmpDir(async (dir) => {
      const snapshots = createFilesystemSpace({
        name: "snapshots",
        path: join(dir, "snapshots.json"),
        debounceMs: 0,
      });
      const journal = createFilesystemJournalSpace({
        name: "journal",
        path: join(dir, "journal.ndjson"),
        debounceMs: 0,
      });
      await snapshots.open({});
      await journal.open({});
      snapshots.setBindingMeta?.("order-lifecycles", {
        schemaVersion: "type://tests/order-lifecycles/1.0",
      });
      journal.setBindingMeta?.("order-events", { schemaVersion: "type://tests/order-events/1.0" });
      snapshots.put("order-lifecycles", "ord-1", {
        currentState: "pending",
        transitionCount: 1,
        lastTransitionAt: "2026-04-24T00:00:01.000Z",
      });
      await snapshots.flush?.();
      journal.append("order-events", {
        aggregateKey: "ord-1",
        at: "2026-04-24T00:00:02.000Z",
        afterState: {
          currentState: "paid",
          transitionCount: 2,
          lastTransitionAt: "2026-04-24T00:00:02.000Z",
        },
      });
      await journal.flush?.();

      const processor = new IntentProcessor(AlgebraicKernel.create());
      const router = createStorageRouter({
        bindings: [
          {
            name: "order-lifecycles",
            space: "snapshots",
            aspect: { kind: "stateMachineAggregate", machine: "OrderLifecycle", keyField: "id" },
            shape: {
              stored: ["currentState", "transitionCount", "lastTransitionAt"],
              derived: "$stored",
            },
          },
          {
            name: "order-events",
            space: "journal",
            aspect: { kind: "eventJournal", machine: "OrderLifecycle" },
            shape: { stored: "$self" },
          },
        ],
        spaces: new Map([
          [
            "snapshots",
            createFilesystemSpace({
              name: "snapshots",
              path: join(dir, "snapshots.json"),
              debounceMs: 0,
            }),
          ],
          [
            "journal",
            createFilesystemJournalSpace({
              name: "journal",
              path: join(dir, "journal.ndjson"),
              debounceMs: 0,
            }),
          ],
        ]),
        processor,
        schemaEmitter: { contextFor: (binding) => `type://tests/${binding.name}/1.0` },
      });

      await router.hydrate();

      expect(processor.readStoreForBinding("order-lifecycles", "ord-1")).toEqual({
        currentState: "paid",
        transitionCount: 2,
        lastTransitionAt: "2026-04-24T00:00:02.000Z",
      });
    });
  });

  test("transaction banner fires exactly once for app.batch touching two spaces", async () => {
    await withTmpDir(async (dir) => {
      writeTodoModel(dir);
      writeFileSync(
        join(dir, "sds.yaml"),
        `name: todo-batch-node
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/todo-batch-node"
models:
  - path: ./todo.model.yaml
    initialBinding: true
storageSpaces:
  - name: records
    kind: filesystem
    path: ./records.json
    debounceMs: 0
  - name: journal
    kind: filesystem-journal
    path: ./events.ndjson
    debounceMs: 0
bindings:
  - name: todo-records
    space: records
    aspect:
      kind: entityCollection
      entity: Todo
      keyField: id
    shape:
      stored: [title, completed]
  - name: todo-events
    space: journal
    aspect:
      kind: eventJournal
    shape:
      stored: "$self"
`,
        "utf8",
      );
      const warn = spyOn(console, "warn").mockImplementation(mock(() => {}));

      const runtime = bootNode(dir);
      await runtime.app.batch([
        { verb: "add", target: "todo-1", payload: { id: "todo-1", title: "A", completed: false } },
        { verb: "add", target: "todo-2", payload: { id: "todo-2", title: "B", completed: true } },
      ]);
      runtime.dispose();

      expect(
        warn.mock.calls.filter((call) => String(call[0]).includes("eventual atomicity only")),
      ).toHaveLength(1);
      warn.mockRestore();
    });
  });

  test("legacy persistence shorthand boots and logs one deprecation warning", async () => {
    await withTmpDir(async (dir) => {
      writeTodoModel(dir);
      writeFileSync(
        join(dir, "sds.yaml"),
        `name: todo-legacy-node
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/todo-legacy-node"
persistence:
  kind: filesystem
  path: ./legacy.json
  debounceMs: 0
models:
  - path: ./todo.model.yaml
    initialBinding: true
`,
        "utf8",
      );
      const warn = spyOn(console, "warn").mockImplementation(mock(() => {}));

      const runtime = bootNode(dir);
      await runtime.app.submit("add", "todo-1", {
        id: "todo-1",
        title: "Legacy",
        completed: false,
      });
      runtime.dispose();

      const blob = JSON.parse(readFileSync(join(dir, "legacy.json"), "utf8")) as Record<
        string,
        any
      >;
      expect(blob["@binding"]).toBe("default");
      expect(blob.records["todo-1"]).toEqual({ id: "todo-1", title: "Legacy", completed: false });
      expect(
        warn.mock.calls.filter((call) =>
          String(call[0]).includes("auto-desugaring to storageSpaces + bindings"),
        ),
      ).toHaveLength(1);
      warn.mockRestore();
    });
  });

  test("flush failure does not rollback other spaces", async () => {
    const good: KeyedValueStore = {
      ...createFilesystemSpace({
        name: "good",
        path: join(tmpdir(), `good-${Date.now()}.json`),
        debounceMs: 0,
      }),
      flush: mock(async () => {}),
    };
    const bad: AppendOnlyJournal = {
      ...createFilesystemJournalSpace({
        name: "bad",
        path: join(tmpdir(), `bad-${Date.now()}.ndjson`),
        debounceMs: 0,
      }),
      flush: mock(async () => {
        throw new Error("boom");
      }),
    };
    const error = spyOn(console, "error").mockImplementation(mock(() => {}));
    const router = makeRouter(
      [
        {
          name: "todo-records",
          space: "good",
          aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
          shape: { stored: "$self" },
        },
        {
          name: "todo-events",
          space: "bad",
          aspect: { kind: "eventJournal" },
          shape: { stored: "$self" },
        },
      ],
      new Map([
        ["good", good],
        ["bad", bad],
      ]),
    );

    router.route(makeEvent({ entity: "Todo" }));
    await expect(
      router.onTransactionCommit({
        kind: "transactionCommitted",
        id: "evt",
        transactionId: "tx-1",
        events: [],
        timestamp: "2026-04-24T00:00:00.000Z",
      }),
    ).resolves.toBeUndefined();

    expect((good.flush as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect((bad.flush as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
