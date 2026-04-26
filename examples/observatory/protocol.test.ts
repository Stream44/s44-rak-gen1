import { describe, expect, test } from "bun:test";
import type { WorldState } from "./protocol.ts";

const WORLD_STATE_KEYS: Array<keyof WorldState> = [
  "model",
  "types",
  "enums",
  "edges",
  "machines",
  "actions",
  "contracts",
  "instances",
  "recentEvents",
  "metamodels",
  "modelTypes",
  "morphisms",
  "algebraOperators",
  "specialisationRules",
  "capabilities",
  "pluggableInterfaces",
  "intents",
  "policies",
  "projections",
  "bundles",
  "auditLog",
  "models",
];

function buildWorldState(overrides: Partial<WorldState>): WorldState {
  return {
    model: { name: "ecommerce", version: "1.0.0", origin: "https://example.test" },
    types: [],
    enums: [],
    edges: [],
    machines: [],
    actions: [],
    contracts: [],
    instances: [],
    recentEvents: [],
    metamodels: [],
    modelTypes: [],
    morphisms: [],
    algebraOperators: [],
    specialisationRules: [],
    capabilities: [],
    pluggableInterfaces: [],
    intents: [],
    policies: [],
    projections: [],
    bundles: [],
    auditLog: [],
    models: [],
    ...overrides,
  };
}

function expectSingleEntryArray<T extends Record<string, unknown>>(
  value: T[] | undefined,
  keys: string[],
): void {
  expect(Array.isArray(value)).toBe(true);
  expect(value).toHaveLength(1);
  const entry = value[0];
  for (const key of keys) expect(entry).toHaveProperty(key);
}

describe("observatory protocol world-state expansion", () => {
  test("metamodels accepts MetamodelInfo[]", () => {
    const state = buildWorldState({
      metamodels: [{ id: "m2", name: "Meta", conformsTo: "m3", level: 2 }],
    });
    expectSingleEntryArray(state.metamodels, ["id", "name", "conformsTo", "level"]);
  });

  test("modelTypes accepts ModelTypeInfo[]", () => {
    const state = buildWorldState({
      modelTypes: [
        {
          id: "type://example/Product/1.0",
          name: "Product",
          modelName: "ecommerce",
          level: 1,
          conformsTo: "adk:Entity/1.0",
          properties: { sku: { type: "string", required: true } },
        },
      ],
    });
    expectSingleEntryArray(state.modelTypes, [
      "id",
      "modelName",
      "level",
      "conformsTo",
      "properties",
    ]);
  });

  test("morphisms accepts MorphismInfo[]", () => {
    const state = buildWorldState({
      morphisms: [
        {
          id: "morphism://demo",
          name: "Demo",
          conformsTo: "adk:MorphismDocument/1.0",
          inputKinds: ["model"],
          outputKind: "projection",
        },
      ],
    });
    expectSingleEntryArray(state.morphisms, [
      "id",
      "name",
      "conformsTo",
      "inputKinds",
      "outputKind",
    ]);
  });

  test("algebraOperators accepts AlgebraOperatorInfo[]", () => {
    const state = buildWorldState({
      algebraOperators: [
        {
          id: "op:first",
          name: "first",
          version: "1.0",
          arity: 1,
          inputKinds: ["array"],
          outputKind: "value",
        },
      ],
    });
    expectSingleEntryArray(state.algebraOperators, [
      "id",
      "name",
      "version",
      "arity",
      "inputKinds",
      "outputKind",
    ]);
  });

  test("specialisationRules accepts SpecialisationRuleInfo[]", () => {
    const state = buildWorldState({
      specialisationRules: [
        {
          id: "rule://demo",
          name: "Demo Rule",
          from: "Order",
          to: "ConfirmedOrder",
          when: "status=confirmed",
        },
      ],
    });
    expectSingleEntryArray(state.specialisationRules, ["id", "name", "from", "to"]);
  });

  test("capabilities accepts CapabilityInfo[]", () => {
    const state = buildWorldState({
      capabilities: [
        {
          id: "cap://demo",
          name: "Demo Capability",
          description: "Handles demo verbs",
          verbs: ["read", "write"],
        },
      ],
    });
    expectSingleEntryArray(state.capabilities, ["id", "name", "verbs"]);
  });

  test("pluggableInterfaces accepts PluggableInterfaceInfo[]", () => {
    const state = buildWorldState({
      pluggableInterfaces: [
        { id: "iface://demo", name: "Demo Interface", kind: "storage", impls: ["memory"] },
      ],
    });
    expectSingleEntryArray(state.pluggableInterfaces, ["id", "name", "kind", "impls"]);
  });

  test("intents accepts IntentTypeInfo[]", () => {
    const state = buildWorldState({
      intents: [
        {
          id: "intent://confirm",
          name: "Confirm Intent",
          action: "confirm",
          payloadSchema: { type: "object" },
        },
      ],
    });
    expectSingleEntryArray(state.intents, ["id", "name", "action", "payloadSchema"]);
  });

  test("policies accepts PolicyInfo[]", () => {
    const state = buildWorldState({
      policies: [
        { id: "policy://demo", name: "Demo Policy", applies: "orders", rule: "must-confirm" },
      ],
    });
    expectSingleEntryArray(state.policies, ["id", "name", "applies", "rule"]);
  });

  test("projections accepts ProjectionInfo[]", () => {
    const state = buildWorldState({
      projections: [
        {
          id: "projection://observatory",
          name: "Observatory",
          targetKind: "ui-html-ws",
          pages: ["observatory"],
        },
      ],
    });
    expectSingleEntryArray(state.projections, ["id", "name", "targetKind", "pages"]);
  });

  test("bundles accepts BundleInfo[]", () => {
    const state = buildWorldState({
      bundles: [
        {
          id: "bundle://demo",
          morphism: "morphism://demo",
          byteLength: 512,
          createdAt: 1776806015,
        },
      ],
    });
    expectSingleEntryArray(state.bundles, ["id", "morphism", "byteLength", "createdAt"]);
  });

  test("auditLog accepts AuditEventInfo[]", () => {
    const state = buildWorldState({
      auditLog: [
        { ts: 1776806015, op: "type:defined", cid: "bafy-demo", name: "DemoType", oldCid: null },
      ],
    });
    expectSingleEntryArray(state.auditLog, ["ts", "op", "cid"]);
  });

  test("models accepts ModelInfo[]", () => {
    const state = buildWorldState({
      models: [{ name: "core", version: "1.0.0", origin: "https://core.example.test" }],
    });
    expectSingleEntryArray(state.models, ["name", "version", "origin"]);
  });

  test("WorldState keys pin the 22-field protocol surface", () => {
    expect(WORLD_STATE_KEYS).toHaveLength(22);
  });
});
