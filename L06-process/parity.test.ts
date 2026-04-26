/**
 * Layer 15 shape-equivalent parity tolerances are limited to:
 * 1. `matchedTransition` is normalized to `matchedTransitionLabel`.
 * 2. `reachableStates` is compared as a set by sorting states via `JSON.stringify`.
 *
 * This is the complete tolerance list for the current parity check. Stronger
 * parity proofs such as graph-equivalence and fuzzing are explicitly deferred.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { MetamodelKernel } from "../L13-facade/index.ts";
import { StateMachineEngine } from "./engine.ts";
import type {
  InvariantVerificationResult,
  KernelExpression,
  Pattern,
  RunResult,
  StateMachineDef,
  Transition,
  TransitionResult,
} from "../L13-facade/index.ts";

type Operation = "step" | "run" | "reachableStates" | "verifyInvariants";

interface GoldenEntry {
  fixtureId: string;
  operation: Operation;
  label: string;
  input: Record<string, unknown>;
  expected: unknown;
}

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

function createOrderLifecycleMachine(kernel: MetamodelKernel): StateMachineDef {
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
  const invariant: KernelExpression = {
    op: "call",
    fn: "neq",
    args: [
      { op: "get", path: "status" },
      { op: "const", value: "invalid" },
    ],
  };
  return {
    id: "order-lifecycle",
    name: "Order Lifecycle",
    stateType: stateTypeId,
    eventType: eventTypeId,
    initialState: { status: "pending" },
    transitions,
    invariants: [invariant],
  };
}

function createGuardedMachine(kernel: MetamodelKernel): StateMachineDef {
  const stateTypeId = kernel.defineUnion("GuardedState", "1.0", [
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
  const eventTypeId = kernel.defineUnion("GuardedEvent", "1.0", [
    { type: "object", properties: { action: { const: "pay" } }, required: ["action"] },
  ]);
  const guardExpr: KernelExpression = {
    op: "call",
    fn: "gt",
    args: [
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
  return {
    id: "guarded-machine",
    name: "Guarded Machine",
    stateType: stateTypeId,
    eventType: eventTypeId,
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
        guard: guardExpr,
        label: "pay-guarded",
      },
    ],
  };
}

function createTrafficLightMachine(kernel: MetamodelKernel): StateMachineDef {
  const stateTypeId = kernel.defineUnion("TrafficLightState", "1.0", [
    { type: "object", properties: { color: { const: "red" } }, required: ["color"] },
    { type: "object", properties: { color: { const: "yellow" } }, required: ["color"] },
    { type: "object", properties: { color: { const: "green" } }, required: ["color"] },
  ]);
  const eventTypeId = kernel.defineUnion("TrafficLightEvent", "1.0", [
    { type: "object", properties: { action: { const: "timer" } }, required: ["action"] },
  ]);
  return {
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
  };
}

function loadGoldenEntries(): GoldenEntry[] {
  const path = new URL("./parity-golden.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as GoldenEntry[];
}

function createParityEngine(): StateMachineEngine {
  const ak = AlgebraicKernel.create();
  const kernel = ak.kernel;
  const engine = new StateMachineEngine(ak);
  for (const machine of [
    createOrderLifecycleMachine(kernel),
    createGuardedMachine(kernel),
    createTrafficLightMachine(kernel),
  ]) {
    engine.define(machine);
  }
  return engine;
}

function sortStates(states: unknown[]): unknown[] {
  return [...states].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function normalizeTransitionResult(result: TransitionResult): Record<string, unknown> {
  const normalized: Record<string, unknown> = { success: result.success };
  if (result.newState !== undefined) normalized.newState = result.newState;
  if (result.error !== undefined) normalized.error = result.error;
  if (result.matchedTransition?.label !== undefined) {
    normalized.matchedTransitionLabel = result.matchedTransition.label;
  }
  return normalized;
}

function normalizeRunResult(result: RunResult): Record<string, unknown> {
  return {
    finalState: result.finalState,
    trace: result.trace.map((entry) => ({
      state: entry.state,
      event: entry.event,
      result: normalizeTransitionResult(entry.result),
    })),
    steps: result.steps,
  };
}

function normalizeInvariantResult(result: InvariantVerificationResult): Record<string, unknown> {
  return {
    allHold: result.allHold,
    violations: result.violations.map((violation) => ({
      state: violation.state,
      invariant: violation.invariant,
      error: violation.error,
    })),
  };
}

async function executeGoldenEntry(
  engine: StateMachineEngine,
  entry: GoldenEntry,
): Promise<unknown> {
  switch (entry.operation) {
    case "step":
      return normalizeTransitionResult(
        await engine.step(entry.fixtureId, entry.input.currentState, entry.input.event),
      );
    case "run":
      return normalizeRunResult(
        await engine.run(
          entry.fixtureId,
          entry.input.initialState,
          entry.input.events as unknown[],
        ),
      );
    case "reachableStates":
      return sortStates(await engine.reachableStates(entry.fixtureId));
    case "verifyInvariants":
      return normalizeInvariantResult(await engine.verifyInvariants(entry.fixtureId));
  }
}

describe("Layer 15 algebra parity", () => {
  const goldenEntries = loadGoldenEntries();
  const engine = createParityEngine();

  for (const entry of goldenEntries) {
    test(`${entry.fixtureId}/${entry.operation}/${entry.label}`, async () => {
      const actual = await executeGoldenEntry(engine, entry);
      const expected =
        entry.operation === "reachableStates"
          ? sortStates(entry.expected as unknown[])
          : entry.expected;
      expect(actual).toEqual(expected);
    });
  }
});
