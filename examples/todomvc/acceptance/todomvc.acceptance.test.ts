import { beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  AcceptanceEngine,
  AlgebraicKernel,
  IntentProcessor,
  ModelLoader,
  type SuiteResult,
} from "../../../L13-facade/index.ts";

const MODEL_YAML = resolve(import.meta.dir, "../models/todos.model.yaml");
const SUITE_YAML = resolve(import.meta.dir, "./todomvc.acceptance.yaml");

function bootEngine(): AcceptanceEngine {
  const kernel = AlgebraicKernel.create();
  const loader = new ModelLoader(kernel);
  loader.setIntentProcessor(new IntentProcessor(kernel));
  return new AcceptanceEngine(loader.bootYamlFile(MODEL_YAML));
}

describe("TodoMVC acceptance suite", () => {
  let engine: AcceptanceEngine;
  let result: SuiteResult;

  beforeEach(async () => {
    engine = bootEngine();
    engine.loadSuite(SUITE_YAML);
    result = await engine.run();
  });

  test("loads TodoMVC suite metadata and scenario count", () => {
    const suite = engine.getSuite();
    expect(suite).not.toBeNull();
    expect(suite?.id).toBe("todomvc");
    expect(suite?.modelId).toBe("todomvc");
    expect(suite?.useCases.flatMap((useCase) => useCase.scenarios)).toHaveLength(7);
  });

  test("runs every scenario successfully", async () => {
    if (!result.passed) {
      for (const useCase of result.useCases) {
        for (const scenario of useCase.scenarios) {
          for (const trace of scenario.traces) {
            const failed = trace.steps.find((step) => !step.passed);
            if (failed) {
              console.error(
                `${useCase.useCaseId} > ${scenario.scenarioId} > ${failed.stepId}: ${failed.error ?? JSON.stringify(failed.assertions)}`,
              );
            }
          }
        }
      }
    }

    expect(result.passed).toBe(true);

    const scenarioIds = engine
      .getSuite()!
      .useCases.flatMap((useCase) => useCase.scenarios.map((scenario) => scenario.id));
    for (const scenarioId of scenarioIds) {
      const isolatedEngine = bootEngine();
      isolatedEngine.loadSuite(SUITE_YAML);
      await expect(isolatedEngine.runScenario(scenarioId)).resolves.toMatchObject({ passed: true });
    }
  });
});
