import { describe, expect, test } from "bun:test";
import { runBenchmarks } from "./bench.ts";

const resultsPromise = runBenchmarks(250);

describe("27C benchmark harness", () => {
  test("runBenchmarks returns 5 canonical entries", async () => {
    expect((await resultsPromise).map((r) => r.morphism)).toEqual([
      "authorize",
      "render",
      "step",
      "surveyCapabilities",
      "acceptance.runStep",
    ]);
  });

  test("each entry has non-zero measurements", async () => {
    for (const result of await resultsPromise) {
      expect(result.sourceMeanUs).toBeGreaterThan(0);
      expect(result.compiledMeanUs).toBeGreaterThan(0);
      expect(result.p50Us).toBeGreaterThan(0);
      expect(result.p99Us).toBeGreaterThan(0);
    }
  });

  test("each entry clears the 16x floor", async () => {
    const failed = (await resultsPromise).filter((r) => r.speedup < 16);
    if (failed.length)
      throw new Error(failed.map((r) => `${r.morphism}: ${r.speedup.toFixed(2)}x`).join("; "));
    expect(failed).toHaveLength(0);
  });

  test("compiled mean stays below source mean for every morphism", async () => {
    for (const result of await resultsPromise)
      expect(result.compiledMeanUs).toBeLessThan(result.sourceMeanUs);
  });
});
