/**
 * E-Commerce Acceptance Suite — integration test.
 *
 * Boots the e-commerce model via ModelLoader.bootYamlFile, loads the
 * acceptance suite YAML, runs it, and asserts that every use case passes.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { resolve } from "path";

import { AlgebraicKernel, ModelLoader, IntentProcessor } from "../../../L13-facade/index.ts";
import type { ModelBoot } from "../../../L09-demand/model-loader.ts";
import { AcceptanceEngine, type SuiteResult } from "../../../L10-acceptance/acceptance.ts";

const MODEL_YAML = resolve(import.meta.dir, "../models/ecommerce.model.yaml");
const SUITE_YAML = resolve(import.meta.dir, "./ecommerce.acceptance.yaml");

let app: ModelBoot;
let engine: AcceptanceEngine;
let result: SuiteResult;

beforeEach(async () => {
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  loader.setIntentProcessor(new IntentProcessor(ak));
  app = loader.bootYamlFile(MODEL_YAML);

  engine = new AcceptanceEngine(app);
  engine.loadSuite(SUITE_YAML);
  result = await engine.run();
});

describe("e-commerce acceptance suite", () => {
  test("loads with correct metadata", () => {
    expect(engine.getSuite()).not.toBeNull();
    const suite = engine.getSuite()!;
    expect(suite.modelId).toBe("ecommerce");
    expect(suite.modelVersion).toBe("1.0.0");
    expect(suite.useCases).toHaveLength(9);
  });

  test("all 4 personas have capabilities issued", () => {
    const suite = engine.getSuite()!;
    expect(suite.personas).toHaveLength(4);
    const byId = Object.fromEntries(suite.personas.map((p) => [p.id, p]));
    expect(Object.keys(byId.alice.capabilities).sort()).toEqual(["cancel", "confirm"]);
    expect(Object.keys(byId.bob.capabilities).sort()).toEqual(["deliver", "ship"]);
    expect(Object.keys(byId["payment-system"].capabilities)).toEqual(["pay"]);
    expect(Object.keys(byId.admin.capabilities).sort()).toEqual(
      ["cancel", "confirm", "deliver", "pay", "ship"].sort(),
    );
    // Every capability is a real CID.
    for (const p of suite.personas) {
      for (const capId of Object.values(p.capabilities)) {
        expect(capId).toMatch(/^cid:sha256:/);
      }
    }
  });

  test("entire suite passes", () => {
    if (!result.passed) {
      // Dump first failure for diagnosis.
      for (const uc of result.useCases) {
        if (uc.passed) continue;
        for (const sc of uc.scenarios) {
          if (sc.passed) continue;
          for (const tr of sc.traces) {
            if (tr.passed) continue;
            const failed = tr.steps.find((s) => !s.passed);
            console.error(
              `FAILED ${uc.name} > ${sc.name} > ${tr.traceLabel}\n  step: ${failed?.stepId} error: ${failed?.error ?? "(assertion)"} assertions: ${JSON.stringify(failed?.assertions, null, 2)}`,
            );
          }
        }
      }
    }
    expect(result.passed).toBe(true);
  });

  test("each use case passes individually", () => {
    for (const uc of result.useCases) {
      expect(uc.passed).toBe(true);
    }
  });

  test("total trace count matches expected branching structure", () => {
    // UC1:1 + UC2:1 + UC3:2 + UC4:3 + UC5:4 + UC6:1 + UC7:5 + UC8:1 + UC9:1 = 19
    // UC8 (reorder) and UC9 (retry) each produce a single cyclic trace.
    expect(result.stats.totalTraces).toBe(19);
    expect(result.stats.passedTraces).toBe(19);
  });

  test("UC8 reorder-after-cancel produces a cyclic trace", () => {
    const uc8 = result.useCases.find((u) => u.useCaseId === "uc-reorder-after-cancel")!;
    expect(uc8.passed).toBe(true);
    const sc = uc8.scenarios[0];
    expect(sc.traceCount).toBe(1);
    expect(sc.traces[0].cyclic).toBe(true);
    expect(sc.traces[0].cycleTo).toBe("step-confirm-initial");
    // confirm → cancel → confirm (after reset)
    expect(sc.traces[0].steps).toHaveLength(3);
  });

  test("UC9 retry-invalid-pay produces a cyclic trace", () => {
    const uc9 = result.useCases.find((u) => u.useCaseId === "uc-retry-invalid-pay")!;
    expect(uc9.passed).toBe(true);
    const sc = uc9.scenarios[0];
    expect(sc.traceCount).toBe(1);
    expect(sc.traces[0].cyclic).toBe(true);
    expect(sc.traces[0].cycleTo).toBe("step-pay-attempt");
    // pay (invalid, fails as expected) → pay again (still fails as expected)
    expect(sc.traces[0].steps).toHaveLength(2);
  });

  test("UC3 cancel-after-confirm produces 2 traces", () => {
    const uc3 = result.useCases.find((u) => u.useCaseId === "uc-cancel-after-confirm")!;
    expect(uc3.scenarios[0].traceCount).toBe(2);
  });

  test("UC4 refund boundary produces 3 traces", () => {
    const uc4 = result.useCases.find((u) => u.useCaseId === "uc-refund-boundary")!;
    const totalTraces = uc4.scenarios.reduce((a, s) => a + s.traceCount, 0);
    expect(totalTraces).toBe(3);
  });

  test("UC7 schema validation produces 5 traces", () => {
    const uc7 = result.useCases.find((u) => u.useCaseId === "uc-schema-validation")!;
    const totalTraces = uc7.scenarios.reduce((a, s) => a + s.traceCount, 0);
    expect(totalTraces).toBe(5);
  });

  test("stats show all scenarios passed", () => {
    expect(result.stats.totalScenarios).toBeGreaterThan(0);
    expect(result.stats.passedScenarios).toBe(result.stats.totalScenarios);
  });

  test("passed suite has an ISO timestamp", () => {
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
