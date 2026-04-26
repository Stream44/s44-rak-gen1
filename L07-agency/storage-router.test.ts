import { describe, expect, mock, spyOn, test } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { IntentProcessor, type SubmittedEvent } from "./intent.ts";
import { createStorageRouter, type StorageRouterInput } from "./storage-router.ts";
import type { AppendOnlyJournal } from "../L08-kinds/storage-space/append-only-journal.ts";
import type { KeyedValueStore } from "../L08-kinds/storage-space/keyed-value.ts";
import type { StorageBindingDef } from "../L14-hosts/projection-runtime/sds-schema.ts";

class MemoryKeyedSpace implements KeyedValueStore {
  readonly data = new Map<string, Map<string, unknown>>();
  readonly meta = new Map<string, { schemaVersion?: string }>();
  readonly puts: Array<{ bindingName: string; key: string; value: unknown }> = [];
  flushCount = 0;
  constructor(private readonly flushImpl?: () => Promise<void>) {}

  async open() {}
  setBindingMeta(bindingName: string, meta: { schemaVersion?: string }) {
    this.meta.set(bindingName, meta);
  }
  get(bindingName: string, key: string) {
    return this.data.get(bindingName)?.get(key);
  }
  put(bindingName: string, key: string, value: unknown) {
    const binding = this.data.get(bindingName) ?? new Map<string, unknown>();
    binding.set(key, value);
    this.data.set(bindingName, binding);
    this.puts.push({ bindingName, key, value });
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
    await this.flushImpl?.();
  }
  async close() {}
}

class MemoryJournalSpace implements AppendOnlyJournal {
  readonly entries = new Map<string, Record<string, unknown>[]>();
  readonly meta = new Map<string, { schemaVersion?: string }>();
  flushCount = 0;
  constructor(private readonly flushImpl?: () => Promise<void>) {}

  async open() {}
  setBindingMeta(bindingName: string, meta: { schemaVersion?: string }) {
    this.meta.set(bindingName, meta);
  }
  append(bindingName: string, entry: Record<string, unknown>) {
    const current = this.entries.get(bindingName) ?? [];
    current.push({
      ...entry,
      "@binding": bindingName,
      ...(this.meta.get(bindingName)?.schemaVersion
        ? { "@schemaVersion": this.meta.get(bindingName)?.schemaVersion }
        : {}),
    });
    this.entries.set(bindingName, current);
  }
  async *scanFrom(bindingName: string, cursor: string | undefined) {
    yield* this.scanFromSync(bindingName, cursor);
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
    await this.flushImpl?.();
  }
  async close() {}
}

function makeProcessor(): IntentProcessor {
  return new IntentProcessor(AlgebraicKernel.create());
}

function makeEvent(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  return {
    kind: "submitted",
    id: "evt-1",
    entity: "Todo",
    targetMachine: undefined,
    verb: "add",
    type: "event://tests/AddTodo/1.0",
    source: "",
    targetKey: "todo-1",
    beforeState: undefined,
    afterState: { title: "Write tests", completed: false },
    payload: { id: "todo-1", title: "Write tests", completed: false },
    at: "2026-04-24T00:00:00.000Z",
    causationKey: "intent-1",
    data: {
      previousState: undefined,
      newState: { title: "Write tests", completed: false },
      payload: { id: "todo-1", title: "Write tests", completed: false },
    },
    causedBy: "intent-1",
    timestamp: "2026-04-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeRouter(
  input: Partial<StorageRouterInput> & {
    bindings: StorageBindingDef[];
    spaces: StorageRouterInput["spaces"];
  },
) {
  const processor = input.processor ?? makeProcessor();
  return {
    processor,
    router: createStorageRouter({
      bindings: input.bindings,
      spaces: input.spaces,
      processor,
      schemaEmitter: input.schemaEmitter ?? {
        contextFor: (binding) => `type://tests/${binding.name}/1.0`,
      },
    }),
  };
}

describe("storage-router", () => {
  test("routes entityCollection writes through stored and derived sugar", () => {
    const space = new MemoryKeyedSpace();
    const { router, processor } = makeRouter({
      bindings: [
        {
          name: "todo-records",
          space: "todos",
          aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
          shape: { stored: ["title", "completed"], derived: { id: "$key" } },
        },
      ],
      spaces: new Map([["todos", space]]),
    });

    router.route(makeEvent());

    expect(space.snapshot("todo-records")).toEqual({
      "todo-1": { title: "Write tests", completed: false },
    });
    expect(processor.readStoreForBinding("todo-records", "todo-1")).toEqual({
      title: "Write tests",
      completed: false,
      id: "todo-1",
    });
    expect(space.meta.get("todo-records")).toEqual({
      schemaVersion: "type://tests/todo-records/1.0",
    });
  });

  test("stateMachineAggregate honors snapshot cadence", () => {
    const space = new MemoryKeyedSpace();
    const { router, processor } = makeRouter({
      bindings: [
        {
          name: "order-lifecycles",
          space: "orders",
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
      spaces: new Map([["orders", space]]),
    });
    processor.setStateForBinding("order-lifecycles", "ord-1", {
      currentState: "pending",
      transitionCount: 0,
      lastTransitionAt: "2026-04-23T00:00:00.000Z",
    });

    const events = [
      makeEvent({
        entity: undefined,
        targetMachine: "OrderLifecycle",
        targetKey: "ord-1",
        beforeState: "pending",
        afterState: "pending",
        at: "2026-04-24T00:00:01.000Z",
      }),
      makeEvent({
        entity: undefined,
        targetMachine: "OrderLifecycle",
        targetKey: "ord-1",
        beforeState: "pending",
        afterState: "pending",
        at: "2026-04-24T00:00:02.000Z",
      }),
      makeEvent({
        entity: undefined,
        targetMachine: "OrderLifecycle",
        targetKey: "ord-1",
        beforeState: "pending",
        afterState: "pending",
        at: "2026-04-24T00:00:03.000Z",
      }),
      makeEvent({
        entity: undefined,
        targetMachine: "OrderLifecycle",
        targetKey: "ord-1",
        beforeState: "pending",
        afterState: "paid",
        at: "2026-04-24T00:00:04.000Z",
      }),
      makeEvent({
        entity: undefined,
        targetMachine: "OrderLifecycle",
        targetKey: "ord-1",
        beforeState: "paid",
        afterState: "paid",
        at: "2026-04-24T00:00:05.000Z",
      }),
    ];

    for (const event of events) router.route(event);

    expect(space.puts).toHaveLength(2);
    expect(space.snapshot("order-lifecycles")).toEqual({
      "ord-1": {
        currentState: "paid",
        transitionCount: 4,
        lastTransitionAt: "2026-04-24T00:00:04.000Z",
      },
    });
  });

  test("eventJournal matches machine, entity, and catch-all bindings", () => {
    const journal = new MemoryJournalSpace();
    const { router } = makeRouter({
      bindings: [
        {
          name: "machine-events",
          space: "journal",
          aspect: { kind: "eventJournal", machine: "OrderLifecycle" },
          shape: { stored: "$self" },
        },
        {
          name: "entity-events",
          space: "journal",
          aspect: { kind: "eventJournal", entity: "Order" },
          shape: { stored: "$self" },
        },
        {
          name: "all-events",
          space: "journal",
          aspect: { kind: "eventJournal" },
          shape: { stored: "$self" },
        },
      ],
      spaces: new Map([["journal", journal]]),
    });

    router.route(
      makeEvent({
        entity: "Order",
        targetMachine: "OrderLifecycle",
        targetKey: "ord-1",
        verb: "confirm",
        beforeState: { status: "pending" },
        afterState: { status: "confirmed" },
        payload: { orderId: "ord-1" },
      }),
    );

    expect(journal.entries.get("machine-events")).toHaveLength(1);
    expect(journal.entries.get("entity-events")).toHaveLength(1);
    expect(journal.entries.get("all-events")).toHaveLength(1);
  });

  test("bindingFor matches entity, machine, and aspect kind filters", () => {
    const { router } = makeRouter({
      bindings: [
        {
          name: "todo-records",
          space: "todos",
          aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
          shape: { stored: "$self" },
        },
        {
          name: "order-lifecycles",
          space: "orders",
          aspect: { kind: "stateMachineAggregate", machine: "OrderLifecycle", keyField: "id" },
          shape: { stored: "$self" },
        },
      ],
      spaces: new Map([
        ["todos", new MemoryKeyedSpace()],
        ["orders", new MemoryKeyedSpace()],
      ]),
    });

    expect(router.bindingFor({ entity: "Todo" })?.name).toBe("todo-records");
    expect(
      router.bindingFor({ machine: "OrderLifecycle", aspectKind: "stateMachineAggregate" })?.name,
    ).toBe("order-lifecycles");
    expect(router.bindingFor({ entity: "Missing" })).toBeUndefined();
  });

  test("hydrate rehydrates records through derived sugar into namespaced state", async () => {
    const space = new MemoryKeyedSpace();
    space.hydrate("todo-records", {
      "todo-1": { title: "Recovered", completed: true },
    });
    const { router, processor } = makeRouter({
      bindings: [
        {
          name: "todo-records",
          space: "todos",
          aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
          shape: { stored: ["title", "completed"], derived: { id: "$key" } },
        },
      ],
      spaces: new Map([["todos", space]]),
    });

    await router.hydrate();

    expect(processor.readStoreForBinding("todo-records", "todo-1")).toEqual({
      title: "Recovered",
      completed: true,
      id: "todo-1",
    });
  });

  test("hydrate replays companion journal entries newer than lastTransitionAt", async () => {
    const snapshots = new MemoryKeyedSpace();
    snapshots.hydrate("order-lifecycles", {
      "ord-1": {
        currentState: "pending",
        transitionCount: 1,
        lastTransitionAt: "2026-04-24T00:00:01.000Z",
      },
    });
    const journal = new MemoryJournalSpace();
    journal.append("order-events", {
      aggregateKey: "ord-1",
      at: "2026-04-24T00:00:01.000Z",
      afterState: {
        currentState: "pending",
        transitionCount: 1,
        lastTransitionAt: "2026-04-24T00:00:01.000Z",
      },
    });
    journal.append("order-events", {
      aggregateKey: "ord-1",
      at: "2026-04-24T00:00:02.000Z",
      afterState: {
        currentState: "paid",
        transitionCount: 2,
        lastTransitionAt: "2026-04-24T00:00:02.000Z",
      },
    });

    const { router, processor } = makeRouter({
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
        ["snapshots", snapshots],
        ["journal", journal],
      ]),
    });

    await router.hydrate();

    expect(processor.readStoreForBinding("order-lifecycles", "ord-1")).toEqual({
      currentState: "paid",
      transitionCount: 2,
      lastTransitionAt: "2026-04-24T00:00:02.000Z",
    });
  });

  test("onTransactionCommit warns once for multi-space transactions", async () => {
    const warn = spyOn(console, "warn").mockImplementation(mock(() => {}));
    const { router } = makeRouter({
      bindings: [
        {
          name: "todo-records",
          space: "todos",
          aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
          shape: { stored: "$self" },
        },
        {
          name: "all-events",
          space: "journal",
          aspect: { kind: "eventJournal" },
          shape: { stored: "$self" },
        },
      ],
      spaces: new Map([
        ["todos", new MemoryKeyedSpace()],
        ["journal", new MemoryJournalSpace()],
      ]),
    });

    router.route(makeEvent());
    await router.onTransactionCommit({
      kind: "transactionCommitted",
      id: "evt",
      transactionId: "tx-1",
      events: [],
      timestamp: "2026-04-24T00:00:00.000Z",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("onTransactionCommit logs flush failures and still flushes other spaces", async () => {
    const error = spyOn(console, "error").mockImplementation(mock(() => {}));
    const ok = new MemoryKeyedSpace();
    const bad = new MemoryJournalSpace(async () => {
      throw new Error("boom");
    });
    const { router } = makeRouter({
      bindings: [
        {
          name: "todo-records",
          space: "todos",
          aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
          shape: { stored: "$self" },
        },
        {
          name: "all-events",
          space: "journal",
          aspect: { kind: "eventJournal" },
          shape: { stored: "$self" },
        },
      ],
      spaces: new Map([
        ["todos", ok],
        ["journal", bad],
      ]),
    });

    router.route(makeEvent());
    await router.onTransactionCommit({
      kind: "transactionCommitted",
      id: "evt",
      transactionId: "tx-2",
      events: [],
      timestamp: "2026-04-24T00:00:00.000Z",
    });

    expect(ok.flushCount).toBe(1);
    expect(bad.flushCount).toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
