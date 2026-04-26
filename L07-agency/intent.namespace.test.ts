import { describe, expect, test } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import type { KernelExpression, Pattern } from "../L04-expression/evaluator.ts";
import type { Transition } from "../L06-process/engine.ts";
import { IntentProcessor, type EmittedEvent, type SubmittedEvent } from "./intent.ts";

const MACHINE_ID = "OrderLifecycle";

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

function setupProcessor(): { processor: IntentProcessor; actionId: string } {
  const kernel = AlgebraicKernel.create();
  const stateTypeId = kernel.defineUnion("OrderState", "1.0", [
    { type: "object", properties: { status: { const: "pending" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "paid" } }, required: ["status"] },
  ]);
  const eventTypeId = kernel.defineUnion("OrderEvent", "1.0", [
    { type: "object", properties: { verb: { const: "pay" } }, required: ["verb"] },
  ]);
  const transitions: Transition[] = [
    {
      from: recordPat(fieldConst("status", "pending")),
      event: recordPat(fieldConst("verb", "pay")),
      to: constExpr({ status: "paid" }),
      label: "pay",
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
  const action = processor.defineAction("PayOrder", "1.0", {
    verb: "pay",
    targetMachine: MACHINE_ID,
    inputSchema: { type: "object" },
  });
  return { processor, actionId: action.id };
}

describe("intent namespacing", () => {
  test("SubmittedEvent carries targetKey (DC9)", async () => {
    const { processor, actionId } = setupProcessor();
    const captured: EmittedEvent[] = [];
    processor.onEvent((event) => captured.push(event));

    await processor.submit({
      action: actionId,
      target: MACHINE_ID,
      targetKey: "key-1",
      payload: {},
    });

    const submitted = captured.find((event) => event.kind === "submitted") as
      | SubmittedEvent
      | undefined;
    expect(submitted?.targetKey).toBe("key-1");
  });

  test("per-binding namespacing isolates entity and aggregate state (DC8)", () => {
    const { processor } = setupProcessor();

    processor.setStateForBinding("todo-records", "k", { title: "x" });
    processor.setStateForBinding("order-lifecycles", "k", { currentState: "paid" });

    expect(processor.readStoreForBinding("todo-records", "k")).toEqual({ title: "x" });
    expect(processor.readStoreForBinding("order-lifecycles", "k")).toEqual({
      currentState: "paid",
    });
  });

  test("listStoreForBinding enumerates one binding only", () => {
    const { processor } = setupProcessor();

    processor.setStateForBinding("a", "k1", 1);
    processor.setStateForBinding("a", "k2", 2);
    processor.setStateForBinding("b", "k1", 99);

    const entries = processor.listStoreForBinding("a");
    expect(entries.map(([key]) => key).sort()).toEqual(["k1", "k2"]);
  });

  test("currentStateForMachine resolves via aggregate binding", () => {
    const { processor } = setupProcessor();

    processor.registerMachineAggregateBinding("OrderLifecycle", "order-lifecycles");
    processor.setStateForBinding("order-lifecycles", "ord-42", { currentState: "paid" });

    expect(processor.currentStateForMachine("OrderLifecycle", "ord-42")).toEqual({
      currentState: "paid",
    });
  });

  test("currentStateForMachine falls back to <machineId>-aggregate convention", () => {
    const { processor } = setupProcessor();

    processor.setStateForBinding("OrderLifecycle-aggregate", "ord-9", { currentState: "shipped" });

    expect(processor.currentStateForMachine("OrderLifecycle", "ord-9")).toEqual({
      currentState: "shipped",
    });
  });
});
