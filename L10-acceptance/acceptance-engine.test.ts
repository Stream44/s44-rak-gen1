import { beforeEach, describe, expect, test } from "bun:test";
import { AcceptanceEngine, type Scenario, type Step } from "./acceptance.ts";
import { bootTestApp, buildSuite, createTempDir, writeYaml } from "./test-support.ts";

describe("AcceptanceEngine.run — scenario execution", () => {
  let engine: AcceptanceEngine;

  beforeEach(() => {
    engine = new AcceptanceEngine(bootTestApp());
  });

  test("linear scenario with passing steps → 1 trace passes", async () => {
    const scenario: Scenario = {
      id: "sc-linear",
      name: "linear",
      seedKeys: ["ord-001"],
      root: {
        id: "confirm",
        personaId: "alice",
        verb: "confirm",
        targetKey: "ord-001",
        assertions: [
          { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
        ],
      },
    };
    engine.setSuite(buildSuite([scenario]));
    const res = await engine.run();
    expect(res.passed).toBe(true);
    expect(res.useCases[0].scenarios[0].traceCount).toBe(1);
  });

  test("branching scenario with 2 children produces 2 traces, both pass", async () => {
    const scenario: Scenario = {
      id: "sc-branch",
      name: "branch",
      seedKeys: ["ord-001"],
      root: {
        id: "confirm",
        personaId: "alice",
        verb: "confirm",
        targetKey: "ord-001",
        assertions: [],
        branches: [
          {
            label: "pay",
            step: {
              id: "pay",
              personaId: "pay",
              verb: "pay",
              targetKey: "ord-001",
              payload: { amount: 10 },
              assertions: [
                { kind: "state-equals", targetKey: "ord-001", expected: { status: "paid" } },
              ],
            },
          },
          {
            label: "cancel",
            step: {
              id: "cancel",
              personaId: "alice",
              verb: "cancel",
              targetKey: "ord-001",
              assertions: [
                { kind: "state-equals", targetKey: "ord-001", expected: { status: "cancelled" } },
              ],
            },
          },
        ],
      },
    };
    engine.setSuite(buildSuite([scenario]));
    const res = await engine.run();
    expect(res.passed).toBe(true);
    const sr = res.useCases[0].scenarios[0];
    expect(sr.traceCount).toBe(2);
    expect(sr.traces.every((t) => t.passed)).toBe(true);
  });

  test("nested branches produce trace count matching leaf count", async () => {
    const scenario: Scenario = {
      id: "sc-nested",
      name: "nested",
      seedKeys: ["ord-001"],
      root: {
        id: "confirm",
        personaId: "alice",
        verb: "confirm",
        targetKey: "ord-001",
        assertions: [],
        branches: [
          {
            label: "pay branch",
            step: {
              id: "pay",
              personaId: "pay",
              verb: "pay",
              targetKey: "ord-001",
              payload: { amount: 10 },
              assertions: [],
              branches: [
                {
                  label: "ship",
                  step: {
                    id: "ship",
                    personaId: "bob",
                    verb: "ship",
                    targetKey: "ord-001",
                    assertions: [],
                  },
                },
                {
                  label: "stay paid",
                  step: {
                    id: "check-paid",
                    personaId: "pay",
                    verb: "pay",
                    targetKey: "ord-001",
                    payload: { amount: 5 },
                    expectSuccess: false,
                    assertions: [
                      {
                        kind: "state-field-match",
                        targetKey: "ord-001",
                        fields: { status: "paid" },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            label: "cancel branch",
            step: {
              id: "cancel",
              personaId: "alice",
              verb: "cancel",
              targetKey: "ord-001",
              assertions: [],
            },
          },
        ],
      },
    };
    engine.setSuite(buildSuite([scenario]));
    const res = await engine.run();
    const sr = res.useCases[0].scenarios[0];
    expect(sr.traceCount).toBe(3);
    expect(res.passed).toBe(true);
  });

  test("expectSuccess: false on wrong transition → step passes (error was expected)", async () => {
    const scenario: Scenario = {
      id: "sc-expected-fail",
      name: "expected fail",
      seedKeys: ["ord-001"],
      root: {
        id: "ship-pending",
        personaId: "admin",
        verb: "ship",
        targetKey: "ord-001",
        expectSuccess: false,
        assertions: [
          { kind: "error-expected", messageContains: "transition" },
          { kind: "state-equals", targetKey: "ord-001", expected: { status: "pending" } },
        ],
      },
    };
    engine.setSuite(buildSuite([scenario]));
    const res = await engine.run();
    expect(res.passed).toBe(true);
  });
});

describe("aggregation", () => {
  let engine: AcceptanceEngine;

  beforeEach(() => {
    engine = new AcceptanceEngine(bootTestApp());
  });

  test("full use case with multiple scenarios aggregates results", async () => {
    const sc1: Scenario = {
      id: "sc1",
      name: "sc1",
      seedKeys: ["ord-001"],
      root: {
        id: "confirm",
        personaId: "alice",
        verb: "confirm",
        targetKey: "ord-001",
        assertions: [
          { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
        ],
      },
    };
    const sc2: Scenario = {
      id: "sc2",
      name: "sc2",
      seedKeys: ["ord-001"],
      root: {
        id: "cancel",
        personaId: "alice",
        verb: "cancel",
        targetKey: "ord-001",
        assertions: [
          { kind: "state-equals", targetKey: "ord-001", expected: { status: "cancelled" } },
        ],
      },
    };
    engine.setSuite(buildSuite([sc1, sc2]));
    const res = await engine.run();
    expect(res.passed).toBe(true);
    expect(res.useCases[0].scenarios).toHaveLength(2);
    expect(res.stats.totalScenarios).toBe(2);
    expect(res.stats.passedScenarios).toBe(2);
    expect(res.stats.totalTraces).toBe(2);
  });

  test("suite.passed is false if any trace fails", async () => {
    const good: Scenario = {
      id: "good",
      name: "good",
      seedKeys: ["ord-001"],
      root: {
        id: "confirm",
        personaId: "alice",
        verb: "confirm",
        targetKey: "ord-001",
        assertions: [
          { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
        ],
      },
    };
    const bad: Scenario = {
      id: "bad",
      name: "bad",
      seedKeys: ["ord-001"],
      root: {
        id: "confirm-wrong",
        personaId: "alice",
        verb: "confirm",
        targetKey: "ord-001",
        assertions: [
          { kind: "state-equals", targetKey: "ord-001", expected: { status: "delivered" } },
        ],
      },
    };
    engine.setSuite(buildSuite([good, bad]));
    const res = await engine.run();
    expect(res.passed).toBe(false);
    expect(res.stats.passedScenarios).toBe(1);
  });

  test("runUseCase and runScenario return focused results", async () => {
    const sc: Scenario = {
      id: "only-sc",
      name: "only",
      seedKeys: ["ord-001"],
      root: {
        id: "confirm",
        personaId: "alice",
        verb: "confirm",
        targetKey: "ord-001",
        assertions: [
          { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
        ],
      },
    };
    engine.setSuite(buildSuite([sc]));
    expect((await engine.runUseCase("uc-test")).passed).toBe(true);
    expect((await engine.runScenario("only-sc")).passed).toBe(true);
  });

  test("traces are isolated — branching scenario does not leak state", async () => {
    const sc: Scenario = {
      id: "isol",
      name: "iso",
      seedKeys: ["ord-001"],
      root: {
        id: "confirm",
        personaId: "alice",
        verb: "confirm",
        targetKey: "ord-001",
        assertions: [
          { kind: "state-field-match", targetKey: "ord-001", fields: { status: "confirmed" } },
        ],
        branches: [
          {
            label: "pay",
            step: {
              id: "pay",
              personaId: "pay",
              verb: "pay",
              targetKey: "ord-001",
              payload: { amount: 1 },
              assertions: [
                { kind: "state-equals", targetKey: "ord-001", expected: { status: "paid" } },
              ],
            },
          },
          {
            label: "cancel",
            step: {
              id: "cancel",
              personaId: "alice",
              verb: "cancel",
              targetKey: "ord-001",
              assertions: [
                { kind: "state-equals", targetKey: "ord-001", expected: { status: "cancelled" } },
              ],
            },
          },
        ],
      },
    };
    engine.setSuite(buildSuite([sc]));
    const res = await engine.run();
    expect(res.passed).toBe(true);
    expect(res.useCases[0].scenarios[0].traceCount).toBe(2);
  });
});

describe("AcceptanceEngine — cycle execution", () => {
  let engine: AcceptanceEngine;

  beforeEach(() => {
    engine = new AcceptanceEngine(bootTestApp());
  });

  test("trace with ref + resetBeforeCycle re-seeds and re-executes the cycle", async () => {
    const root: Step = {
      id: "confirm-initial",
      personaId: "alice",
      verb: "confirm",
      targetKey: "ord-001",
      assertions: [
        { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
      ],
    };
    const cancel: Step = {
      id: "cancel-step",
      personaId: "alice",
      verb: "cancel",
      targetKey: "ord-001",
      assertions: [
        { kind: "state-equals", targetKey: "ord-001", expected: { status: "cancelled" } },
      ],
      branches: [
        {
          label: "reorder: reset and confirm again",
          ref: "confirm-initial",
          resetBeforeCycle: true,
        },
      ],
    };
    root.branches = [{ label: "cancel path", step: cancel }];

    const sc: Scenario = {
      id: "sc-cycle",
      name: "cycle",
      seedKeys: ["ord-001"],
      root,
    };
    engine.setSuite(buildSuite([sc]));
    const res = await engine.run();
    expect(res.passed).toBe(true);
    const sr = res.useCases[0].scenarios[0];
    expect(sr.traceCount).toBe(1);
    expect(sr.traces[0].cyclic).toBe(true);
    expect(sr.traces[0].cycleTo).toBe("confirm-initial");
    expect(sr.traces[0].steps).toHaveLength(3);
    expect(sr.traces[0].steps.every((s) => s.passed)).toBe(true);
  });

  test("trace with ref but no reset fails when re-executing illegal transition", async () => {
    const root: Step = {
      id: "confirm-initial",
      personaId: "alice",
      verb: "confirm",
      targetKey: "ord-001",
      assertions: [],
    };
    const cancel: Step = {
      id: "cancel-step",
      personaId: "alice",
      verb: "cancel",
      targetKey: "ord-001",
      assertions: [],
      branches: [{ label: "retry without reset", ref: "confirm-initial" }],
    };
    root.branches = [{ label: "cancel", step: cancel }];

    const sc: Scenario = {
      id: "sc-cycle-noreset",
      name: "no reset",
      seedKeys: ["ord-001"],
      root,
    };
    engine.setSuite(buildSuite([sc]));
    const res = await engine.run();
    expect(res.passed).toBe(false);
    const sr = res.useCases[0].scenarios[0];
    expect(sr.traces[0].cyclic).toBe(true);
    const third = sr.traces[0].steps[2];
    expect(third?.passed).toBe(false);
  });

  test("YAML ref branch loads and parses correctly", async () => {
    const tmpDir = createTempDir("adk-acceptance-cycle");
    writeYaml(
      tmpDir,
      "personas.yaml",
      `- id: alice
  name: Alice
  role: customer
  verbs: [confirm, cancel]
`,
    );
    writeYaml(
      tmpDir,
      "seeds.yaml",
      `- targetKey: ord-001
  state: { status: pending }
`,
    );
    const suitePath = writeYaml(
      tmpDir,
      "suite.yaml",
      `suite: cycle-suite
model: mini-ecom
version: 1.0.0
personas: ./personas.yaml
seeds: ./seeds.yaml
useCases:
  - id: uc-cycle
    name: Cycle
    scenarios:
      - id: sc-reorder
        name: reorder
        seeds: [ord-001]
        steps:
          - id: step-confirm-initial
            persona: alice
            verb: confirm
            targetKey: ord-001
            assertions:
              - kind: state-equals
                targetKey: ord-001
                expected: { status: confirmed }
            branches:
              - label: cancel and retry
                step:
                  id: step-cancel
                  persona: alice
                  verb: cancel
                  targetKey: ord-001
                  assertions:
                    - kind: state-equals
                      targetKey: ord-001
                      expected: { status: cancelled }
                  branches:
                    - label: "reorder via reset"
                      ref: step-confirm-initial
                      resetBeforeCycle: true
`,
    );
    const freshEngine = new AcceptanceEngine(bootTestApp());
    const suite = freshEngine.loadSuite(suitePath);
    expect(suite.useCases[0].scenarios[0].root.id).toBe("step-confirm-initial");
    const cancelStep = suite.useCases[0].scenarios[0].root.branches![0].step!;
    expect(cancelStep.branches![0].ref).toBe("step-confirm-initial");
    expect(cancelStep.branches![0].resetBeforeCycle).toBe(true);

    const res = await freshEngine.run();
    expect(res.passed).toBe(true);
    expect(res.useCases[0].scenarios[0].traces[0].cyclic).toBe(true);
    expect(res.useCases[0].scenarios[0].traces[0].cycleTo).toBe("step-confirm-initial");
  });
});
