import { describe, test, expect, beforeEach } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

import { AlgebraicKernel, ModelLoader, IntentProcessor } from "../../../L13-facade/index.ts";
import type { ModelBoot } from "../../../L09-demand/model-loader.ts";
import {
  AcceptanceEngine,
  ProjectorSession,
  hasSurfaceEvaluator,
  type AcceptanceSuite,
  type AssertionResult,
  type ScenarioResult,
  type SuiteResult,
} from "../../../L10-acceptance/acceptance.ts";
import { loadKindPack } from "../../../L11-projection/metamodel.ts";
import { ProjectionKernel } from "../../../L11-projection/projection-kernel.ts";
import { PrimitiveRegistry } from "../../../L11-projection/primitive-registry.ts";
import type { ProjectionAsset, ProjectionKind } from "../../../L01-foundation/projection-types.ts";
import { registerApiRestSurfaceHandlers } from "../../../L08-kinds/api-rest/surface-handlers.ts";

const MODEL_YAML = resolve(import.meta.dir, "../models/ecommerce.model.yaml");
const SUITE_YAML = resolve(import.meta.dir, "./ecommerce-api.acceptance.yaml");
const PERSONAS_YAML = resolve(import.meta.dir, "./personas-api.yaml");
const PROJECTION_YAML = resolve(import.meta.dir, "../projection-api/projection.yaml");
const API_KIND_DIR = resolve(import.meta.dir, "../../../L08-kinds/api-rest");

let app: ModelBoot;
let engine: AcceptanceEngine;

registerApiRestSurfaceHandlers();

beforeEach(() => {
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  loader.setIntentProcessor(new IntentProcessor(ak));
  app = loader.bootYamlFile(MODEL_YAML);

  engine = new AcceptanceEngine(app);
  engine.loadSuite(SUITE_YAML);
});

function compileProjection(app: ModelBoot) {
  const primitives = PrimitiveRegistry.createWithBuiltins();
  for (const name of ["Endpoint", "RouteParam", "ResponseShape"]) {
    primitives.register({ name, supportsChildren: true });
  }
  const kernel = new ProjectionKernel(app, { primitives });
  registerKindAssets(kernel, API_KIND_DIR);
  const projection = kernel.loadYamlFile(PROJECTION_YAML);
  return { kernel, projection };
}

function registerKindAssets(kernel: ProjectionKernel, kindDir: string): void {
  const kind = loadKindPack(kindDir) as ProjectionKind & { primitiveAssets?: string[] };
  kernel.registerKind({ ...kind, cid: kind.cid ?? `test:${kind.id}` });
  for (const relativePath of kind.primitiveAssets ?? []) {
    const asset = Bun.YAML.parse(
      readFileSync(resolve(kindDir, relativePath), "utf-8"),
    ) as ProjectionAsset;
    kernel.registerAsset({ ...asset, cid: asset.cid ?? `test:${asset.name}` });
  }
}

async function runScenario(
  app: ModelBoot,
  suite: AcceptanceSuite,
  scenarioId: string,
): Promise<SuiteResult> {
  const scenario = suite.useCases[0]!.scenarios.find((entry) => entry.id === scenarioId)!;
  const singleScenarioSuite: AcceptanceSuite = {
    ...suite,
    useCases: [
      {
        ...suite.useCases[0]!,
        scenarios: [scenario],
      },
    ],
  };

  const persona = suite.personas.find((entry) => entry.id === scenario.root.personaId)!;
  const scenarioEngine = new AcceptanceEngine(app);
  scenarioEngine.setSuite(singleScenarioSuite);

  const { kernel, projection } = compileProjection(app);
  const projectorSession = new ProjectorSession({
    kernel,
    projection,
    surface: "api.rest",
    sessionCaps: persona.capabilities,
  });

  return await scenarioEngine.run({ projectorSession });
}

function getScenarioResult(result: SuiteResult): ScenarioResult {
  return result.useCases[0]!.scenarios[0]!;
}

function getApiAssertion(result: SuiteResult): AssertionResult {
  const scenario = getScenarioResult(result);
  return scenario.traces[0]!.steps[0]!.assertions.find(
    (assertion) => assertion.kind === "api-response",
  )!;
}

describe("e-commerce api.rest acceptance suite", () => {
  test("loads with 2 personas and 2 scenarios", () => {
    expect(engine.getSuite()).not.toBeNull();
    const suite = engine.getSuite()!;
    expect(suite.personas).toHaveLength(2);
    expect(suite.useCases).toHaveLength(1);
    expect(suite.useCases[0]!.scenarios).toHaveLength(2);
    expect(hasSurfaceEvaluator("api.rest")).toBe(true);
  });

  test("personas YAML parses with the expected capabilityUris", () => {
    const personas = Bun.YAML.parse(readFileSync(PERSONAS_YAML, "utf-8")) as Array<{
      id: string;
      capabilityUris?: string[];
    }>;

    expect(personas).toHaveLength(2);
    expect(personas[0]).toMatchObject({
      id: "alice",
      capabilityUris: ["cap://commerce/orders/view/1.0", "cap://pii/view/1.0"],
    });
    expect(personas[1]).toMatchObject({
      id: "bob",
      capabilityUris: ["cap://commerce/orders/view/1.0"],
    });
  });

  test("the api.rest projection compiles without errors", () => {
    const { projection } = compileProjection(app);
    expect(projection.conformsToKind).toBe("kind://adk/api.rest/1.0");
    expect(projection.bindsModel).toBe("ecommerce@1.0.0");
  });

  test("Alice's scenario passes end-to-end", async () => {
    const suite = engine.getSuite()!;
    const result = await runScenario(app, suite, "sc-alice-confirms-full");

    expect(getScenarioResult(result).passed).toBe(true);
  });

  test("Bob's scenario passes end-to-end", async () => {
    const suite = engine.getSuite()!;
    const result = await runScenario(app, suite, "sc-bob-confirms-redacted");

    expect(getScenarioResult(result).passed).toBe(true);
  });

  test("Bob's api-response assertion contains the redacted email", async () => {
    const suite = engine.getSuite()!;
    const result = await runScenario(app, suite, "sc-bob-confirms-redacted");
    const assertion = getApiAssertion(result);

    expect(assertion.passed).toBe(true);
    expect(assertion.actual).toContain('"customerEmail":"(redacted)"');
  });

  test("Alice's api-response assertion does not contain the redacted email", async () => {
    const suite = engine.getSuite()!;
    const result = await runScenario(app, suite, "sc-alice-confirms-full");
    const assertion = getApiAssertion(result);

    expect(assertion.passed).toBe(true);
    expect(assertion.actual).toContain('"customerEmail":"ada@example.com"');
    expect(assertion.actual).not.toContain("(redacted)");
  });
});
