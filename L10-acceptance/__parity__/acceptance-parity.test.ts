/**
 * Parity workflow: compare the current AcceptanceEngine output against
 * the committed snapshots. Do not update snapshots on failure;
 * fix the current morphism-table path first, then rerun this test.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  AcceptanceEngine,
  AlgebraicKernel,
  IntentProcessor,
  ModelLoader,
} from "../../L13-facade/index.ts";
import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import type { SuiteResult } from "../acceptance.ts";
import { deepEqualShape, normalize } from "./normalize.ts";

const MODEL_YAML = resolve(
  import.meta.dir,
  "../../examples/model-world/models/ecommerce.model.yaml",
);
const SUITE_DIR = resolve(import.meta.dir, "../../tests/kernel-fixtures/acceptance");

const firstDiff = (left: unknown, right: unknown, path = "$"): string | null => {
  if (Object.is(left, right)) return null;
  if (typeof left !== typeof right) return `${path}: type ${typeof left} !== ${typeof right}`;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return `${path}: array mismatch`;
    if (left.length !== right.length) return `${path}: length ${left.length} !== ${right.length}`;
    for (let i = 0; i < left.length; i += 1) {
      const diff = firstDiff(left[i], right[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (left && right && typeof left === "object") {
    const keys = [
      ...new Set([...Object.keys(left as object), ...Object.keys(right as object)]),
    ].sort();
    for (const key of keys) {
      const diff = firstDiff(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      if (diff) return diff;
    }
    return null;
  }
  return `${path}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`;
};

const runSuite = async (suiteFile: string): Promise<SuiteResult> => {
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  loader.setIntentProcessor(new IntentProcessor(ak));
  const app: ModelBoot = loader.bootYamlFile(MODEL_YAML);
  const engine = new AcceptanceEngine(app);
  engine.loadSuite(resolve(SUITE_DIR, suiteFile));
  return normalize(await engine.run());
};

const readSnapshot = (name: string): SuiteResult =>
  JSON.parse(
    readFileSync(resolve(import.meta.dir, `${name}.snapshot.json`), "utf8"),
  ) as SuiteResult;

const assertParity = async (name: string, suiteFile: string): Promise<void> => {
  const current = await runSuite(suiteFile);
  const snapshot = readSnapshot(name);
  if (!deepEqualShape(current, snapshot)) {
    throw new Error(`Parity diff for ${name}: ${firstDiff(current, snapshot) ?? "unknown diff"}`);
  }
};

describe("Acceptance parity", () => {
  test("ecommerce.acceptance.yaml matches the legacy snapshot", async () => {
    await assertParity("ecommerce", "ecommerce.acceptance.yaml");
  });

  test("ecommerce-api.acceptance.yaml matches the legacy snapshot", async () => {
    await assertParity("ecommerce-api", "ecommerce-api.acceptance.yaml");
  });

  test("ecommerce-cross.acceptance.yaml matches the legacy snapshot", async () => {
    await assertParity("ecommerce-cross", "ecommerce-cross.acceptance.yaml");
  });

  test("normalize fixes timestamps and sorts nested record keys", () => {
    const normalized = normalize({
      modelId: "m",
      modelVersion: "1",
      passed: true,
      stats: {
        totalSteps: 1,
        passedSteps: 1,
        totalTraces: 1,
        passedTraces: 1,
        totalScenarios: 1,
        passedScenarios: 1,
      },
      suiteId: "suite",
      timestamp: "2026-04-18T00:00:00.000Z",
      useCases: [
        {
          useCaseId: "uc",
          name: "use-case",
          passed: true,
          scenarios: [
            {
              scenarioId: "sc",
              name: "scenario",
              passed: true,
              traceCount: 1,
              traces: [
                {
                  traceLabel: "trace",
                  passed: true,
                  steps: [
                    {
                      stepId: "step",
                      passed: true,
                      assertions: [
                        {
                          passed: true,
                          kind: "k",
                          expected: '{"b":2,"a":1}',
                          actual: '{"y":2,"x":1}',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } satisfies SuiteResult);

    expect(normalized.timestamp).toBe("<TIMESTAMP>");
    expect(Object.keys(normalized)).toEqual([
      "modelId",
      "modelVersion",
      "passed",
      "stats",
      "suiteId",
      "timestamp",
      "useCases",
    ]);
    expect(Object.keys(normalized.stats)).toEqual([
      "passedScenarios",
      "passedSteps",
      "passedTraces",
      "totalScenarios",
      "totalSteps",
      "totalTraces",
    ]);
  });
});
