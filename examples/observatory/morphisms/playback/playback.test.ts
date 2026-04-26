import { describe, expect, test } from "bun:test";

import {
  AlgebraicKernel,
  IntentProcessor,
  ModelLoader,
  type ModelBoot,
  type ModelDocument,
} from "../../../../L13-facade/index.ts";
import type {
  AcceptanceSuite,
  Persona,
  Scenario,
  Step,
} from "../../../../L10-acceptance/acceptance.ts";
import buildPlaybackView, { flattenTree } from "./playback-build-view.ts";
import executePlaybackStep from "./playback-execute-step.ts";
import reseedScenario from "./playback-reseed-scenario.ts";

const TEST_MODEL: ModelDocument = {
  model: "mini-ecom",
  version: "1.0.0",
  origin: "https://test.mini.example",
  lifecycle: {
    states: ["pending", "confirmed", "paid", "shipped", "delivered", "cancelled"],
    initial: "pending",
    terminal: ["delivered", "cancelled"],
    transitions: [
      { from: "pending", to: "confirmed", verb: "confirm" },
      { from: "confirmed", to: "paid", verb: "pay" },
      { from: "paid", to: "shipped", verb: "ship" },
      { from: "shipped", to: "delivered", verb: "deliver" },
      { from: "pending", to: "cancelled", verb: "cancel" },
      { from: "confirmed", to: "cancelled", verb: "cancel" },
    ],
  },
  actions: {
    ConfirmOrder: {
      verb: "confirm",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
    PayOrder: {
      verb: "pay",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
    CancelOrder: {
      verb: "cancel",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
  },
};

function bootTestApp(): ModelBoot {
  const kernel = AlgebraicKernel.create();
  const loader = new ModelLoader(kernel);
  loader.setIntentProcessor(new IntentProcessor(kernel));
  return loader.boot(TEST_MODEL);
}

function makePersonas(app: ModelBoot): Persona[] {
  return [
    {
      id: "alice",
      name: "Alice",
      role: "customer",
      verbs: ["confirm", "pay"],
      capabilities: {
        confirm: app.issueCapability("confirm", "alice"),
        pay: app.issueCapability("pay", "alice"),
      },
    },
    {
      id: "bob",
      name: "Bob",
      role: "guest",
      verbs: ["confirm"],
      capabilities: {},
    },
  ];
}

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "step-confirm",
    personaId: "alice",
    verb: "confirm",
    targetKey: "ord-001",
    payload: { id: "ord-001" },
    assertions: [],
    ...overrides,
  };
}

function makeScenario(root: Step): Scenario {
  return {
    id: "happy-path",
    name: "Happy path",
    seedKeys: ["ord-001"],
    root,
  };
}

function makeSuite(app: ModelBoot, scenario: Scenario): AcceptanceSuite {
  return {
    id: "suite-1",
    name: "Playback Suite",
    modelId: TEST_MODEL.model,
    modelVersion: TEST_MODEL.version,
    personas: makePersonas(app),
    seeds: [{ targetKey: "ord-001", state: { status: "pending" } }],
    useCases: [{ id: "checkout", name: "Checkout", scenarios: [scenario] }],
  };
}

describe("playback morphisms", () => {
  test("buildPlaybackView returns suite metadata and traces", () => {
    const app = bootTestApp();
    const scenario = makeScenario(makeStep());
    const suite = makeSuite(app, scenario);

    const view = buildPlaybackView({ suite });

    expect(view.name).toBe("Playback Suite");
    expect(view.personas[0]?.verbs).toContain("confirm");
    expect(view.useCases[0]?.scenarios[0]?.traceCount).toBe(1);
    expect(view.useCases[0]?.scenarios[0]?.traces[0]?.stepIds).toEqual(["step-confirm"]);
  });

  test("flattenTree preserves parent and branch nodes", () => {
    const app = bootTestApp();
    const root = makeStep({
      branches: [
        {
          label: "pay",
          step: makeStep({
            id: "step-pay",
            verb: "pay",
            payload: { id: "ord-001" },
          }),
        },
      ],
    });
    const suite = makeSuite(app, makeScenario(root));
    const view = buildPlaybackView({ suite });
    const flattened = flattenTree(view.useCases[0]!.scenarios[0]!.tree);

    expect(flattened.map((entry) => entry.stepId)).toEqual(["step-confirm", "step-pay"]);
    expect(flattened[0]?.hasChildren).toBe(true);
    expect(flattened[1]?.hasChildren).toBe(false);
  });

  test("reseedScenario applies suite seeds when no inline override exists", () => {
    const app = bootTestApp();
    const scenario = makeScenario(makeStep());
    const suite = makeSuite(app, scenario);

    app.setState("ord-001", { status: "cancelled" });
    const result = reseedScenario({ suite, scenario, app });

    expect(result.seededKeys).toEqual(["ord-001"]);
    expect(app.getState("ord-001")).toEqual({ status: "pending" });
  });

  test("reseedScenario applies inline seeds and extra inline keys", () => {
    const app = bootTestApp();
    const scenario: Scenario = {
      ...makeScenario(makeStep()),
      inlineSeeds: [
        { targetKey: "ord-001", state: { status: "confirmed" } },
        { targetKey: "ord-002", state: { status: "pending" } },
      ],
    };
    const suite = makeSuite(app, scenario);

    const result = reseedScenario({ suite, scenario, app });

    expect(result.seededKeys).toEqual(["ord-001", "ord-002"]);
    expect(app.getState("ord-001")).toEqual({ status: "confirmed" });
    expect(app.getState("ord-002")).toEqual({ status: "pending" });
  });

  test("executePlaybackStep submits the step and returns assertion results", async () => {
    const app = bootTestApp();
    const scenario = makeScenario(
      makeStep({
        assertions: [
          { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
        ],
      }),
    );
    const suite = makeSuite(app, scenario);
    app.setState("ord-001", { status: "pending" });

    const result = await executePlaybackStep({
      suite,
      scenario,
      traceIndex: 0,
      stepIndex: 0,
      appActions: app.actions,
      appState: { "ord-001": app.getState("ord-001") },
      app,
    });

    expect(result.passed).toBe(true);
    expect(result.assertionResults).toHaveLength(1);
    expect(result.capturedEvents).toHaveLength(1);
    expect(result.resultingAppState["ord-001"]).toEqual({ status: "confirmed" });
  });

  test("executePlaybackStep fails when the persona lacks the step capability", async () => {
    const app = bootTestApp();
    const scenario = makeScenario(
      makeStep({
        personaId: "bob",
        expectSuccess: false,
        assertions: [{ kind: "error-expected" }],
      }),
    );
    const suite = makeSuite(app, scenario);
    app.setState("ord-001", { status: "pending" });

    const result = await executePlaybackStep({
      suite,
      scenario,
      traceIndex: 0,
      stepIndex: 0,
      appActions: app.actions,
      appState: { "ord-001": app.getState("ord-001") },
      app,
    });

    expect(result.passed).toBe(true);
    expect(result.assertionResults[0]?.kind).toBe("error-expected");
    expect(result.capturedEvents).toHaveLength(0);
    expect(result.resultingAppState["ord-001"]).toEqual({ status: "pending" });
  });

  test("executePlaybackStep rejects unknown trace indexes", async () => {
    const app = bootTestApp();
    const scenario = makeScenario(makeStep());
    const suite = makeSuite(app, scenario);

    await expect(
      executePlaybackStep({
        suite,
        scenario,
        traceIndex: 3,
        stepIndex: 0,
        appActions: app.actions,
        appState: {},
        app,
      }),
    ).rejects.toThrow('Trace index 3 out of range for scenario "happy-path"');
  });
});
