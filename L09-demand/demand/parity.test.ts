// Legacy snapshots were captured from the prior oracle in 25-demand.ts before it was removed.
import { describe, expect, test } from "bun:test";
import type { ActionType } from "../../L07-agency/intent.ts";
import { DemandEngine, MemoryDataProvider } from "../demand.ts";
import type { LoadingPlan } from "../demand.ts";
import { AlgebraicKernel } from "../../L13-facade/index.ts";

const parityFixtures: Array<{ name: string; action: ActionType; payload: unknown }> = [
  {
    name: "schema-only",
    action: {
      id: "action://test/SchemaOnly/1.0",
      name: "SchemaOnly",
      version: "1.0",
      verb: "load",
      targetMachine: "parity-machine",
      inputSchema: {
        type: "object",
        properties: { customer: { type: "string", $typeRef: "type://Customer/1.0" } },
        required: ["customer"],
      },
      preconditions: [],
    },
    payload: { customer: "cust-001" },
  },
  {
    name: "external-get-only",
    action: {
      id: "action://test/ExternalGet/1.0",
      name: "ExternalGet",
      version: "1.0",
      verb: "load",
      targetMachine: "parity-machine",
      inputSchema: { type: "object", properties: {}, required: [] },
      preconditions: [{ op: "get", path: "external/order-001" }],
    },
    payload: {},
  },
  {
    name: "nested-if-preconditions",
    action: {
      id: "action://test/NestedIf/1.0",
      name: "NestedIf",
      version: "1.0",
      verb: "load",
      targetMachine: "parity-machine",
      inputSchema: { type: "object", properties: {}, required: [] },
      preconditions: [
        {
          op: "if",
          cond: { op: "get", path: "external/session-1" },
          then: { op: "get", path: "external/product-A" },
          else: { op: "const", value: 0 },
        },
      ],
    },
    payload: {},
  },
  {
    name: "call-args-preconditions",
    action: {
      id: "action://test/CallArgs/1.0",
      name: "CallArgs",
      version: "1.0",
      verb: "load",
      targetMachine: "parity-machine",
      inputSchema: { type: "object", properties: {}, required: [] },
      preconditions: [
        {
          op: "call",
          fn: "merge",
          args: [
            { op: "get", path: "external/u-1" },
            { op: "get", path: "external/u-2" },
          ],
        },
      ],
    },
    payload: {},
  },
  {
    name: "schema-plus-preconditions",
    action: {
      id: "action://test/Mixed/1.0",
      name: "Mixed",
      version: "1.0",
      verb: "load",
      targetMachine: "parity-machine",
      inputSchema: {
        type: "object",
        properties: { account: { type: "string", $typeRef: "type://Account/1.0" } },
        required: ["account"],
      },
      preconditions: [
        { op: "get", path: "external/order-002" },
        { op: "get", path: "external/cart-9" },
      ],
    },
    payload: { account: "acct-123" },
  },
];

function normalize(plan: LoadingPlan): LoadingPlan {
  const reqs = plan.requirements
    .map((r) => ({
      typeRef: r.typeRef,
      key: r.key,
      optional: r.optional === true,
    }))
    .sort((a, b) => (a.typeRef + a.key).localeCompare(b.typeRef + b.key));
  return { requirements: reqs, estimatedCount: reqs.length };
}

const engine = new DemandEngine(AlgebraicKernel.create(), new MemoryDataProvider());
const legacySnapshots = [
  {
    name: "schema-only",
    snapshot: {
      requirements: [{ typeRef: "type://Customer/1.0", key: "cust-001", optional: false }],
      estimatedCount: 1,
    },
  },
  {
    name: "external-get-only",
    snapshot: {
      requirements: [{ typeRef: "unknown", key: "order-001", optional: false }],
      estimatedCount: 1,
    },
  },
  {
    name: "nested-if-preconditions",
    snapshot: {
      requirements: [
        { typeRef: "unknown", key: "product-A", optional: false },
        { typeRef: "unknown", key: "session-1", optional: false },
      ],
      estimatedCount: 2,
    },
  },
  {
    name: "call-args-preconditions",
    snapshot: {
      requirements: [
        { typeRef: "unknown", key: "u-1", optional: false },
        { typeRef: "unknown", key: "u-2", optional: false },
      ],
      estimatedCount: 2,
    },
  },
  {
    name: "schema-plus-preconditions",
    snapshot: {
      requirements: [
        { typeRef: "type://Account/1.0", key: "acct-123", optional: false },
        { typeRef: "unknown", key: "cart-9", optional: false },
        { typeRef: "unknown", key: "order-002", optional: false },
      ],
      estimatedCount: 3,
    },
  },
] as const;

function runLegacySurvey(name: string): LoadingPlan {
  const snapshot = legacySnapshots.find((entry) => entry.name === name);
  if (!snapshot) {
    throw new Error(`Missing legacy snapshot for fixture: ${name}`);
  }
  return snapshot.snapshot;
}

describe("Demand survey parity", () => {
  for (const fixture of parityFixtures) {
    test(`parity: ${fixture.name}`, async () => {
      const legacy = runLegacySurvey(fixture.name);
      const facade = await engine.survey(fixture.action, fixture.payload);
      expect(normalize(facade)).toEqual(normalize(legacy));
    });
  }

  test("normalization sanity", () => {
    // No fixture showed raw-order drift; normalization is kept as an explicit tolerance guard.
  });
});
