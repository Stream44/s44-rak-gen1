/**
 * ADK Benchmark Suite — adapted from the research chain.
 *
 * Validates non-functional requirements:
 * - O(1) lookup of content addressing
 * - Linear O(n) scaling of the stack-based evaluator
 * - Resource boundaries of the Total Expression Calculus
 *
 * Uses bun:test as the runner with performance.now() for timing.
 */

import { describe, test, expect } from "bun:test";

import {
  MetamodelKernel,
  TypeRegistry,
  MemoryStore,
  JsonEncoder,
  ExpressionEvaluator,
  MetaLevel,
  AlgebraicKernel,
} from "../L13-facade/index.ts";

import type { TypeDef, KernelExpression, Pattern, Transition } from "../L13-facade/index.ts";

import { IntentProcessor } from "../L13-facade/index.ts";
import { CapabilityEngine } from "../L13-facade/index.ts";

// ── Configuration ─────────────────────────────────────────────────────

const WARMUP_ITERATIONS = 10;
const MEASUREMENT_ITERATIONS = 1000;

// ── Utility ───────────────────────────────────────────────────────────

function measure(
  name: string,
  fn: () => void,
  iterations: number = MEASUREMENT_ITERATIONS,
): { totalMs: number; latencyUs: number } {
  // Warmup (JIT compilation, cache population)
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    fn();
  }

  // Measurement
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();

  const totalMs = end - start;
  const latencyUs = (totalMs / iterations) * 1000;

  return { totalMs, latencyUs };
}

async function measureAsync(
  name: string,
  fn: () => Promise<void>,
  iterations: number = MEASUREMENT_ITERATIONS,
): Promise<{ totalMs: number; latencyUs: number }> {
  void name;
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await fn();
  }
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const end = performance.now();
  const totalMs = end - start;
  const latencyUs = (totalMs / iterations) * 1000;
  return { totalMs, latencyUs };
}

function createTestKernel() {
  return MetamodelKernel.create();
}

// ═══════════════════════════════════════════════════════════════════════
// SUITE 1: SUBSTRATE LAYER (Layer 1)
// ═══════════════════════════════════════════════════════════════════════

describe("Bench Suite 1: Substrate (Layer 1)", () => {
  const encoder = new JsonEncoder();
  const payload = {
    name: "Alice",
    age: 30,
    interests: ["Math", "CS"],
    nested: { a: 1, b: 2 },
  };

  test("Encode (Canonical JSON)", () => {
    const { latencyUs } = measure("Encode", () => {
      encoder.encode(payload);
    });
    // Should be fast — under 50µs per op
    expect(latencyUs).toBeLessThan(50);
  });

  test("Hash (SHA-256)", () => {
    const bytes = encoder.encode(payload);
    const { latencyUs } = measure("Hash", () => {
      encoder.hash(bytes);
    });
    // Should be fast — under 50µs per op
    expect(latencyUs).toBeLessThan(50);
  });

  test("Store Write (Memory)", () => {
    const store = new MemoryStore();
    const bytes = encoder.encode(payload);
    const cid = encoder.hash(bytes);
    const { latencyUs } = measure("Store Write", () => {
      store.put(cid, bytes);
    });
    expect(latencyUs).toBeLessThan(10);
  });

  test("Store Read (Memory)", () => {
    const store = new MemoryStore();
    const bytes = encoder.encode(payload);
    const cid = encoder.hash(bytes);
    store.put(cid, bytes);
    const { latencyUs } = measure("Store Read", () => {
      store.get(cid);
    });
    expect(latencyUs).toBeLessThan(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SUITE 2: STRUCTURAL LAYER (Layer 2)
// ═══════════════════════════════════════════════════════════════════════

describe("Bench Suite 2: Structural (Layer 2)", () => {
  test("Resolve Type (Cached)", () => {
    const kernel = createTestKernel();
    const { latencyUs } = measure("Resolve", () => {
      kernel.resolveType("type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0");
    });
    // Should be near-instant map lookup
    expect(latencyUs).toBeLessThan(5);
  });

  test("Define New Type", () => {
    const kernel = createTestKernel();
    let counter = 0;
    const { latencyUs } = measure(
      "Define",
      () => {
        const def: TypeDef = {
          id: `type://Dynamic/${counter++}`,
          level: MetaLevel.Model,
          conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
          schema: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        };
        kernel.defineType(def);
      },
      100,
    ); // Lower iterations for expensive ops
    // Define includes validation + encoding + hashing + storage
    expect(latencyUs).toBeLessThan(500);
  });

  test("Validate: Simple Record (2 fields)", () => {
    const kernel = createTestKernel();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
      t.integer("age");
    });

    const validPerson = { name: "Bob", age: 40 };
    const { latencyUs } = measure("Validate Simple", () => {
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", validPerson);
    });
    expect(latencyUs).toBeLessThan(50);
  });

  test("Validate: Complex Record (Nested, 100 items)", () => {
    const kernel = createTestKernel();
    kernel.defineRecord("Complex", "1.0", (t) => {
      t.string("id");
      t.array("items", {
        type: "object",
        properties: {
          sku: { type: "string" },
          price: { type: "number" },
        },
      });
      t.object("meta", (m) => {
        m.string("createdBy");
        m.string("updatedBy");
      });
    });

    const complexData = {
      id: "order-123",
      items: Array(100).fill({ sku: "item-1", price: 9.99 }),
      meta: { createdBy: "admin", updatedBy: "system" },
    };

    const { latencyUs } = measure("Validate Complex", () => {
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Complex/1.0", complexData);
    });
    // Complex validation with 100 items — under 500µs
    expect(latencyUs).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SUITE 3: ALGEBRAIC LAYER (Expression Evaluator)
// ═══════════════════════════════════════════════════════════════════════

describe("Bench Suite 3: Algebraic (Expression Evaluator)", () => {
  test("Execute Simple Expr (Add)", () => {
    const evaluator = new ExpressionEvaluator();
    const exprAdd: KernelExpression = {
      op: "call",
      fn: "add",
      args: [
        { op: "var", name: "x" },
        { op: "const", value: 10 },
      ],
    };

    const { latencyUs } = measure("Eval Simple", () => {
      evaluator.evaluate(exprAdd, { x: 5 });
    });
    expect(latencyUs).toBeLessThan(20);
  });

  test("Execute Fold (1000 items)", () => {
    const evaluator = new ExpressionEvaluator();
    const list = Array(1000).fill(1);

    const exprSum: KernelExpression = {
      op: "call",
      fn: "fold",
      args: [
        { op: "const", value: list },
        { op: "const", value: 0 },
        {
          op: "lambda",
          param: "acc",
          body: {
            op: "lambda",
            param: "x",
            body: {
              op: "call",
              fn: "add",
              args: [
                { op: "var", name: "acc" },
                { op: "var", name: "x" },
              ],
            },
          },
        },
      ],
    };

    const { latencyUs } = measure(
      "Fold 1000",
      () => {
        evaluator.evaluate(exprSum);
      },
      100,
    );
    // Fold over 1000 items with nested closures — under 5ms
    expect(latencyUs).toBeLessThan(5000);
  });

  test("Map over 1000 items", () => {
    const evaluator = new ExpressionEvaluator();
    const list = Array(1000).fill(5);

    const exprMap: KernelExpression = {
      op: "call",
      fn: "map",
      args: [
        { op: "const", value: list },
        {
          op: "lambda",
          param: "x",
          body: {
            op: "call",
            fn: "mul",
            args: [
              { op: "var", name: "x" },
              { op: "const", value: 2 },
            ],
          },
        },
      ],
    };

    const { latencyUs } = measure(
      "Map 1000",
      () => {
        evaluator.evaluate(exprMap);
      },
      100,
    );
    expect(latencyUs).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SUITE 4: PROOF LAYER (Logic)
// ═══════════════════════════════════════════════════════════════════════

describe("Bench Suite 4: Proof Layer (Logic)", () => {
  test("Refinement Check (Native Boolean Logic)", () => {
    const evaluator = new ExpressionEvaluator();
    const predicate: KernelExpression = {
      op: "call",
      fn: "gt",
      args: [
        { op: "var", name: "$self" },
        { op: "const", value: 0 },
      ],
    };

    const { latencyUs } = measure("Refinement Native", () => {
      evaluator.evaluate(predicate, { $self: 42 });
    });
    expect(latencyUs).toBeLessThan(20);
  });

  test("Complex Refinement (AND + MOD)", () => {
    const evaluator = new ExpressionEvaluator();
    const predicate: KernelExpression = {
      op: "call",
      fn: "and",
      args: [
        {
          op: "call",
          fn: "gt",
          args: [
            { op: "var", name: "$self" },
            { op: "const", value: 0 },
          ],
        },
        {
          op: "call",
          fn: "eq",
          args: [
            {
              op: "call",
              fn: "mod",
              args: [
                { op: "var", name: "$self" },
                { op: "const", value: 7 },
              ],
            },
            { op: "const", value: 0 },
          ],
        },
      ],
    };

    const { latencyUs } = measure("Refinement Complex", () => {
      evaluator.evaluate(predicate, { $self: 49 });
    });
    expect(latencyUs).toBeLessThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SUITE 5: PROCESS LAYER (State Machine Transitions)
// ═══════════════════════════════════════════════════════════════════════

describe("Bench Suite 5: Process Layer (State Machines)", () => {
  test("Single Step Transition", () => {
    const evaluator = new ExpressionEvaluator();

    // Transition: if Pending + Pay => Paid, else null
    const transitionExpr: KernelExpression = {
      op: "if",
      cond: {
        op: "call",
        fn: "and",
        args: [
          {
            op: "call",
            fn: "eq",
            args: [
              { op: "get", path: "state/status" },
              { op: "const", value: "A" },
            ],
          },
          {
            op: "call",
            fn: "eq",
            args: [
              { op: "get", path: "event" },
              { op: "const", value: "TOGGLE" },
            ],
          },
        ],
      },
      then: {
        op: "record",
        fields: { status: { op: "const", value: "B" } },
      },
      else: { op: "const", value: null },
    };

    const { latencyUs } = measure("State Step", () => {
      evaluator.evaluate(transitionExpr, {
        $self: { state: { status: "A" }, event: "TOGGLE" },
      });
    });
    expect(latencyUs).toBeLessThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SUITE 6: STRESS TESTING
// ═══════════════════════════════════════════════════════════════════════

describe("Bench Suite 6: Stress Testing", () => {
  test("Loading 10,000 types into registry", () => {
    const kernel = createTestKernel();

    const startMem = process.memoryUsage().heapUsed;
    const start = performance.now();

    for (let i = 0; i < 10_000; i++) {
      kernel.defineType({
        id: `type://github.com/Stream44/s44-rak-gen1@1.0/Stress/${i}`,
        level: MetaLevel.Model,
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        schema: {
          type: "object",
          properties: { id: { type: "string" } },
        },
      });
    }

    const end = performance.now();
    const endMem = process.memoryUsage().heapUsed;

    const totalMs = end - start;
    const memDeltaMB = (endMem - startMem) / 1024 / 1024;

    // Should load 10k types in under 5 seconds
    expect(totalMs).toBeLessThan(5000);

    // Memory should stay reasonable — under 100 MB
    expect(memDeltaMB).toBeLessThan(100);
  });

  test("Type resolution at scale (10k types)", () => {
    const kernel = createTestKernel();

    // Pre-load 10k types
    for (let i = 0; i < 10_000; i++) {
      kernel.defineType({
        id: `type://github.com/Stream44/s44-rak-gen1@1.0/Scale/${i}`,
        level: MetaLevel.Model,
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        schema: {
          type: "object",
          properties: { id: { type: "string" } },
        },
      });
    }

    // Measure resolution speed
    const { latencyUs } = measure("Resolve at 10k scale", () => {
      kernel.resolveType("type://github.com/Stream44/s44-rak-gen1@1.0/Scale/5000");
    });

    // Cache lookup should still be O(1) — under 5µs
    expect(latencyUs).toBeLessThan(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SUITE 7: FULL STACK VIA ACTION LAYER
// ═══════════════════════════════════════════════════════════════════════

describe("Bench Suite 7: Full Stack via Action Layer", () => {
  function createFullStack() {
    const ak = AlgebraicKernel.create();

    // Define OrderState union type
    const stateTypeId = ak.defineUnion("OrderState", "1.0", [
      { type: "object", required: ["status"], properties: { status: { const: "pending" } } },
      { type: "object", required: ["status"], properties: { status: { const: "paid" } } },
      { type: "object", required: ["status"], properties: { status: { const: "shipped" } } },
      { type: "object", required: ["status"], properties: { status: { const: "delivered" } } },
    ]);

    // Define OrderEvent union type
    const eventTypeId = ak.defineUnion("OrderEvent", "1.0", [
      { type: "object", required: ["verb"], properties: { verb: { const: "pay" } } },
      { type: "object", required: ["verb"], properties: { verb: { const: "ship" } } },
      { type: "object", required: ["verb"], properties: { verb: { const: "deliver" } } },
    ]);

    // Transitions
    const constPat = (value: unknown): Pattern => ({ kind: "const", value });
    const recordPat = (fields: Record<string, Pattern>): Pattern => ({ kind: "record", fields });

    const transitions: Transition[] = [
      {
        from: recordPat({ status: constPat("pending") }),
        event: recordPat({ verb: constPat("pay") }),
        to: { op: "const", value: { status: "paid" } },
        label: "pay",
      },
      {
        from: recordPat({ status: constPat("paid") }),
        event: recordPat({ verb: constPat("ship") }),
        to: { op: "const", value: { status: "shipped" } },
        label: "ship",
      },
      {
        from: recordPat({ status: constPat("shipped") }),
        event: recordPat({ verb: constPat("deliver") }),
        to: { op: "const", value: { status: "delivered" } },
        label: "deliver",
      },
    ];

    const smId = "order-lifecycle";
    ak.defineStateMachine({
      id: smId,
      name: "Order Lifecycle",
      stateType: stateTypeId,
      eventType: eventTypeId,
      initialState: { status: "pending" },
      transitions,
    });

    // IntentProcessor + PayOrder action
    const intents = new IntentProcessor(ak);
    const payAction = intents.defineAction("PayOrder", "1.0", {
      verb: "pay",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          amount: { type: "number" },
        },
        required: ["orderId", "amount"],
      },
      targetMachine: smId,
    });

    const shipAction = intents.defineAction("ShipOrder", "1.0", {
      verb: "ship",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
      },
      targetMachine: smId,
    });

    const deliverAction = intents.defineAction("DeliverOrder", "1.0", {
      verb: "deliver",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
      },
      targetMachine: smId,
    });

    // CapabilityEngine + root cap with amount caveat
    const caps = new CapabilityEngine(ak);
    const amountCaveat: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 10000 },
      ],
    };
    const rootCap = caps.issue(payAction.id, "root-authority", {
      caveats: [amountCaveat],
    });

    return { ak, intents, caps, payAction, shipAction, deliverAction, rootCap, smId };
  }

  test("End-to-end: define + authorize + submit intent", async () => {
    const { latencyUs } = await measureAsync(
      "Full cycle",
      async () => {
        const { intents, caps, payAction, rootCap } = createFullStack();

        // Set state to pending
        intents.setState("ord-1", { status: "pending" });

        // Build intent partial
        const intentPartial = {
          action: payAction.id,
          target: "order-lifecycle",
          targetKey: "ord-1",
          payload: { orderId: "ord-1", amount: 500 },
        };

        // Authorize
        const authResult = caps.authorize(
          { ...intentPartial, id: "tmp", timestamp: new Date().toISOString() },
          rootCap.id,
        );
        expect(authResult.authorized).toBe(true);

        // Submit
        const result = await intents.submit(intentPartial);
        expect(result.success).toBe(true);
      },
      100,
    );
    // Full cycle: define types, machine, action, cap, authorize, submit — under 2000µs
    expect(latencyUs).toBeLessThan(2000);
  });

  test("100 sequential intent submissions", async () => {
    const { intents, payAction, shipAction, deliverAction } = createFullStack();

    const actions = [payAction, shipAction, deliverAction];
    const payloads = [
      { orderId: "ord-seq", amount: 100 },
      { orderId: "ord-seq" },
      { orderId: "ord-seq" },
    ];

    const { totalMs } = await measureAsync(
      "100 sequential intents",
      async () => {
        // Reset state for each measurement iteration
        intents.setState("ord-seq", { status: "pending" });

        // Cycle through pay -> ship -> deliver
        for (let step = 0; step < 3; step++) {
          await intents.submit({
            action: actions[step].id,
            target: "order-lifecycle",
            targetKey: "ord-seq",
            payload: payloads[step],
          });
        }
      },
      100,
    );

    // 100 iterations of 3 intents each = 300 submissions
    // Expect > 100 ops/sec => < 10ms per 3-step cycle => totalMs < 1000 for 100 cycles
    const opsPerSec = (100 * 3) / (totalMs / 1000);
    expect(opsPerSec).toBeGreaterThan(100);
  });

  test("Capability authorization with 3 caveats", () => {
    const { ak, caps, payAction } = createFullStack();

    // Issue cap with 3 caveats
    const caveat1: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 10000 },
      ],
    };
    const caveat2: KernelExpression = {
      op: "call",
      fn: "eq",
      args: [
        {
          op: "call",
          fn: "substr",
          args: [
            { op: "get", path: "orderId" },
            { op: "const", value: 0 },
            { op: "const", value: 4 },
          ],
        },
        { op: "const", value: "ord-" },
      ],
    };
    const caveat3: KernelExpression = {
      op: "call",
      fn: "gt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 0 },
      ],
    };

    const cap3 = caps.issue(payAction.id, "root-authority", {
      caveats: [caveat1, caveat2, caveat3],
    });

    const intent = {
      id: "cid:test",
      action: payAction.id,
      target: "order-lifecycle",
      targetKey: "ord-bench",
      payload: { orderId: "ord-bench", amount: 500 },
      timestamp: new Date().toISOString(),
    };

    const { latencyUs } = measure(
      "3-caveat auth",
      () => {
        caps.authorize(intent, cap3.id);
      },
      1000,
    );

    // Expect < 50µs per authorization
    expect(latencyUs).toBeLessThan(50);
  });
});
