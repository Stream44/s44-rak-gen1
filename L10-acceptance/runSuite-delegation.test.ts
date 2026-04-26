import { beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "path";

import {
    AcceptanceEngine,
    registerSurfaceEvaluator,
    type AcceptanceSuite,
    type Assertion,
    type Persona,
    type Scenario,
    type Step,
} from "./acceptance.ts";
import type { ModelBoot, ModelDocument } from "../../L09-demand/model-loader.ts";
import { AlgebraicKernel, IntentProcessor, ModelLoader } from "../L13-facade/index.ts";

const MODEL_YAML = resolve(import.meta.dir, "../examples/model-world/models/ecommerce.model.yaml");

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
            inputSchema: {
                type: "object",
                required: ["id", "amount"],
                properties: { id: { type: "string" }, amount: { type: "number", minimum: 0 } },
            },
        },
        ShipOrder: {
            verb: "ship",
            inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
        DeliverOrder: {
            verb: "deliver",
            inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
        CancelOrder: {
            verb: "cancel",
            inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
    },
};

function bootTestApp(doc: ModelDocument = TEST_MODEL): ModelBoot {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));
    return loader.boot(doc);
}

function bootYamlApp(): ModelBoot {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));
    return loader.bootYamlFile(MODEL_YAML);
}

function buildSuite(scenarios: Scenario[], personas?: Persona[]): AcceptanceSuite {
    return {
        id: "delegation-suite",
        name: "Delegation Suite",
        modelId: "mini-ecom",
        modelVersion: "1.0.0",
        personas: personas ?? [
            {
                id: "alice",
                name: "Alice",
                role: "customer",
                verbs: ["confirm", "cancel"],
                capabilities: {},
            },
            {
                id: "admin",
                name: "Admin",
                role: "admin",
                verbs: ["confirm", "pay", "ship", "deliver", "cancel"],
                capabilities: {},
            },
        ],
        seeds: [{ targetKey: "ord-001", state: { status: "pending" } }],
        useCases: [{ id: "uc-delegation", name: "Delegation", scenarios }],
    };
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

describe("AcceptanceEngine runSuite delegation", () => {
    let app: ModelBoot;
    let engine: AcceptanceEngine;

    beforeEach(() => {
        app = bootTestApp();
        engine = new AcceptanceEngine(app);
    });

    test("runSuite dispatch returns the existing suite result shape", async () => {
        const yamlEngine = new AcceptanceEngine(bootYamlApp());
        yamlEngine.loadSuite(
            resolve(import.meta.dir, "../tests/kernel-fixtures/acceptance/ecommerce.acceptance.yaml"),
        );

        const result = await yamlEngine.run();

        expect(result.suiteId).toBeString();
        expect(result.modelId).toBeString();
        expect(Array.isArray(result.useCases)).toBe(true);
        expect(result.timestamp).toBeString();
        expect(result.stats).toBeObject();
    });

    test("single-step suites run through the morphism table", async () => {
        engine.setSuite(
            buildSuite([
                {
                    id: "sc-single-step",
                    name: "Single step",
                    root: makeStep({
                        assertions: [
                            { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
                        ],
                    }),
                },
            ]),
        );

        const result = await engine.run();

        expect(result.useCases[0]!.scenarios[0]!.traces[0]!.steps[0]!.passed).toBe(true);
    });

    test("state assertions flip step pass/fail via the evaluator leaf", async () => {
        const scenario = (expected: string): Scenario => ({
            id: `sc-${expected}`,
            name: `State equals ${expected}`,
            root: makeStep({
                assertions: [
                    { kind: "state-equals", targetKey: "ord-001", expected: { status: expected } },
                ],
            }),
        });

        engine.setSuite(buildSuite([scenario("confirmed")]));
        const passResult = await engine.run();

        engine = new AcceptanceEngine(bootTestApp());
        engine.setSuite(buildSuite([scenario("cancelled")]));
        const failResult = await engine.run();

        expect(passResult.useCases[0]!.scenarios[0]!.traces[0]!.steps[0]!.passed).toBe(true);
        expect(failResult.useCases[0]!.scenarios[0]!.traces[0]!.steps[0]!.passed).toBe(false);
    });

    test("surface assertions use the registered evaluator path", async () => {
        const surface = `test.surface.${Date.now()}`;
        let invoked = 0;
        registerSurfaceEvaluator(surface, () => {
            invoked += 1;
            return { kind: "projector-node", passed: true, expected: "ok", actual: "ok" };
        });

        engine.setSuite(
            buildSuite([
                {
                    id: "sc-surface",
                    name: "Surface",
                    root: makeStep({
                        assertions: [
                            {
                                kind: "projector-node",
                                surface,
                                selector: "[data-testid=order-row]",
                                present: true,
                            } as Assertion,
                        ],
                    }),
                },
            ]),
        );

        const result = await engine.run({
            projectorSession: {
                setSessionCaps() { },
            } as unknown as never,
        });

        expect(invoked).toBe(1);
        expect(result.useCases[0]!.scenarios[0]!.traces[0]!.steps[0]!.passed).toBe(true);
    });

    test("cycle reset is handled through the apply-seed leaf", async () => {
        const confirm = makeStep({
            id: "step-confirm",
            assertions: [
                { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
            ],
        });
        const cancel = makeStep({
            id: "step-cancel",
            verb: "cancel",
            assertions: [
                { kind: "state-equals", targetKey: "ord-001", expected: { status: "cancelled" } },
            ],
            branches: [{ label: "retry", ref: "step-confirm", resetBeforeCycle: true }],
        });
        confirm.branches = [{ label: "cancel", step: cancel }];

        engine.setSuite(buildSuite([{ id: "sc-cycle", name: "Cycle", root: confirm }]));

        const result = await engine.run();
        const trace = result.useCases[0]!.scenarios[0]!.traces[0]!;

        expect(trace.cyclic).toBe(true);
        expect(trace.steps).toHaveLength(3);
        expect(trace.steps[2]!.passed).toBe(true);
    });

    test("existing acceptance suite coverage remains available through the public test file", async () => {
        // Resolve paths relative to this test file so the suite runs regardless
        // of where the package is checked out (was previously hard-coded to a
        // pre-extraction monorepo path under `packages/04-ReflexiveAlgebraicKernel/`).
        const proc = Bun.spawn({
            cmd: [
                "bun",
                "test",
                "L10-acceptance/acceptance-assertions.test.ts",
                "L10-acceptance/acceptance-capability.test.ts",
                "L10-acceptance/acceptance-engine.test.ts",
                "L10-acceptance/acceptance-suite.test.ts",
                "L10-acceptance/acceptance-surface.test.ts",
                "L10-acceptance/acceptance-traces.test.ts",
            ],
            cwd: resolve(import.meta.dir, ".."),
            stdout: "pipe",
            stderr: "pipe",
        });
        const output = await new Response(proc.stdout).text();
        const errors = await new Response(proc.stderr).text();
        const combined = `${output}\n${errors}`;

        expect(await proc.exited).toBe(0);
        expect(combined).toContain("50 pass");
        expect(combined).toContain("0 fail");
    });
});
