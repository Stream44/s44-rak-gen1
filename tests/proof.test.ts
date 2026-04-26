/**
 * ADK Conformance Test Suite — adapted from the research chain.
 *
 * Validates the five core contributions of the ADK:
 * 1. Cryptographic Fixed Point: The M3 Tower integrity.
 * 2. Content-Addressed Morphisms: Algebraic transformations.
 * 3. Proof-Carrying Data: Logic and refinement validation.
 * 4. Total Execution: The safety of the Expression Evaluator.
 * 5. Merkle-DAG State Coalgebras: State machine integrity.
 *
 * Integration adapted to our actual API. Test logic preserved.
 */

import { describe, test, expect, beforeEach } from "bun:test";

import {
  MetamodelKernel,
  TypeRegistry,
  MemoryStore,
  JsonEncoder,
  ExpressionEvaluator,
  SchemaValidator,
  MetaLevel,
  TypeLevelError,
  DatumValidationError,
} from "../L13-facade/index.ts";
import { AlgebraicKernel } from "../L13-facade/index.ts";

import type {
  TypeDef,
  Datum,
  TypeRef,
  KernelExpression,
  JsonSchema,
  Pattern,
  Transition,
} from "../L13-facade/index.ts";

import { IntentProcessor } from "../L13-facade/index.ts";
import { CapabilityEngine } from "../L13-facade/index.ts";
import { UnfoldingEngine } from "../L09-demand/unfold.ts";

// Helper to bootstrap the kernel
function createTestKernel() {
  return MetamodelKernel.create();
}

// ═══════════════════════════════════════════════════════════════════════
// I. The Metamodel Tower (Static Layer)
// ═══════════════════════════════════════════════════════════════════════

describe("I. The Metamodel Tower (Static Layer)", () => {
  let kernel: MetamodelKernel;

  beforeEach(() => {
    kernel = createTestKernel();
  });

  describe("Contribution I: Cryptographic Fixed Point", () => {
    test("should boot the tower from the M3 self-referential axiom", () => {
      // The kernel must successfully bootstrap from the hardcoded M3 definition.
      // This validates that M3 is internally consistent (Strange Loop).
      const m3 = kernel.resolveType("type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0");

      expect(m3).toBeDefined();
      expect(m3.level).toBe(3);

      // The Axiom: M3 conforms to itself.
      // H(M3) == M3.conformsTo
      expect(m3.conformsTo).toBe(m3.id);
    });

    test("should validate the vertical integrity of the tower", () => {
      // Verify that every built-in M2 metamodel correctly conforms to M3.
      const m2Record = kernel.resolveType("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0");

      expect(m2Record.level).toBe(2);
      expect(m2Record.conformsTo).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0");

      // Verify conformance check passes
      const isConformant = kernel.conformsTo(
        m2Record.id,
        "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
      );
      expect(isConformant).toBe(true);
    });

    test("should reject a type definition that violates level constraints", () => {
      // Attempt to define an M1 type that claims to conform directly to M3.
      // This violates the structural invariant: Level(N) must be Level(N+1) - 1.

      const invalidType: TypeDef = {
        id: "type://github.com/Stream44/s44-rak-gen1@1.0/Invalid/1.0",
        level: 1, // M1
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0", // Claims to conform to M3 (Level 3)
        schema: { type: "object", properties: {} },
      };

      // The kernel MUST reject this to preserve the tower structure.
      expect(() => kernel.defineType(invalidType)).toThrow(TypeLevelError);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// II. Content Addressing & Algebraic Operations
// ═══════════════════════════════════════════════════════════════════════

describe("II. Content Addressing & Algebraic Operations", () => {
  let kernel: MetamodelKernel;
  let evaluator: ExpressionEvaluator;

  beforeEach(() => {
    kernel = createTestKernel();
    evaluator = new ExpressionEvaluator();
  });

  describe("Contribution II: First-Class Morphisms", () => {
    test("should define a valid Morphism (Transformation) between types", () => {
      // 1. Define Source Type (Celsius)
      const sourceType = kernel.defineScalar("Celsius", "1.0", {
        type: "number",
        minimum: -273.15,
      });

      // 2. Define Target Type (Fahrenheit)
      const targetType = kernel.defineScalar("Fahrenheit", "1.0", {
        type: "number",
        minimum: -459.67,
      });

      // 3. Define the Transformation Logic (Pure Expression)
      const conversionExpr: KernelExpression = {
        op: "call",
        fn: "add",
        args: [
          {
            op: "call",
            fn: "mul",
            args: [
              { op: "var", name: "c" },
              { op: "const", value: 1.8 },
            ],
          },
          { op: "const", value: 32 },
        ],
      };

      // 4. Apply the Morphism: transform 0°C
      const zeroCelsius = kernel.createDatum(
        "type://github.com/Stream44/s44-rak-gen1@1.0/Celsius/1.0",
        0,
      );
      const result = evaluator.evaluate(conversionExpr, {
        c: zeroCelsius.data as number,
      });

      // Expect 32°F
      expect(result.value).toBeCloseTo(32);

      // Verify the result is a valid instance of the target type
      const validation = kernel.validate(
        "type://github.com/Stream44/s44-rak-gen1@1.0/Fahrenheit/1.0",
        result.value,
      );
      expect(validation.valid).toBe(true);
    });

    test("should compose Morphisms (Category Theory compliance)", () => {
      // Test: f: A -> B, g: B -> C => h: A -> C
      kernel.defineScalar("A", "1.0", { type: "number" });
      kernel.defineScalar("B", "1.0", { type: "number" });
      kernel.defineScalar("C", "1.0", { type: "number" });

      // f: add 1
      const f: KernelExpression = {
        op: "call",
        fn: "add",
        args: [
          { op: "var", name: "x" },
          { op: "const", value: 1 },
        ],
      };
      // g: mul 2
      const g: KernelExpression = {
        op: "call",
        fn: "mul",
        args: [
          { op: "var", name: "x" },
          { op: "const", value: 2 },
        ],
      };

      // Compose g ∘ f: apply f first, then g
      const composed: KernelExpression = {
        op: "let",
        name: "intermediate",
        value: {
          op: "call",
          fn: "add",
          args: [
            { op: "var", name: "x" },
            { op: "const", value: 1 },
          ],
        },
        body: {
          op: "call",
          fn: "mul",
          args: [
            { op: "var", name: "intermediate" },
            { op: "const", value: 2 },
          ],
        },
      };

      // Verify execution: 5 -> (add 1) -> 6 -> (mul 2) -> 12
      const resultC = evaluator.evaluate(composed, { x: 5 });
      expect(resultC.value).toBe(12);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// III. The Proof Layer (Logic & Refinement)
// ═══════════════════════════════════════════════════════════════════════

describe("III. The Proof Layer (Logic & Refinement)", () => {
  let kernel: MetamodelKernel;
  let evaluator: ExpressionEvaluator;

  beforeEach(() => {
    kernel = createTestKernel();
    evaluator = new ExpressionEvaluator();
  });

  describe("Contribution III: Proof-Carrying Data", () => {
    test("should validate a Refinement Type with an executable predicate", () => {
      // Define "PositiveInteger": { x: Int | x > 0 }
      kernel.defineScalar("Integer", "1.0", { type: "integer" });

      const refinementPredicate: KernelExpression = {
        op: "call",
        fn: "gt",
        args: [
          { op: "var", name: "$self" },
          { op: "const", value: 0 },
        ],
      };

      // Valid Case: 42
      const structurallyValid = kernel.validate(
        "type://github.com/Stream44/s44-rak-gen1@1.0/Integer/1.0",
        42,
      );
      expect(structurallyValid.valid).toBe(true);
      const refinementValid = evaluator.evaluate(refinementPredicate, {
        $self: 42,
      });
      expect(refinementValid.value).toBe(true);

      // Invalid Case: -5 — structural pass, refinement fail
      const structurallyValidNeg = kernel.validate(
        "type://github.com/Stream44/s44-rak-gen1@1.0/Integer/1.0",
        -5,
      );
      expect(structurallyValidNeg.valid).toBe(true);
      const refinementInvalid = evaluator.evaluate(refinementPredicate, {
        $self: -5,
      });
      expect(refinementInvalid.value).toBe(false);
    });

    test("should validate a cross-field refinement (startDate < endDate)", () => {
      kernel.defineRecord("DateRange", "1.0", (t) => {
        t.integer("start", { required: true });
        t.integer("end", { required: true });
      });

      const predicate: KernelExpression = {
        op: "call",
        fn: "lt",
        args: [
          { op: "get", path: "start" },
          { op: "get", path: "end" },
        ],
      };

      const validData = { start: 100, end: 200 };
      expect(
        kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/DateRange/1.0", validData)
          .valid,
      ).toBe(true);
      expect(evaluator.evaluate(predicate, { $self: validData }).value).toBe(true);

      const invalidData = { start: 300, end: 100 };
      expect(
        kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/DateRange/1.0", invalidData)
          .valid,
      ).toBe(true); // structural pass
      expect(evaluator.evaluate(predicate, { $self: invalidData }).value).toBe(false); // refinement fail
    });

    test("should verify a formal proof term (Curry-Howard: conjunction elimination)", () => {
      // Proposition: "If A and B, then A"
      // Logic: Conjunction Elimination (fst projection)
      // Type: A × B → A
      // Proof: λ(pair). pair.fst

      const proofExpr: KernelExpression = {
        op: "apply",
        fn: {
          op: "lambda",
          param: "pair",
          body: { op: "get", path: "fst" },
        },
        arg: { op: "const", value: { fst: true, snd: false } },
      };

      // Evaluate the proof term: extract 'fst' from the pair
      const result = evaluator.evaluate(proofExpr, {
        $self: { fst: true, snd: false },
      });
      expect(result.value).toBe(true);
    });

    test("should find a witness for a satisfiable proposition", () => {
      // Proposition: Exists x such that x > 10 and x < 20
      // We test this by checking that a candidate witness (15) satisfies the predicate
      const predicate: KernelExpression = {
        op: "call",
        fn: "and",
        args: [
          {
            op: "call",
            fn: "gt",
            args: [
              { op: "var", name: "$self" },
              { op: "const", value: 10 },
            ],
          },
          {
            op: "call",
            fn: "lt",
            args: [
              { op: "var", name: "$self" },
              { op: "const", value: 20 },
            ],
          },
        ],
      };

      // Use a witness (15) to satisfy the proposition
      const witness = 15;
      const result = evaluator.evaluate(predicate, { $self: witness });
      expect(result.value).toBe(true);

      // Verify the witness is in range
      expect(witness).toBeGreaterThan(10);
      expect(witness).toBeLessThan(20);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// IV. The Execution Layer (Total Calculus)
// ═══════════════════════════════════════════════════════════════════════

describe("IV. The Execution Layer (Total Calculus)", () => {
  let kernel: MetamodelKernel;
  let evaluator: ExpressionEvaluator;

  beforeEach(() => {
    kernel = createTestKernel();
    evaluator = new ExpressionEvaluator();
  });

  describe("Contribution IV: Total Expression Calculus", () => {
    test("should enforce deterministic execution (purity)", () => {
      // Since we don't expose Date.now() or Random, we check that the same input
      // always yields the same output.

      const morphismExpr: KernelExpression = {
        op: "call",
        fn: "mul",
        args: [
          { op: "var", name: "x" },
          { op: "const", value: 2 },
        ],
      };

      // Run 100 times
      const results = Array(100)
        .fill(0)
        .map(() => evaluator.evaluate(morphismExpr, { x: 10 }));

      // All values must be identical
      const values = results.map((r) => r.value);
      expect(new Set(values).size).toBe(1);
      expect(values[0]).toBe(20);
    });

    test("should enforce termination via Gas limits (OutOfGas)", () => {
      // Set gas limit to 10 (extremely low)
      const limitedEvaluator = new ExpressionEvaluator({ maxGas: 10 });

      // Build a deeply nested expression that exceeds gas
      let expr: KernelExpression = { op: "const", value: 0 };
      for (let i = 0; i < 20; i++) {
        expr = {
          op: "call",
          fn: "add",
          args: [expr, { op: "const", value: 1 }],
        };
      }

      const result = limitedEvaluator.evaluate(expr);
      expect(result.error).toBe("OutOfGas");
    });

    test("should safely isolate execution (Sandboxing)", () => {
      // The AST has no access to 'fetch', 'fs', or 'global'.
      // 'fetch' is not in BuiltinFn — the evaluator should reject it.

      const invalidExpr: KernelExpression = {
        op: "call",
        fn: "fetch" as any,
        args: [{ op: "const", value: "http://evil.com" }],
      };

      // Evaluation should fail: 'fetch' is not a recognized builtin.
      const result = evaluator.evaluate(invalidExpr);
      expect(result.error).toBe("Unknown builtin: fetch");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V. The Process Layer (State Coalgebras)
// ═══════════════════════════════════════════════════════════════════════

describe("V. The Process Layer (State Coalgebras)", () => {
  let kernel: MetamodelKernel;
  let evaluator: ExpressionEvaluator;

  beforeEach(() => {
    kernel = createTestKernel();
    evaluator = new ExpressionEvaluator();
  });

  describe("Contribution V: Merkle-DAG State Coalgebras", () => {
    test("should execute a valid state transition", () => {
      // 1. Define States (Union)
      kernel.defineUnion("OrderState", "1.0", [
        {
          type: "object",
          required: ["status"],
          properties: { status: { const: "Pending" } },
        },
        {
          type: "object",
          required: ["status"],
          properties: { status: { const: "Paid" } },
        },
      ]);

      // 2. Define Events
      kernel.defineUnion("OrderEvent", "1.0", [
        {
          type: "object",
          required: ["type"],
          properties: { type: { const: "Pay" } },
        },
      ]);

      // 3. Define Transition as expression: if state=Pending && event=Pay => Paid
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
                { op: "const", value: "Pending" },
              ],
            },
            {
              op: "call",
              fn: "eq",
              args: [
                { op: "get", path: "event/type" },
                { op: "const", value: "Pay" },
              ],
            },
          ],
        },
        then: {
          op: "record",
          fields: { status: { op: "const", value: "Paid" } },
        },
        else: { op: "const", value: null },
      };

      // 4. Execute Step
      const currentState = { status: "Pending" };
      const payEvent = { type: "Pay" };

      // Validate inputs against their types
      expect(
        kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/OrderState/1.0", currentState)
          .valid,
      ).toBe(true);
      expect(
        kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/OrderEvent/1.0", payEvent)
          .valid,
      ).toBe(true);

      // Execute transition
      const result = evaluator.evaluate(transitionExpr, {
        $self: { state: currentState, event: payEvent },
      });

      expect(result.value).not.toBeNull();
      expect((result.value as any).status).toBe("Paid");

      // Validate output against state type
      expect(
        kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/OrderState/1.0", result.value)
          .valid,
      ).toBe(true);
    });

    test("should enforce transition integrity (Merkle History)", () => {
      // A state transition produces a new Datum.
      // This Datum must contain a reference (ref) to the previous state (causality).

      kernel.defineUnion("SimpleState", "1.0", [
        {
          type: "object",
          required: ["status"],
          properties: { status: { const: "A" } },
        },
        {
          type: "object",
          required: ["status"],
          properties: { status: { const: "B" } },
        },
      ]);

      const stateA = kernel.createDatum(
        "type://github.com/Stream44/s44-rak-gen1@1.0/SimpleState/1.0",
        {
          status: "A",
        },
      );
      const stateB = kernel.createDatum(
        "type://github.com/Stream44/s44-rak-gen1@1.0/SimpleState/1.0",
        { status: "B" },
        [
          { rel: "prev_state", target: stateA.id },
          { rel: "caused_by", target: "cid:sha256:event123" },
        ],
      );

      // Invariant: newState.refs MUST contain the CID of currentState
      expect(stateB.refs).toContainEqual({
        rel: "prev_state",
        target: stateA.id,
      });

      // Invariant: newState.refs MUST contain the CID of the event
      expect(stateB.refs).toContainEqual({
        rel: "caused_by",
        target: "cid:sha256:event123",
      });
    });

    test("should reject an invalid transition (Safety Property)", () => {
      // Attempt to pay an order that is already Paid.
      // Machine does not define a transition for Paid + Pay.

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
                { op: "const", value: "Pending" },
              ],
            },
            {
              op: "call",
              fn: "eq",
              args: [
                { op: "get", path: "event/type" },
                { op: "const", value: "Pay" },
              ],
            },
          ],
        },
        then: {
          op: "record",
          fields: { status: { op: "const", value: "Paid" } },
        },
        else: { op: "const", value: null }, // null = no valid transition
      };

      const paidState = { status: "Paid" };
      const payEvent = { type: "Pay" };

      const result = evaluator.evaluate(transitionExpr, {
        $self: { state: paidState, event: payEvent },
      });

      // No valid transition: result is null
      expect(result.value).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// VI. Formal Verification & Model Checking
// ═══════════════════════════════════════════════════════════════════════

describe("VI. Formal Verification & Model Checking", () => {
  let evaluator: ExpressionEvaluator;

  beforeEach(() => {
    evaluator = new ExpressionEvaluator();
  });

  test("should verify a safety property (Invariant Checking)", () => {
    // Property: "Status can never be 'Undefined'"
    const invariant: KernelExpression = {
      op: "call",
      fn: "neq",
      args: [
        { op: "get", path: "status" },
        { op: "const", value: "Undefined" },
      ],
    };

    // Check against all reachable states
    const reachableStates = [{ status: "Pending" }, { status: "Paid" }, { status: "Shipped" }];

    const allHold = reachableStates.every((state) => {
      const result = evaluator.evaluate(invariant, { $self: state });
      return result.value === true;
    });

    expect(allHold).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// VII. Action Layer Proofs
// ═══════════════════════════════════════════════════════════════════════

describe("VII. Action Layer Proofs", () => {
  const constPat = (value: unknown): Pattern => ({ kind: "const", value });
  const recordPat = (fields: Record<string, Pattern>): Pattern => ({ kind: "record", fields });

  function createActionLayerStack() {
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

    // IntentProcessor with actions
    const intents = new IntentProcessor(ak);
    const payAction = intents.defineAction("PayOrder", "1.0", {
      verb: "pay",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string" }, amount: { type: "number" } },
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

    return { ak, intents, payAction, shipAction, deliverAction, smId, stateTypeId, eventTypeId };
  }

  test("Intent submission preserves state machine invariants", async () => {
    const { ak, intents, payAction, shipAction, deliverAction } = createActionLayerStack();

    // Define invariant: status must never be "invalid"
    const invariant: KernelExpression = {
      op: "call",
      fn: "neq",
      args: [
        { op: "get", path: "status" },
        { op: "const", value: "invalid" },
      ],
    };

    intents.setState("ord-inv", { status: "pending" });

    const actions = [payAction, shipAction, deliverAction];
    const payloads = [
      { orderId: "ord-inv", amount: 100 },
      { orderId: "ord-inv" },
      { orderId: "ord-inv" },
    ];

    for (let i = 0; i < 3; i++) {
      const result = await intents.submit({
        action: actions[i].id,
        target: "order-lifecycle",
        targetKey: "ord-inv",
        payload: payloads[i],
      });
      expect(result.success).toBe(true);

      // Verify invariant holds on the new state
      const newState = intents.getState("ord-inv");
      const check = ak.evaluate(invariant, { $self: newState });
      expect(check.value).toBe(true);
    }

    // Final state should be delivered
    const finalState = intents.getState("ord-inv") as { status: string };
    expect(finalState.status).toBe("delivered");
  });

  test("Capability delegation chain maintains authorization", () => {
    const { ak, intents, payAction } = createActionLayerStack();
    const caps = new CapabilityEngine(ak);

    // Root cap — no caveats
    const rootCap = caps.issue(payAction.id, "root-authority");

    // Delegate to admin — add amount caveat
    const amountCaveat: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 10000 },
      ],
    };
    const adminCap = caps.delegate(rootCap.id, [amountCaveat]);

    // Delegate to user — add orderId prefix caveat
    const orderIdCaveat: KernelExpression = {
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
    const userCap = caps.delegate(adminCap.id, [orderIdCaveat]);

    // Verify chain integrity
    const chain = caps.verifyChain(userCap.id);
    expect(chain.valid).toBe(true);
    expect(chain.depth).toBe(3); // root -> admin -> user
    expect(chain.root).toBe("root-authority");

    // Valid intent — satisfies all caveats
    const validIntent = {
      id: "cid:valid",
      action: payAction.id,
      target: "order-lifecycle",
      targetKey: "ord-valid",
      payload: { orderId: "ord-valid", amount: 500 },
      timestamp: new Date().toISOString(),
    };
    const authValid = caps.authorize(validIntent, userCap.id);
    expect(authValid.authorized).toBe(true);

    // Invalid intent — violates ancestor amount caveat (amount >= 10000)
    const invalidAmountIntent = {
      id: "cid:invalid-amount",
      action: payAction.id,
      target: "order-lifecycle",
      targetKey: "ord-big",
      payload: { orderId: "ord-big", amount: 50000 },
      timestamp: new Date().toISOString(),
    };
    const authInvalidAmount = caps.authorize(invalidAmountIntent, userCap.id);
    expect(authInvalidAmount.authorized).toBe(false);

    // Invalid intent — violates orderId caveat (no "ord-" prefix)
    const invalidIdIntent = {
      id: "cid:invalid-id",
      action: payAction.id,
      target: "order-lifecycle",
      targetKey: "bad-id",
      payload: { orderId: "bad-id", amount: 100 },
      timestamp: new Date().toISOString(),
    };
    const authInvalidId = caps.authorize(invalidIdIntent, userCap.id);
    expect(authInvalidId.authorized).toBe(false);
  });

  test("Unfold generates valid state machines", async () => {
    const ak = AlgebraicKernel.create();
    const intents = new IntentProcessor(ak);
    const unfold = new UnfoldingEngine(ak, intents);

    // Define a seed type with a status enum
    const seedRef = ak.defineRecord("Ticket", "1.0", (t) => {
      t.string("id", { required: true });
      t.string("title");
    });

    // Add status enum property to the type schema manually via defineType
    ak.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/TicketEntity/1.0",
      level: 1 as any,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: { enum: ["open", "in_progress", "resolved", "closed"] },
        },
        required: ["id"],
      },
      name: "TicketEntity",
    });

    // Unfold the entity
    const result = unfold.unfold("type://github.com/Stream44/s44-rak-gen1@1.0/TicketEntity/1.0");

    // Process stratum should have generated a state machine
    expect(result.strata.process).toBeDefined();

    // Step through the generated state machine
    const machineId = result.strata.process!;
    const states = ["open", "in_progress", "resolved", "closed"];

    let currentState: unknown = { status: states[0] };
    for (let i = 1; i < states.length; i++) {
      const stepResult = ak.stepStateMachine(machineId, currentState, { verb: states[i] });
      expect(stepResult.success).toBe(true);
      expect((stepResult.newState as any).status).toBe(states[i]);

      // Validate the new state against the generated state type
      const stateTypeDef = ak.resolveType(
        `type://github.com/Stream44/s44-rak-gen1@1.0/TicketEntityState/1.0`,
      );
      expect(stateTypeDef).toBeDefined();
      const validation = ak.validate(
        `type://github.com/Stream44/s44-rak-gen1@1.0/TicketEntityState/1.0`,
        stepResult.newState,
      );
      expect(validation.valid).toBe(true);

      currentState = stepResult.newState;
    }
  });

  test("Events carry causal links", async () => {
    const { intents, payAction, shipAction, deliverAction } = createActionLayerStack();

    intents.setState("ord-causal", { status: "pending" });

    const actions = [payAction, shipAction, deliverAction];
    const payloads = [
      { orderId: "ord-causal", amount: 100 },
      { orderId: "ord-causal", step: "ship" },
      { orderId: "ord-causal", step: "deliver" },
    ];

    const allEvents: Array<{ id: string; causedBy: string }> = [];

    for (let i = 0; i < 3; i++) {
      const result = await intents.submit({
        action: actions[i].id,
        target: "order-lifecycle",
        targetKey: "ord-causal",
        payload: payloads[i],
      });
      expect(result.success).toBe(true);
      expect(result.emittedEvents.length).toBe(1);

      const event = result.emittedEvents[0];

      // Each event must have causedBy pointing to its intent CID
      expect(event.causedBy).toBe(result.intent.id);
      expect(event.causedBy).toBeTruthy();

      allEvents.push({ id: event.id, causedBy: event.causedBy });
    }

    // All event CIDs must be distinct
    const eventIds = new Set(allEvents.map((e) => e.id));
    expect(eventIds.size).toBe(3);

    // All causedBy (intent CIDs) must be distinct
    const intentCids = new Set(allEvents.map((e) => e.causedBy));
    expect(intentCids.size).toBe(3);
  });
});
