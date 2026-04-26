import { describe, expect, test } from "bun:test";
import { ADK_ORIGIN } from "../../L01-foundation/utils.ts";
import type { KernelExpression, Pattern } from "../../L04-expression/evaluator.ts";
import type { Transition } from "../../L06-process/engine.ts";
import type { TransitionResult } from "../../L06-process/engine.ts";
import { AlgebraicKernel } from "../../L13-facade/index.ts";
import { IntentProcessor } from "../intent.ts";
import type {
  ActionType,
  EmittedEvent,
  Intent,
  IntentResult,
  IntentStageInput,
} from "../intent.ts";
import { authorizeCapability } from "./modules/authorize-capability.ts";
import { checkPreconditions } from "./modules/check-preconditions.ts";
import { emitEvents } from "./modules/emit-events.ts";
import { validatePayload } from "./modules/validate-payload.ts";

/**
 * Shape-equivalent tolerance:
 *   intent.timestamp + emittedEvent.timestamp: ISO-8601 within ±2s of
 *     Date.now() at assertion time. event.timestamp equals
 *     intent.timestamp strictly, so there is only one wall-clock read.
 *   All other fields STRICT: intent.id, emittedEvent.id, previousState,
 *     newState, success, error, emittedEvents ordering, event.type,
 *     event.source, event.causedBy, event.data deep-equality.
 */

const submitChain = async (
  input: IntentStageInput,
  processor: IntentProcessor,
): Promise<IntentResult> =>
  await emitEvents(
    authorizeCapability(
      checkPreconditions(validatePayload(input, { $processor: processor }), {
        $processor: processor,
      }),
      { $processor: processor },
    ),
    { $processor: processor },
  );
const MACHINE_ID = "order-lifecycle";

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

function withoutTimestamps(result: IntentResult): IntentResult {
  return {
    ...result,
    intent: { ...result.intent, timestamp: "<timestamp>" },
    emittedEvents: result.emittedEvents.map((event) => {
      const {
        entity: _entity,
        targetMachine: _targetMachine,
        verb: _verb,
        beforeState: _beforeState,
        afterState: _afterState,
        payload: _payload,
        at: _at,
        causationKey: _causationKey,
        ...rest
      } = event as typeof event & {
        entity?: unknown;
        targetMachine?: unknown;
        verb?: unknown;
        beforeState?: unknown;
        afterState?: unknown;
        payload?: unknown;
        at?: unknown;
        causationKey?: unknown;
      };
      return {
        ...rest,
        kind: event.kind ?? "submitted",
        timestamp: "<timestamp>",
      };
    }),
  };
}

function expectTimestampCloseToNow(timestamp: string): void {
  expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
  expect(Math.abs(Date.now() - Date.parse(timestamp))).toBeLessThanOrEqual(2_000);
}

function expectShapeEquivalent(actual: IntentResult, expected: IntentResult): void {
  expect(withoutTimestamps(actual)).toEqual(withoutTimestamps(expected));
  expectTimestampCloseToNow(actual.intent.timestamp);
  expectTimestampCloseToNow(expected.intent.timestamp);
  expect(actual.emittedEvents).toHaveLength(expected.emittedEvents.length);
  for (let index = 0; index < actual.emittedEvents.length; index += 1) {
    expect(actual.emittedEvents[index]!.timestamp).toBe(actual.intent.timestamp);
    expect(expected.emittedEvents[index]!.timestamp).toBe(expected.intent.timestamp);
    expectTimestampCloseToNow(actual.emittedEvents[index]!.timestamp);
    expectTimestampCloseToNow(expected.emittedEvents[index]!.timestamp);
  }
}

// Legacy submit flow parity oracle, reproduced from src/23-intent.ts.
function legacySubmit(
  kernel: AlgebraicKernel,
  processor: IntentProcessor,
  partial: Omit<Intent, "id" | "timestamp">,
): IntentResult {
  const timestamp = new Date().toISOString();
  const { cid: intentCid } = processor.encoder.encodeAndHash(partial.payload);
  const { cid } = processor.encoder.encodeAndHash({
    actionId: partial.action,
    payload: partial.payload,
    target: partial.target ?? null,
    capabilities: [],
  });
  const intent: Intent = { ...partial, id: intentCid, cid, timestamp };
  let action: ActionType;
  try {
    action = processor.resolveAction(intent.action);
  } catch {
    return { success: false, intent, emittedEvents: [], error: `Unknown action: ${intent.action}` };
  }
  const validation = processor.validator.validate(intent.payload, action.inputSchema);
  if (!validation.valid)
    return { success: false, intent, emittedEvents: [], error: "validation failed" };
  const initialState = kernel.stateMachines.resolve(action.targetMachine).initialState;
  const previousState = processor.getState(intent.targetKey) ?? initialState;
  for (const precondition of action.preconditions) {
    const result = kernel.evaluate(precondition, { $self: intent.payload, $state: previousState });
    if (result.error || !result.value)
      return {
        success: false,
        intent,
        previousState,
        emittedEvents: [],
        error: `precondition failed: ${action.name}`,
      };
  }
  const stepped = kernel.stepStateMachine(action.targetMachine, previousState, {
    verb: action.verb,
  });
  if (!stepped.success)
    return { success: false, intent, previousState, emittedEvents: [], error: stepped.error };
  const newState = stepped.newState;
  processor.setState(intent.targetKey, newState);
  const data = { previousState, newState, payload: intent.payload };
  const { cid: eventCid } = processor.encoder.encodeAndHash(data);
  const event: EmittedEvent = {
    id: eventCid,
    kind: "submitted",
    type: `event://${action.origin ?? ADK_ORIGIN}/${action.name}/1.0`,
    source: action.targetMachine,
    targetKey: intent.targetKey,
    data,
    causedBy: intent.id,
    timestamp: intent.timestamp,
  };
  for (const handler of processor.eventHandlers) handler(event);
  return { success: true, intent, previousState, newState, emittedEvents: [event] };
}

function makeStageInput(
  processor: IntentProcessor,
  partial: Omit<Intent, "id" | "timestamp">,
): IntentStageInput {
  void processor;
  return {
    action: partial.action,
    target: partial.target,
    targetKey: partial.targetKey,
    payload: partial.payload as object,
    issuer: partial.issuer,
  };
}

// mirrors 23-intent.test.ts:30-142
function setup() {
  const kernel = AlgebraicKernel.create();
  const stateTypeId = kernel.defineUnion("OrderState", "1.0", [
    { type: "object", properties: { status: { const: "pending" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "confirmed" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "paid" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "shipped" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "delivered" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "cancelled" } }, required: ["status"] },
  ]);
  const eventTypeId = kernel.defineUnion("OrderEvent", "1.0", [
    { type: "object", properties: { verb: { const: "confirm" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "pay" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "ship" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "deliver" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "cancel" } }, required: ["verb"] },
  ]);
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
      properties: { orderId: { type: "string" as const }, amount: { type: "number" as const } },
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
  processor.defineAction("CancelOrder", "1.0", {
    verb: "cancel",
    inputSchema,
    targetMachine: MACHINE_ID,
  });
  return { kernel, processor, confirmAction, payAction, shipAction, deliverAction };
}

describe("IntentProcessor parity", () => {
  test("1. Happy-path ConfirmOrder matches legacy submit and direct chain", async () => {
    const legacyEnv = setup();
    const partial = {
      action: legacyEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-1",
      payload: { orderId: "order-1" },
    };
    const expected = legacySubmit(legacyEnv.kernel, legacyEnv.processor, partial);
    const submitEnv = setup();
    const actual = await submitEnv.processor.submit({
      ...partial,
      action: submitEnv.confirmAction.id,
    });
    const directEnv = setup();
    const direct = await submitChain(
      makeStageInput(directEnv.processor, { ...partial, action: directEnv.confirmAction.id }),
      directEnv.processor,
    );
    expectShapeEquivalent(actual, expected);
    expectShapeEquivalent(actual, direct);
  });

  test("2. Validation failure matches legacy submit", async () => {
    const legacyEnv = setup();
    const expected = legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
      action: legacyEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-bad",
      payload: {},
    });
    const submitEnv = setup();
    const actual = await submitEnv.processor.submit({
      action: submitEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-bad",
      payload: {},
    });
    expect(actual.success).toBe(false);
    expect(actual.error).toBe("validation failed");
    expectShapeEquivalent(actual, expected);
  });

  test("3. Precondition failure matches legacy submit", async () => {
    const legacyEnv = setup();
    legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
      action: legacyEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-pre",
      payload: { orderId: "order-pre" },
    });
    const expected = legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
      action: legacyEnv.payAction.id,
      target: MACHINE_ID,
      targetKey: "order-pre",
      payload: { orderId: "order-pre", amount: 0 },
    });
    const submitEnv = setup();
    await submitEnv.processor.submit({
      action: submitEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: "order-pre",
      payload: { orderId: "order-pre" },
    });
    const actual = await submitEnv.processor.submit({
      action: submitEnv.payAction.id,
      target: MACHINE_ID,
      targetKey: "order-pre",
      payload: { orderId: "order-pre", amount: 0 },
    });
    expect(actual.success).toBe(false);
    expect(actual.error).toBe("precondition failed: PayOrder");
    expectShapeEquivalent(actual, expected);
  });

  test("4. Unknown action matches legacy submit", async () => {
    const partial = {
      action: "action://github.com/Stream44/s44-rak-gen1@1.0/Missing/1.0",
      target: MACHINE_ID,
      targetKey: "order-unknown",
      payload: { orderId: "order-unknown" },
    };
    const legacyEnv = setup();
    const expected = legacySubmit(legacyEnv.kernel, legacyEnv.processor, partial);
    const submitEnv = setup();
    const actual = await submitEnv.processor.submit(partial);
    expect(actual.success).toBe(false);
    expect(actual.error).toContain("Unknown action:");
    expectShapeEquivalent(actual, expected);
  });

  test("5. Terminal-state no-transition matches legacy submit", async () => {
    const key = "order-terminal";
    const payload = { orderId: key };
    const legacyEnv = setup();
    legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
      action: legacyEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
      action: legacyEnv.payAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload: { orderId: key, amount: 10 },
    });
    legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
      action: legacyEnv.shipAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
      action: legacyEnv.deliverAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    const expected = legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
      action: legacyEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    const submitEnv = setup();
    await submitEnv.processor.submit({
      action: submitEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    await submitEnv.processor.submit({
      action: submitEnv.payAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload: { orderId: key, amount: 10 },
    });
    await submitEnv.processor.submit({
      action: submitEnv.shipAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    await submitEnv.processor.submit({
      action: submitEnv.deliverAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    const actual = await submitEnv.processor.submit({
      action: submitEnv.confirmAction.id,
      target: MACHINE_ID,
      targetKey: key,
      payload,
    });
    expect(actual.success).toBe(false);
    expect(actual.error).toContain("No matching transition");
    expectShapeEquivalent(actual, expected);
  });

  test("6. processAll lifecycle matches legacy submit and direct chain", async () => {
    const key = "order-batch";
    const payload = { orderId: key };
    const legacyEnv = setup();
    const expected = [
      legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
        action: legacyEnv.confirmAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload,
      }),
      legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
        action: legacyEnv.payAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload: { orderId: key, amount: 25 },
      }),
      legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
        action: legacyEnv.shipAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload,
      }),
      legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
        action: legacyEnv.deliverAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload,
      }),
    ];
    const submitEnv = setup();
    const actual = await submitEnv.processor.processAll([
      { action: submitEnv.confirmAction.id, target: MACHINE_ID, targetKey: key, payload },
      {
        action: submitEnv.payAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload: { orderId: key, amount: 25 },
      },
      { action: submitEnv.shipAction.id, target: MACHINE_ID, targetKey: key, payload },
      { action: submitEnv.deliverAction.id, target: MACHINE_ID, targetKey: key, payload },
    ]);
    const directEnv = setup();
    const direct = [
      await submitChain(
        makeStageInput(directEnv.processor, {
          action: directEnv.confirmAction.id,
          target: MACHINE_ID,
          targetKey: key,
          payload,
        }),
        directEnv.processor,
      ),
      await submitChain(
        makeStageInput(directEnv.processor, {
          action: directEnv.payAction.id,
          target: MACHINE_ID,
          targetKey: key,
          payload: { orderId: key, amount: 25 },
        }),
        directEnv.processor,
      ),
      await submitChain(
        makeStageInput(directEnv.processor, {
          action: directEnv.shipAction.id,
          target: MACHINE_ID,
          targetKey: key,
          payload,
        }),
        directEnv.processor,
      ),
      await submitChain(
        makeStageInput(directEnv.processor, {
          action: directEnv.deliverAction.id,
          target: MACHINE_ID,
          targetKey: key,
          payload,
        }),
        directEnv.processor,
      ),
    ];
    expect(actual).toHaveLength(4);
    for (let index = 0; index < actual.length; index += 1) {
      expectShapeEquivalent(actual[index]!, expected[index]!);
      expectShapeEquivalent(actual[index]!, direct[index]!);
    }
  });

  test("7. Event subscription preserves emitted event ordering", async () => {
    const key = "order-events";
    const payload = { orderId: key };
    const legacyEnv = setup();
    const legacyReceived: EmittedEvent[] = [];
    legacyEnv.processor.onEvent((event) => legacyReceived.push(event));
    const expected = [
      legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
        action: legacyEnv.confirmAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload,
      }),
      legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
        action: legacyEnv.payAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload: { orderId: key, amount: 10 },
      }),
      legacySubmit(legacyEnv.kernel, legacyEnv.processor, {
        action: legacyEnv.shipAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload,
      }),
    ];
    const submitEnv = setup();
    const received: EmittedEvent[] = [];
    submitEnv.processor.onEvent((event) => received.push(event));
    const actual = [
      await submitEnv.processor.submit({
        action: submitEnv.confirmAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload,
      }),
      await submitEnv.processor.submit({
        action: submitEnv.payAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload: { orderId: key, amount: 10 },
      }),
      await submitEnv.processor.submit({
        action: submitEnv.shipAction.id,
        target: MACHINE_ID,
        targetKey: key,
        payload,
      }),
    ];
    for (let index = 0; index < actual.length; index += 1)
      expectShapeEquivalent(actual[index]!, expected[index]!);
    expect(received).toHaveLength(3);
    expect(legacyReceived).toHaveLength(3);
    expect(received.map((event) => event.type)).toEqual(legacyReceived.map((event) => event.type));
    expect(received[0]!.type).toContain("ConfirmOrder");
    expect(received[1]!.type).toContain("PayOrder");
    expect(received[2]!.type).toContain("ShipOrder");
  });

  test("8. emit-events dispatches Layer-15 step morphism via registry", async () => {
    const { kernel: ak } = setup();
    const verb = "confirm";
    const machineId = MACHINE_ID;
    const machine = ak.stateMachines.resolve(machineId);
    const currentState = machine.initialState;
    const viaRegistry = (await ak.morphisms.evaluate("morphism://adk/step/1.0", {
      machine,
      currentState,
      event: { verb },
    })) as TransitionResult & { matchedTransitionLabel?: string };
    const viaConvenience = ak.stepStateMachine(machineId, currentState, { verb });
    expect(viaRegistry.success).toBe(viaConvenience.success);
    expect(viaRegistry.newState).toEqual(viaConvenience.newState);
    expect(viaRegistry.matchedTransitionLabel).toBe(viaConvenience.matchedTransition?.label);
  });
});
