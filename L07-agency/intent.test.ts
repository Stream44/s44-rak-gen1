import { describe, test, expect, beforeEach } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import type { KernelExpression, Pattern } from "../L13-facade/index.ts";
import type { Transition } from "../L06-process/engine.ts";
import { ModelLoader } from "../L09-demand/model-loader.ts";
import { IntentProcessor } from "./intent.ts";
import type { ActionType, EmittedEvent } from "./intent.ts";

// ── Pattern helpers ──────────────────────────────────────────────────────

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

// ── Setup helper ─────────────────────────────────────────────────────────

const MACHINE_ID = "order-lifecycle";

const APP_TEST_MODEL = {
  model: "OrderApp",
  version: "1.0.0",
  origin: "test.intent",
  entities: {
    Order: {
      attributes: {
        status: { type: "string" },
      },
      required: ["status"],
    },
  },
  lifecycle: {
    states: ["a", "b"],
    initial: "a",
    terminal: ["b"],
    transitions: [{ from: "a", to: "b", verb: "advance" }],
  },
  actions: {
    AdvanceOrder: {
      verb: "advance",
      targetField: "id",
      inputSchema: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
        },
        required: ["id"],
      },
    },
  },
} as const;

function setup() {
  const kernel = AlgebraicKernel.create();

  // OrderState union: pending | confirmed | paid | shipped | delivered | cancelled
  const stateTypeId = kernel.defineUnion("OrderState", "1.0", [
    { type: "object", properties: { status: { const: "pending" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "confirmed" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "paid" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "shipped" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "delivered" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "cancelled" } }, required: ["status"] },
  ]);

  // OrderEvent union: confirm | pay | ship | deliver | cancel
  const eventTypeId = kernel.defineUnion("OrderEvent", "1.0", [
    { type: "object", properties: { verb: { const: "confirm" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "pay" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "ship" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "deliver" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "cancel" } }, required: ["verb"] },
  ]);

  // Transitions
  const transitions: Transition[] = [
    {
      from: recordPat(fieldConst("status", "pending")),
      event: recordPat(fieldConst("verb", "confirm")),
      to: constExpr({ status: "confirmed" }),
      label: "confirm",
    },
    {
      from: recordPat(fieldConst("status", "confirmed")),
      event: recordPat(fieldConst("verb", "pay")),
      to: constExpr({ status: "paid" }),
      label: "pay",
    },
    {
      from: recordPat(fieldConst("status", "paid")),
      event: recordPat(fieldConst("verb", "ship")),
      to: constExpr({ status: "shipped" }),
      label: "ship",
    },
    {
      from: recordPat(fieldConst("status", "shipped")),
      event: recordPat(fieldConst("verb", "deliver")),
      to: constExpr({ status: "delivered" }),
      label: "deliver",
    },
    {
      from: recordPat(fieldConst("status", "pending")),
      event: recordPat(fieldConst("verb", "cancel")),
      to: constExpr({ status: "cancelled" }),
      label: "cancel",
    },
  ];

  kernel.defineStateMachine({
    id: MACHINE_ID,
    name: "Order Lifecycle",
    stateType: stateTypeId,
    eventType: eventTypeId,
    initialState: { status: "pending" },
    transitions,
  });

  const processor = new IntentProcessor(kernel);

  // Define actions
  const inputSchema = {
    type: "object" as const,
    properties: { orderId: { type: "string" as const } },
    required: ["orderId"],
  };

  const confirmAction = processor.defineAction("ConfirmOrder", "1.0", {
    verb: "confirm",
    inputSchema,
    targetMachine: MACHINE_ID,
  });

  // PayOrder: precondition amount > 0
  const amountPrecondition: KernelExpression = {
    op: "call",
    fn: "gt",
    args: [
      {
        op: "let",
        name: "_p",
        value: { op: "var", name: "$self" },
        body: {
          op: "match",
          scrutinee: { op: "var", name: "_p" },
          cases: [
            {
              pattern: { kind: "record", fields: { amount: { kind: "var", name: "_amt" } } },
              body: { op: "var", name: "_amt" },
            },
          ],
        },
      },
      { op: "const", value: 0 },
    ],
  };

  const payAction = processor.defineAction("PayOrder", "1.0", {
    verb: "pay",
    inputSchema: {
      type: "object" as const,
      properties: {
        orderId: { type: "string" as const },
        amount: { type: "number" as const },
      },
      required: ["orderId", "amount"],
    },
    targetMachine: MACHINE_ID,
    preconditions: [amountPrecondition],
  });

  const shipAction = processor.defineAction("ShipOrder", "1.0", {
    verb: "ship",
    inputSchema,
    targetMachine: MACHINE_ID,
  });

  const deliverAction = processor.defineAction("DeliverOrder", "1.0", {
    verb: "deliver",
    inputSchema,
    targetMachine: MACHINE_ID,
  });

  const cancelAction = processor.defineAction("CancelOrder", "1.0", {
    verb: "cancel",
    inputSchema,
    targetMachine: MACHINE_ID,
  });

  return { kernel, processor, confirmAction, payAction, shipAction, deliverAction, cancelAction };
}

function setupApp() {
  const kernel = AlgebraicKernel.create();
  const loader = new ModelLoader(kernel);
  const processor = new IntentProcessor(kernel);
  loader.setIntentProcessor(processor);
  return { app: loader.boot(APP_TEST_MODEL), processor };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Layer 23: Intent Processing Pipeline", () => {
  let kernel: ReturnType<typeof setup>["kernel"];
  let processor: IntentProcessor;
  let confirmAction: ActionType;
  let payAction: ActionType;
  let shipAction: ActionType;
  let deliverAction: ActionType;
  let cancelAction: ActionType;

  beforeEach(() => {
    const s = setup();
    kernel = s.kernel;
    processor = s.processor;
    confirmAction = s.confirmAction;
    payAction = s.payAction;
    shipAction = s.shipAction;
    deliverAction = s.deliverAction;
    cancelAction = s.cancelAction;
  });

  test("1. defineAction creates an action, resolveAction returns it", () => {
    const resolved = processor.resolveAction(confirmAction.id);
    expect(resolved.id).toBe(confirmAction.id);
    expect(resolved.name).toBe("ConfirmOrder");
    expect(resolved.version).toBe("1.0");
    expect(resolved.verb).toBe("confirm");
    expect(resolved.targetMachine).toBe(MACHINE_ID);
  });

  test("2. Submit ConfirmOrder intent: pending -> confirmed, event emitted", async () => {
    const result = await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-1",
      payload: { orderId: "order-1" },
    });

    expect(result.success).toBe(true);
    expect(result.previousState).toEqual({ status: "pending" });
    expect(result.newState).toEqual({ status: "confirmed" });
    expect(result.emittedEvents).toHaveLength(1);
    expect(result.emittedEvents[0].type).toBe(
      "event://github.com/Stream44/s44-rak-gen1@1.0/ConfirmOrder/1.0",
    );
  });

  test("3. Submit PayOrder intent: confirmed -> paid", async () => {
    // First confirm
    await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-2",
      payload: { orderId: "order-2" },
    });

    // Then pay
    const result = await processor.submit({
      action: payAction.id,
      target: MACHINE_ID,
      targetKey: "order-2",
      payload: { orderId: "order-2", amount: 99.99 },
    });

    expect(result.success).toBe(true);
    expect(result.previousState).toEqual({ status: "confirmed" });
    expect(result.newState).toEqual({ status: "paid" });
  });

  test("4. Full lifecycle: pending -> confirmed -> paid -> shipped -> delivered", async () => {
    const key = "order-3";
    const payload = { orderId: key };

    const r1 = await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    expect(r1.success).toBe(true);
    expect(r1.newState).toEqual({ status: "confirmed" });

    const r2 = await processor.submit({
      action: payAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload: { orderId: key, amount: 50 },
    });
    expect(r2.success).toBe(true);
    expect(r2.newState).toEqual({ status: "paid" });

    const r3 = await processor.submit({
      action: shipAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    expect(r3.success).toBe(true);
    expect(r3.newState).toEqual({ status: "shipped" });

    const r4 = await processor.submit({
      action: deliverAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    expect(r4.success).toBe(true);
    expect(r4.newState).toEqual({ status: "delivered" });
  });

  test("5. Submit with invalid payload (missing required field) returns validation error", async () => {
    const result = await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-bad",
      payload: {}, // missing orderId
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("validation failed");
  });

  test("6. PayOrder with amount=0 fails precondition", async () => {
    // First confirm
    await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-pre",
      payload: { orderId: "order-pre" },
    });

    // Pay with amount = 0
    const result = await processor.submit({
      action: payAction.id,
      target: MACHINE_ID,
      targetKey: "order-pre",
      payload: { orderId: "order-pre", amount: 0 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("precondition failed");
  });

  test("7. Submit to terminal state (delivered + confirm) returns no transition error", async () => {
    const key = "order-terminal";
    const payload = { orderId: key };

    // Drive to delivered
    await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    await processor.submit({
      action: payAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload: { orderId: key, amount: 10 },
    });
    await processor.submit({ action: shipAction.id, target: MACHINE_ID, targetKey: key, payload });
    await processor.submit({
      action: deliverAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });

    // Now try to confirm again
    const result = await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No matching transition");
  });

  test("8. processAll: [Confirm, Pay, Ship, Deliver] returns 4 results, all success", async () => {
    const key = "order-batch";
    const payload = { orderId: key };

    const results = await processor.processAll([
      { action: confirmAction.id, target: MACHINE_ID, targetKey: key, payload },
      {
        action: payAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload: { orderId: key, amount: 25 },
      },
      { action: shipAction.id, target: MACHINE_ID, targetKey: key, payload },
      { action: deliverAction.id, target: MACHINE_ID, targetKey: key, payload },
    ]);

    expect(results).toHaveLength(4);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results[0].newState).toEqual({ status: "confirmed" });
    expect(results[1].newState).toEqual({ status: "paid" });
    expect(results[2].newState).toEqual({ status: "shipped" });
    expect(results[3].newState).toEqual({ status: "delivered" });
  });

  test("9. onEvent: subscribe, submit 3 intents, receive 3 events", async () => {
    const received: EmittedEvent[] = [];
    processor.onEvent((e) => received.push(e));

    const key = "order-events";
    const payload = { orderId: key };

    await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    await processor.submit({
      action: payAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload: { orderId: key, amount: 10 },
    });
    await processor.submit({ action: shipAction.id, target: MACHINE_ID, targetKey: key, payload });

    expect(received).toHaveLength(3);
    expect(received[0].type).toContain("ConfirmOrder");
    expect(received[1].type).toContain("PayOrder");
    expect(received[2].type).toContain("ShipOrder");
  });

  test("10. Event has causedBy pointing to intent CID", async () => {
    const result = await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-caused",
      payload: { orderId: "order-caused" },
    });

    expect(result.success).toBe(true);
    const event = result.emittedEvents[0];
    expect(event.causedBy).toBe(result.intent.id);
    expect(event.causedBy).toMatch(/^cid:sha256:/);
  });

  test("11. Each event has unique CID", async () => {
    const key = "order-unique";
    const payload = { orderId: key };

    const r1 = await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    const r2 = await processor.submit({
      action: payAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload: { orderId: key, amount: 5 },
    });
    const r3 = await processor.submit({
      action: shipAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });

    const cids = [r1.emittedEvents[0].id, r2.emittedEvents[0].id, r3.emittedEvents[0].id];

    // All CIDs are unique
    const unique = new Set(cids);
    expect(unique.size).toBe(3);

    // All are content-addressed
    for (const cid of cids) {
      expect(cid).toMatch(/^cid:sha256:/);
    }
  });

  test("12. setState/getState: set initial state, verify getState returns it", () => {
    processor.setState("my-key", { status: "paid" });
    expect(processor.getState("my-key")).toEqual({ status: "paid" });
    expect(processor.getState("nonexistent")).toBeUndefined();
  });

  test("13. removeInstance evicts the key and fires one removed event", () => {
    const { app } = setupApp();
    const events: EmittedEvent[] = [];
    app.onEvent((event) => events.push(event));

    app.setState("thing-1", { status: "a" });
    app.removeInstance("thing-1");

    expect(app.getState("thing-1")).toBeUndefined();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "removed",
      targetKey: "thing-1",
      previousState: { status: "a" },
      newState: undefined,
    });
  });

  test("14. removeInstance on a non-existent key is a no-op with no event", () => {
    const { app } = setupApp();
    let calls = 0;
    app.onEvent(() => {
      calls += 1;
    });

    app.removeInstance("missing");

    expect(app.getState("missing")).toBeUndefined();
    expect(calls).toBe(0);
  });

  test("15. onEvent subscribers receive removed events with previousState populated", () => {
    const { app } = setupApp();
    const received: Array<{
      kind?: "submitted" | "removed";
      action: string;
      targetKey: string;
      previousState: unknown;
      newState: unknown;
    }> = [];
    app.onEvent((event) => received.push(event));

    app.setState("thing-2", { status: "seeded" });
    app.removeInstance("thing-2");

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      kind: "removed",
      action: "removed",
      targetKey: "thing-2",
      previousState: { status: "seeded" },
      newState: undefined,
    });
  });

  test("16. beginTransaction + commitTransaction emits buffered sub-events and one transactionCommitted envelope", async () => {
    const received: EmittedEvent[] = [];
    processor.onEvent((event) => received.push(event));

    const tx = processor.beginTransaction();
    await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-tx-1",
      payload: { orderId: "order-tx-1" },
    });
    await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-tx-2",
      payload: { orderId: "order-tx-2" },
    });
    processor.commitTransaction(tx);

    expect(received).toHaveLength(3);
    expect(received[0]).toMatchObject({ kind: "submitted" });
    expect(received[1]).toMatchObject({ kind: "submitted" });
    expect(received[2]).toMatchObject({
      kind: "transactionCommitted",
      events: [
        expect.objectContaining({ kind: "submitted" }),
        expect.objectContaining({ kind: "submitted" }),
      ],
    });
  });

  test("17. beginTransaction + rollbackTransaction reverts state and emits nothing", async () => {
    const received: EmittedEvent[] = [];
    processor.onEvent((event) => received.push(event));

    const tx = processor.beginTransaction();
    await processor.submit({
      action: confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-rollback",
      payload: { orderId: "order-rollback" },
    });
    expect(processor.getState("order-rollback")).toEqual({ status: "confirmed" });
    processor.rollbackTransaction(tx);

    expect(processor.getState("order-rollback")).toBeUndefined();
    expect(received).toEqual([]);
  });

  test("18. nested beginTransaction throws", () => {
    const tx = processor.beginTransaction();
    expect(() => processor.beginTransaction()).toThrow("Nested transactions are not supported.");
    processor.rollbackTransaction(tx);
  });

  test("19. app.batch commits state changes once and emits one transactionCommitted event", async () => {
    const { app } = setupApp();
    const received: Array<
      | {
          kind?: "submitted" | "removed";
          action: string;
          targetKey: string;
          previousState: unknown;
          newState: unknown;
        }
      | {
          kind: "transactionCommitted";
          id: string;
          timestamp: string;
          events: Array<{
            kind?: "submitted" | "removed";
            action: string;
            targetKey: string;
            previousState: unknown;
            newState: unknown;
          }>;
        }
    > = [];
    app.onEvent((event) => received.push(event));

    await app.batch([
      { verb: "advance", target: "thing-1", payload: { id: "thing-1" } },
      { verb: "advance", target: "thing-2", payload: { id: "thing-2" } },
    ]);

    expect(app.getState("thing-1")).toEqual({ status: "b" });
    expect(app.getState("thing-2")).toEqual({ status: "b" });
    expect(received.filter((event) => event.kind === "transactionCommitted")).toHaveLength(1);
    expect(received.at(-1)).toMatchObject({
      kind: "transactionCommitted",
      events: [
        expect.objectContaining({ targetKey: "thing-1" }),
        expect.objectContaining({ targetKey: "thing-2" }),
      ],
    });
  });
});
