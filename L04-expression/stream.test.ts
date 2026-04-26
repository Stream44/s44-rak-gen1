/**
 * Layer 11: KernelStream — event-driven facade tests.
 *
 * Tests the command/event streaming interface, provenance chain,
 * subscriptions, fold algebra, and integration with the kernel.
 */

import { describe, test, expect } from "bun:test";

import { KernelStream, MetaLevel, DatumValidationError } from "../L13-facade/index.ts";

import type {
  KernelCommand,
  KernelEvent,
  FoldAlgebra,
  TypeDef,
  KernelExpression,
} from "../L13-facade/index.ts";

// ═══════════════════════════════════════════════════════════════════════
// Single Command Processing
// ═══════════════════════════════════════════════════════════════════════

describe("KernelStream: Single Command Processing", () => {
  test("define a record type via command", () => {
    const stream = new KernelStream();
    const event = stream.process({
      kind: "define:record",
      name: "Person",
      version: "1.0",
      schema: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, age: { type: "integer" } },
      },
    });

    expect(event.kind).toBe("type:defined");
    if (event.kind === "type:defined") {
      expect(event.cid).toMatch(/^cid:sha256:/);
      expect(event.typeDef.id).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
      expect(event.seq).toBe(0);
      expect(event.timestamp).toBeTruthy();
    }
  });

  test("define a type via raw TypeDef command", () => {
    const stream = new KernelStream();
    const typeDef: TypeDef = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Status/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0",
      schema: { enum: ["active", "inactive"] },
    };
    const event = stream.process({ kind: "define", typeDef });

    expect(event.kind).toBe("type:defined");
    if (event.kind === "type:defined") {
      expect(event.typeDef.id).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/Status/1.0");
    }
  });

  test("define an enum type", () => {
    const stream = new KernelStream();
    const event = stream.process({
      kind: "define:enum",
      name: "Color",
      version: "1.0",
      values: ["red", "green", "blue"],
    });

    expect(event.kind).toBe("type:defined");
    if (event.kind === "type:defined") {
      expect(event.typeDef.id).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/Color/1.0");
    }
  });

  test("define batch types atomically", () => {
    const stream = new KernelStream();
    const event = stream.process({
      kind: "define:batch",
      typeDefs: [
        {
          id: "type://github.com/Stream44/s44-rak-gen1@1.0/A/1.0",
          level: MetaLevel.Model,
          conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
          schema: { type: "object", properties: { x: { type: "string" } } },
        },
        {
          id: "type://github.com/Stream44/s44-rak-gen1@1.0/B/1.0",
          level: MetaLevel.Model,
          conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
          schema: { type: "object", properties: { y: { type: "integer" } } },
        },
      ],
    });

    expect(event.kind).toBe("type:batch");
    if (event.kind === "type:batch") {
      expect(event.refs.size).toBe(2);
    }
  });

  test("validate data against a type", () => {
    const stream = new KernelStream();
    stream.process({
      kind: "define:record",
      name: "Person",
      version: "1.0",
      schema: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
    });

    const valid = stream.process({
      kind: "validate",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      data: { name: "Ada" },
    });
    expect(valid.kind).toBe("validated");
    if (valid.kind === "validated") {
      expect(valid.result.valid).toBe(true);
    }

    const invalid = stream.process({
      kind: "validate",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      data: {},
    });
    if (invalid.kind === "validated") {
      expect(invalid.result.valid).toBe(false);
    }
  });

  test("create a content-addressed datum", () => {
    const stream = new KernelStream();
    stream.process({
      kind: "define:record",
      name: "Person",
      version: "1.0",
      schema: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
    });

    const event = stream.process({
      kind: "create",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      data: { name: "Ada Lovelace" },
    });

    expect(event.kind).toBe("datum:created");
    if (event.kind === "datum:created") {
      expect(event.datum.id).toMatch(/^cid:sha256:/);
      expect(event.datum.type).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
      expect(event.datum.data).toEqual({ name: "Ada Lovelace" });
    }
  });

  test("create datum with refs (Merkle links)", () => {
    const stream = new KernelStream();
    stream.process({
      kind: "define:record",
      name: "Note",
      version: "1.0",
      schema: {
        type: "object",
        required: ["text"],
        properties: { text: { type: "string" } },
      },
    });

    const event = stream.process({
      kind: "create",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Note/1.0",
      data: { text: "hello" },
      refs: [
        { rel: "prev", target: "cid:sha256:parent123" },
        { rel: "author", target: "cid:sha256:user456" },
      ],
    });

    if (event.kind === "datum:created") {
      expect(event.datum.refs).toHaveLength(2);
      expect(event.datum.refs[0]).toEqual({
        rel: "prev",
        target: "cid:sha256:parent123",
      });
    }
  });

  test("resolve a type", () => {
    const stream = new KernelStream();
    const event = stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });

    expect(event.kind).toBe("type:resolved");
    if (event.kind === "type:resolved") {
      expect(event.typeDef.level).toBe(MetaLevel.MetaMetamodel);
    }
  });

  test("evaluate an expression", () => {
    const stream = new KernelStream();
    const event = stream.process({
      kind: "evaluate",
      expr: {
        op: "call",
        fn: "add",
        args: [
          { op: "const", value: 40 },
          { op: "const", value: 2 },
        ],
      },
    });

    expect(event.kind).toBe("evaluated");
    if (event.kind === "evaluated") {
      expect(event.result.value).toBe(42);
    }
  });

  test("evaluate with context", () => {
    const stream = new KernelStream();
    const event = stream.process({
      kind: "evaluate",
      expr: {
        op: "call",
        fn: "mul",
        args: [
          { op: "var", name: "x" },
          { op: "const", value: 2 },
        ],
      },
      context: { x: 21 },
    });

    if (event.kind === "evaluated") {
      expect(event.result.value).toBe(42);
    }
  });

  test("refine: structural + predicate validation", () => {
    const stream = new KernelStream();
    stream.process({
      kind: "define:record",
      name: "Range",
      version: "1.0",
      schema: {
        type: "object",
        required: ["start", "end"],
        properties: {
          start: { type: "integer" },
          end: { type: "integer" },
        },
      },
    });

    const predicate: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "start" },
        { op: "get", path: "end" },
      ],
    };

    // Valid: structural pass + predicate pass
    const valid = stream.process({
      kind: "refine",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Range/1.0",
      data: { start: 10, end: 20 },
      predicate,
    });
    if (valid.kind === "refined") {
      expect(valid.structural.valid).toBe(true);
      expect(valid.predicate).toBe(true);
    }

    // Invalid: structural pass + predicate fail
    const invalid = stream.process({
      kind: "refine",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Range/1.0",
      data: { start: 30, end: 10 },
      predicate,
    });
    if (invalid.kind === "refined") {
      expect(invalid.structural.valid).toBe(true);
      expect(invalid.predicate).toBe(false);
    }

    // Invalid: structural fail (predicate not run)
    const badShape = stream.process({
      kind: "refine",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Range/1.0",
      data: { start: "not-a-number", end: 10 },
      predicate,
    });
    if (badShape.kind === "refined") {
      expect(badShape.structural.valid).toBe(false);
      expect(badShape.predicate).toBeNull();
    }
  });

  test("error events for invalid operations", () => {
    const stream = new KernelStream();
    const event = stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/DoesNotExist/1.0",
    });

    expect(event.kind).toBe("error");
    if (event.kind === "error") {
      expect(event.error).toContain("not found");
    }
  });

  test("error events for invalid datum creation", () => {
    const stream = new KernelStream();
    stream.process({
      kind: "define:record",
      name: "Strict",
      version: "1.0",
      schema: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    });

    const event = stream.process({
      kind: "create",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Strict/1.0",
      data: {},
    });

    expect(event.kind).toBe("error");
    if (event.kind === "error") {
      expect(event.error).toContain("validation");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Sequence Numbers
// ═══════════════════════════════════════════════════════════════════════

describe("KernelStream: Sequence Numbers", () => {
  test("events have monotonically increasing sequence numbers", () => {
    const stream = new KernelStream();

    const e0 = stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    const e1 = stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    });
    const e2 = stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0",
    });

    expect(e0.seq).toBe(0);
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
  });

  test("error events also get sequence numbers", () => {
    const stream = new KernelStream();
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    }); // seq 0

    const err = stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/missing/1.0",
    }); // seq 1
    expect(err.seq).toBe(1);
    expect(err.kind).toBe("error");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Stream Processing (pipe)
// ═══════════════════════════════════════════════════════════════════════

describe("KernelStream: Pipe (AsyncIterable)", () => {
  test("pipe processes a sync iterable of commands", async () => {
    const stream = new KernelStream();
    const commands: KernelCommand[] = [
      {
        kind: "define:record",
        name: "Item",
        version: "1.0",
        schema: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      },
      {
        kind: "validate",
        typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Item/1.0",
        data: { name: "Widget" },
      },
      {
        kind: "create",
        typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Item/1.0",
        data: { name: "Widget" },
      },
    ];

    const events: KernelEvent[] = [];
    for await (const event of stream.pipe(commands)) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("type:defined");
    expect(events[1].kind).toBe("validated");
    expect(events[2].kind).toBe("datum:created");
  });

  test("pipe processes an async iterable of commands", async () => {
    const stream = new KernelStream();

    async function* generateCommands(): AsyncGenerator<KernelCommand> {
      yield {
        kind: "define:record",
        name: "Msg",
        version: "1.0",
        schema: {
          type: "object",
          required: ["text"],
          properties: { text: { type: "string" } },
        },
      };
      yield {
        kind: "create",
        typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Msg/1.0",
        data: { text: "hello" },
      };
      yield {
        kind: "create",
        typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Msg/1.0",
        data: { text: "world" },
      };
    }

    const events: KernelEvent[] = [];
    for await (const event of stream.pipe(generateCommands())) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("type:defined");
    expect(events[1].kind).toBe("datum:created");
    expect(events[2].kind).toBe("datum:created");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Batch Processing
// ═══════════════════════════════════════════════════════════════════════

describe("KernelStream: Batch Processing", () => {
  test("processAll returns all events synchronously", () => {
    const stream = new KernelStream();

    const events = stream.processAll([
      { kind: "resolve", typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0" },
      { kind: "resolve", typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0" },
      { kind: "resolve", typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0" },
    ]);

    expect(events).toHaveLength(3);
    expect(events.every((e) => e.kind === "type:resolved")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Subscriptions
// ═══════════════════════════════════════════════════════════════════════

describe("KernelStream: Subscriptions", () => {
  test("on() receives events by kind", () => {
    const stream = new KernelStream();
    const received: KernelEvent[] = [];

    stream.on("type:resolved", (e) => received.push(e));

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    });

    expect(received).toHaveLength(2);
  });

  test("on('*') receives all events", () => {
    const stream = new KernelStream();
    const received: KernelEvent[] = [];

    stream.on("*", (e) => received.push(e));

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/missing/1.0",
    }); // error

    expect(received).toHaveLength(2);
    expect(received[0].kind).toBe("type:resolved");
    expect(received[1].kind).toBe("error");
  });

  test("unsubscribe stops receiving events", () => {
    const stream = new KernelStream();
    const received: KernelEvent[] = [];

    const unsub = stream.on("type:resolved", (e) => received.push(e));

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    unsub();
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    });

    expect(received).toHaveLength(1);
  });

  test("where() filters events by predicate", () => {
    const stream = new KernelStream();
    const errors: KernelEvent[] = [];

    stream.where(
      (e) => e.kind === "error",
      (e) => errors.push(e),
    );

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    }); // ok
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/nope/1.0",
    }); // error

    expect(errors).toHaveLength(1);
  });

  test("when() resolves on matching event", async () => {
    const stream = new KernelStream();

    const promise = stream.when((e) => e.kind === "type:resolved");

    // Process in next microtask
    queueMicrotask(() => {
      stream.process({
        kind: "resolve",
        typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
      });
    });

    const event = await promise;
    expect(event.kind).toBe("type:resolved");
  });

  test("subscriber errors don't break the stream", () => {
    const stream = new KernelStream();

    stream.on("type:resolved", () => {
      throw new Error("subscriber crash");
    });

    // Should not throw
    const event = stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    expect(event.kind).toBe("type:resolved");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Fold Algebra (Stream Aggregation)
// ═══════════════════════════════════════════════════════════════════════

describe("KernelStream: Fold Algebra", () => {
  test("fold counts events by kind", () => {
    const stream = new KernelStream();

    const counter: FoldAlgebra<Record<string, number>> = {
      init: {},
      step(acc, event) {
        acc[event.kind] = (acc[event.kind] ?? 0) + 1;
        return acc;
      },
    };

    const result = stream.fold(
      [
        { kind: "resolve", typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0" },
        { kind: "resolve", typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0" },
        { kind: "resolve", typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/nope/1.0" }, // error
      ],
      counter,
    );

    expect(result["type:resolved"]).toBe(2);
    expect(result["error"]).toBe(1);
  });

  test("fold collects created datum CIDs", () => {
    const stream = new KernelStream();
    stream.process({
      kind: "define:record",
      name: "Item",
      version: "1.0",
      schema: {
        type: "object",
        required: ["v"],
        properties: { v: { type: "integer" } },
      },
    });

    const cidCollector: FoldAlgebra<string[]> = {
      init: [],
      step(acc, event) {
        if (event.kind === "datum:created") acc.push(event.datum.id);
        return acc;
      },
    };

    const cids = stream.fold(
      [
        {
          kind: "create",
          typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Item/1.0",
          data: { v: 1 },
        },
        {
          kind: "create",
          typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Item/1.0",
          data: { v: 2 },
        },
        {
          kind: "create",
          typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Item/1.0",
          data: { v: 3 },
        },
      ],
      cidCollector,
    );

    expect(cids).toHaveLength(3);
    expect(cids.every((c) => c.startsWith("cid:sha256:"))).toBe(true);
    // Different data → different CIDs
    expect(new Set(cids).size).toBe(3);
  });

  test("foldAsync works with async iterables", async () => {
    const stream = new KernelStream();
    stream.process({
      kind: "define:record",
      name: "N",
      version: "1.0",
      schema: {
        type: "object",
        required: ["v"],
        properties: { v: { type: "integer" } },
      },
    });

    async function* commands(): AsyncGenerator<KernelCommand> {
      for (let i = 0; i < 5; i++) {
        yield {
          kind: "create",
          typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/N/1.0",
          data: { v: i },
        };
      }
    }

    const count = await stream.foldAsync(commands(), {
      init: 0,
      step: (acc) => acc + 1,
    });

    expect(count).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Provenance (Audit Trail)
// ═══════════════════════════════════════════════════════════════════════

describe("KernelStream: Provenance", () => {
  test("every command produces a provenance entry", () => {
    const stream = new KernelStream();

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    });

    expect(stream.provenanceLength).toBe(2);
  });

  test("provenance entries form a hash chain", () => {
    const stream = new KernelStream();

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    });
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0",
    });

    const entries = stream.provenanceTail(3);
    expect(entries).toHaveLength(3);

    // Most recent first
    expect(entries[0].seq).toBe(2);
    expect(entries[1].seq).toBe(1);
    expect(entries[2].seq).toBe(0);

    // First entry has empty prev_hash
    expect(entries[2].prev_hash).toBe("");
    // Subsequent entries have non-empty prev_hash
    expect(entries[1].prev_hash).toBeTruthy();
    expect(entries[0].prev_hash).toBeTruthy();
    // Chain links are distinct
    expect(entries[0].prev_hash).not.toBe(entries[1].prev_hash);
  });

  test("provenance chain verifies successfully", () => {
    const stream = new KernelStream();

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    });
    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0",
    });

    expect(stream.verifyProvenance()).toBe(true);
  });

  test("provenance records command kind as action", () => {
    const stream = new KernelStream();

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    stream.process({
      kind: "define:record",
      name: "X",
      version: "1.0",
      schema: { type: "object", properties: {} },
    });

    const entries = stream.provenanceTail(2);
    expect(entries[0].action).toBe("define:record");
    expect(entries[1].action).toBe("resolve");
  });

  test("provenanceHead returns most recent entry", () => {
    const stream = new KernelStream();

    expect(stream.provenanceHead()).toBeNull();

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    });
    expect(stream.provenanceHead()!.seq).toBe(0);

    stream.process({
      kind: "resolve",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    });
    expect(stream.provenanceHead()!.seq).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Integration: Full Event-Sourced Domain
// ═══════════════════════════════════════════════════════════════════════

describe("KernelStream: Integration — Event-Sourced Domain", () => {
  test("define types, create data, validate, fold — full pipeline", () => {
    const stream = new KernelStream();

    // 1. Define domain types
    const events = stream.processAll([
      {
        kind: "define:record",
        name: "User",
        version: "1.0",
        schema: {
          type: "object",
          required: ["name", "email"],
          properties: {
            name: { type: "string", minLength: 1 },
            email: { type: "string" },
          },
        },
      },
      {
        kind: "define:record",
        name: "Post",
        version: "1.0",
        schema: {
          type: "object",
          required: ["title", "body"],
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            author: {
              type: "string",
              $typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/User/1.0",
            },
          },
        },
      },
    ]);

    expect(events[0].kind).toBe("type:defined");
    expect(events[1].kind).toBe("type:defined");

    // 2. Create users
    const user1 = stream.process({
      kind: "create",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/User/1.0",
      data: { name: "Ada", email: "ada@example.com" },
    });
    expect(user1.kind).toBe("datum:created");
    const user1Cid = user1.kind === "datum:created" ? user1.datum.id : "";

    // 3. Create posts referencing the user
    const post1 = stream.process({
      kind: "create",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Post/1.0",
      data: { title: "On Computing", body: "...", author: user1Cid },
      refs: [{ rel: "author", target: user1Cid }],
    });
    expect(post1.kind).toBe("datum:created");

    // 4. Validate data
    const validationResult = stream.process({
      kind: "validate",
      typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Post/1.0",
      data: { title: "Test", body: "content" },
    });
    if (validationResult.kind === "validated") {
      expect(validationResult.result.valid).toBe(true);
    }

    // 5. Verify provenance trail
    expect(stream.provenanceLength).toBe(5); // 2 defines + user + post + validation
    expect(stream.verifyProvenance()).toBe(true);

    // 6. Fold: count datums created
    const datumCount = stream.fold(
      [
        {
          kind: "create",
          typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/User/1.0",
          data: { name: "Bob", email: "bob@example.com" },
        },
        {
          kind: "create",
          typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/User/1.0",
          data: { name: "Carol", email: "carol@example.com" },
        },
      ],
      { init: 0, step: (n, e) => (e.kind === "datum:created" ? n + 1 : n) },
    );
    expect(datumCount).toBe(2);
  });

  test("state machine as event stream with transition validation", () => {
    const stream = new KernelStream();

    // Define states and events
    stream.processAll([
      {
        kind: "define:record",
        name: "OrderState",
        version: "1.0",
        schema: {
          type: "object",
          required: ["status"],
          properties: { status: { type: "string" } },
        },
      },
      {
        kind: "define:record",
        name: "OrderEvent",
        version: "1.0",
        schema: {
          type: "object",
          required: ["action"],
          properties: { action: { type: "string" } },
        },
      },
    ]);

    // Transition function as expression
    const transition: KernelExpression = {
      op: "match",
      scrutinee: {
        op: "array",
        elements: [
          { op: "get", path: "state/status" },
          { op: "get", path: "event/action" },
        ],
      },
      cases: [
        {
          pattern: {
            kind: "const",
            value: ["pending", "pay"],
          },
          body: {
            op: "record",
            fields: { status: { op: "const", value: "paid" } },
          },
        },
        {
          pattern: {
            kind: "const",
            value: ["paid", "ship"],
          },
          body: {
            op: "record",
            fields: { status: { op: "const", value: "shipped" } },
          },
        },
        {
          pattern: { kind: "wildcard" },
          body: { op: "const", value: null },
        },
      ],
    };

    // Execute transitions via evaluate commands
    let currentState = { status: "pending" };

    // Pending → pay → Paid
    const step1 = stream.process({
      kind: "evaluate",
      expr: transition,
      context: {
        $self: { state: currentState, event: { action: "pay" } },
      },
    });
    if (step1.kind === "evaluated" && step1.result.value) {
      currentState = step1.result.value as { status: string };
    }
    expect(currentState.status).toBe("paid");

    // Paid → ship → Shipped
    const step2 = stream.process({
      kind: "evaluate",
      expr: transition,
      context: {
        $self: { state: currentState, event: { action: "ship" } },
      },
    });
    if (step2.kind === "evaluated" && step2.result.value) {
      currentState = step2.result.value as { status: string };
    }
    expect(currentState.status).toBe("shipped");

    // Shipped → pay → null (invalid)
    const step3 = stream.process({
      kind: "evaluate",
      expr: transition,
      context: {
        $self: { state: currentState, event: { action: "pay" } },
      },
    });
    if (step3.kind === "evaluated") {
      expect(step3.result.value).toBeNull();
    }

    // Verify every step is in the provenance
    expect(stream.verifyProvenance()).toBe(true);
  });
});
