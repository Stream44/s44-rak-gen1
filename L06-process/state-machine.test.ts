import { describe, test, expect } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import type { KernelExpression, Pattern } from "../L13-facade/index.ts";
import { StateMachineEngine } from "./engine.ts";
import type { StateMachineDef, Transition } from "./engine.ts";

// ── Helpers ──────────────────────────────────────────────────────────────

function constPat(value: unknown): Pattern {
  return { kind: "const", value };
}

function recordPat(fields: Record<string, Pattern>): Pattern {
  return { kind: "record", fields };
}

function fieldConst(key: string, value: unknown): Record<string, Pattern> {
  return { [key]: constPat(value) };
}

function constExpr(value: unknown): KernelExpression {
  return { op: "const", value };
}

// ── Fixture 1: Order Lifecycle ───────────────────────────────────────────

describe("Layer 15: StateMachine — Order Lifecycle", () => {
  const ak = AlgebraicKernel.create();
  const kernel = ak.kernel;
  const engine = new StateMachineEngine(ak);

  // Define state and event types
  const stateTypeId = kernel.defineUnion("OrderState", "1.0", [
    { type: "object", properties: { status: { const: "pending" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "paid" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "shipped" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "delivered" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "cancelled" } }, required: ["status"] },
  ]);

  const eventTypeId = kernel.defineUnion("OrderEvent", "1.0", [
    { type: "object", properties: { action: { const: "pay" } }, required: ["action"] },
    { type: "object", properties: { action: { const: "ship" } }, required: ["action"] },
    { type: "object", properties: { action: { const: "deliver" } }, required: ["action"] },
    { type: "object", properties: { action: { const: "cancel" } }, required: ["action"] },
  ]);

  const transitions: Transition[] = [
    {
      from: recordPat(fieldConst("status", "pending")),
      event: recordPat(fieldConst("action", "pay")),
      to: constExpr({ status: "paid" }),
      label: "pay",
    },
    {
      from: recordPat(fieldConst("status", "pending")),
      event: recordPat(fieldConst("action", "cancel")),
      to: constExpr({ status: "cancelled" }),
      label: "cancel-pending",
    },
    {
      from: recordPat(fieldConst("status", "paid")),
      event: recordPat(fieldConst("action", "ship")),
      to: constExpr({ status: "shipped" }),
      label: "ship",
    },
    {
      from: recordPat(fieldConst("status", "paid")),
      event: recordPat(fieldConst("action", "cancel")),
      to: constExpr({ status: "cancelled" }),
      label: "cancel-paid",
    },
    {
      from: recordPat(fieldConst("status", "shipped")),
      event: recordPat(fieldConst("action", "deliver")),
      to: constExpr({ status: "delivered" }),
      label: "deliver",
    },
  ];

  // Invariant: status !== "invalid"
  const invariant: KernelExpression = {
    op: "call",
    fn: "neq",
    args: [
      { op: "get", path: "status" },
      { op: "const", value: "invalid" },
    ],
  };

  const machineDef: StateMachineDef = {
    id: "order-lifecycle",
    name: "Order Lifecycle",
    stateType: stateTypeId,
    eventType: eventTypeId,
    initialState: { status: "pending" },
    transitions,
    invariants: [invariant],
  };

  engine.define(machineDef);

  test("step(): pending + pay → paid", async () => {
    const result = await engine.step("order-lifecycle", { status: "pending" }, { action: "pay" });
    expect(result.success).toBe(true);
    expect(result.newState).toEqual({ status: "paid" });
    expect(result.matchedTransition?.label).toBe("pay");
  });

  test("step(): paid + pay → error (no matching transition)", async () => {
    const result = await engine.step("order-lifecycle", { status: "paid" }, { action: "pay" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No matching transition");
  });

  test("step(): shipped + cancel → error (not defined)", async () => {
    const result = await engine.step(
      "order-lifecycle",
      { status: "shipped" },
      { action: "cancel" },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("No matching transition");
  });

  test("run(): [pay, ship, deliver] → delivered with 3 trace entries", async () => {
    const result = await engine.run("order-lifecycle", { status: "pending" }, [
      { action: "pay" },
      { action: "ship" },
      { action: "deliver" },
    ]);
    expect(result.finalState).toEqual({ status: "delivered" });
    expect(result.trace).toHaveLength(3);
    expect(result.steps).toBe(3);
    expect(result.trace[0].result.newState).toEqual({ status: "paid" });
    expect(result.trace[1].result.newState).toEqual({ status: "shipped" });
    expect(result.trace[2].result.newState).toEqual({ status: "delivered" });
  });

  test("run(): [pay, pay] → fails at step 2", async () => {
    const result = await engine.run("order-lifecycle", { status: "pending" }, [
      { action: "pay" },
      { action: "pay" },
    ]);
    expect(result.finalState).toEqual({ status: "paid" });
    expect(result.trace).toHaveLength(2);
    expect(result.trace[0].result.success).toBe(true);
    expect(result.trace[1].result.success).toBe(false);
  });

  test("reachableStates(): returns all 5 states", async () => {
    const states = await engine.reachableStates("order-lifecycle");
    expect(states).toHaveLength(5);
    const statuses = states.map((s) => (s as { status: string }).status).sort();
    expect(statuses).toEqual(["cancelled", "delivered", "paid", "pending", "shipped"]);
  });

  test("verifyInvariants(): status !== 'invalid' holds for all reachable states", async () => {
    const result = await engine.verifyInvariants("order-lifecycle");
    expect(result.allHold).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("guard: transition only fires when guard passes", async () => {
    const guardedAk = AlgebraicKernel.create();
    const guardedKernel = guardedAk.kernel;
    const guardedEngine = new StateMachineEngine(guardedAk);

    // States: { status: "pending", amount: number } | { status: "paid", amount: number }
    const gStateType = guardedKernel.defineUnion("GuardedState", "1.0", [
      {
        type: "object",
        properties: { status: { const: "pending" }, amount: { type: "number" } },
        required: ["status", "amount"],
      },
      {
        type: "object",
        properties: { status: { const: "paid" }, amount: { type: "number" } },
        required: ["status", "amount"],
      },
    ]);

    const gEventType = guardedKernel.defineUnion("GuardedEvent", "1.0", [
      { type: "object", properties: { action: { const: "pay" } }, required: ["action"] },
    ]);

    // Guard: amount > 100 (read from $state)
    const guardExpr: KernelExpression = {
      op: "call",
      fn: "gt",
      args: [
        { op: "get", path: "amount" }, // reads from $self which we set to $state
        { op: "const", value: 100 },
      ],
    };

    // We need to pass $state's amount to the guard. The guard uses "get" which reads $self.
    // We'll use a different approach: use var + field access
    const guardExprViaVar: KernelExpression = {
      op: "call",
      fn: "gt",
      args: [
        // Access $state.amount via a match on $state — simpler: just use a let
        {
          op: "let",
          name: "_s",
          value: { op: "var", name: "$state" },
          body: {
            op: "match",
            scrutinee: { op: "var", name: "_s" },
            cases: [
              {
                pattern: { kind: "record", fields: { amount: { kind: "var", name: "_amt" } } },
                body: { op: "var", name: "_amt" },
              },
            ],
          },
        },
        { op: "const", value: 100 },
      ],
    };

    guardedEngine.define({
      id: "guarded-machine",
      name: "Guarded Machine",
      stateType: gStateType,
      eventType: gEventType,
      initialState: { status: "pending", amount: 50 },
      transitions: [
        {
          from: recordPat(fieldConst("status", "pending")),
          event: recordPat(fieldConst("action", "pay")),
          to: {
            op: "record",
            fields: {
              status: constExpr("paid"),
              amount: {
                op: "let",
                name: "_s",
                value: { op: "var", name: "$state" },
                body: {
                  op: "match",
                  scrutinee: { op: "var", name: "_s" },
                  cases: [
                    {
                      pattern: { kind: "record", fields: { amount: { kind: "var", name: "_a" } } },
                      body: { op: "var", name: "_a" },
                    },
                  ],
                },
              },
            },
          },
          guard: guardExprViaVar,
          label: "pay-guarded",
        },
      ],
    });

    // amount = 50 → guard fails (50 > 100 is false)
    const failResult = await guardedEngine.step(
      "guarded-machine",
      { status: "pending", amount: 50 },
      { action: "pay" },
    );
    expect(failResult.success).toBe(false);

    // amount = 200 → guard passes (200 > 100 is true)
    const passResult = await guardedEngine.step(
      "guarded-machine",
      { status: "pending", amount: 200 },
      { action: "pay" },
    );
    expect(passResult.success).toBe(true);
    expect(passResult.newState).toEqual({ status: "paid", amount: 200 });
  });
});

// ── Fixture 2: Traffic Light ─────────────────────────────────────────────

describe("Layer 15: StateMachine — Traffic Light", () => {
  const ak = AlgebraicKernel.create();
  const kernel = ak.kernel;
  const engine = new StateMachineEngine(ak);

  const stateTypeId = kernel.defineUnion("TrafficLightState", "1.0", [
    { type: "object", properties: { color: { const: "red" } }, required: ["color"] },
    { type: "object", properties: { color: { const: "yellow" } }, required: ["color"] },
    { type: "object", properties: { color: { const: "green" } }, required: ["color"] },
  ]);

  const eventTypeId = kernel.defineUnion("TrafficLightEvent", "1.0", [
    { type: "object", properties: { action: { const: "timer" } }, required: ["action"] },
  ]);

  engine.define({
    id: "traffic-light",
    name: "Traffic Light",
    stateType: stateTypeId,
    eventType: eventTypeId,
    initialState: { color: "red" },
    transitions: [
      {
        from: recordPat(fieldConst("color", "red")),
        event: recordPat(fieldConst("action", "timer")),
        to: constExpr({ color: "green" }),
        label: "red→green",
      },
      {
        from: recordPat(fieldConst("color", "green")),
        event: recordPat(fieldConst("action", "timer")),
        to: constExpr({ color: "yellow" }),
        label: "green→yellow",
      },
      {
        from: recordPat(fieldConst("color", "yellow")),
        event: recordPat(fieldConst("action", "timer")),
        to: constExpr({ color: "red" }),
        label: "yellow→red",
      },
    ],
  });

  test("run() with 6 timer events: cyclic red→green→yellow→red→green→yellow→red", async () => {
    const events = Array.from({ length: 6 }, () => ({ action: "timer" }));
    const result = await engine.run("traffic-light", { color: "red" }, events);

    expect(result.steps).toBe(6);
    expect(result.finalState).toEqual({ color: "red" });

    const colors = result.trace.map((t) => (t.result.newState as { color: string }).color);
    expect(colors).toEqual(["green", "yellow", "red", "green", "yellow", "red"]);
  });
});
