import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  clearDiscoveryCache,
  discoverExamples,
  listExampleNames,
  resolveExampleConfig,
} from "./example-registry.ts";

const ROOT = resolve(import.meta.dir, "../..");

afterEach(() => {
  clearDiscoveryCache();
});

describe("example registry", () => {
  test("discoverExamples returns at least 4 entries", async () => {
    const examples = await discoverExamples(ROOT);

    expect(examples.length).toBeGreaterThanOrEqual(4);
    expect(examples.every((entry) => entry.name.length > 0)).toBe(true);
  });

  test("listExampleNames mirrors discoverExamples", async () => {
    const [examples, names] = await Promise.all([discoverExamples(ROOT), listExampleNames(ROOT)]);
    expect(names).toEqual(examples.map((entry) => entry.name));
  });

  test("discoverExamples caches by root", async () => {
    await discoverExamples(ROOT);
    const first = discoverExamples(ROOT);
    const second = discoverExamples(ROOT);

    expect(await second).toEqual(await first);
  });

  test("resolveExampleConfig returns a viewer config for any discovered example", async () => {
    const example = (await discoverExamples(ROOT))[0];
    const config = await resolveExampleConfig(example!.name, { root: ROOT });

    expect(config).toBeDefined();
    expect(config?.projectorPath.endsWith(".yaml")).toBe(true);
    expect(config?.mount).toBeString();
  });

  test("resolveExampleConfig exposes at least one registered hook", async () => {
    const examples = await discoverExamples(ROOT);
    const configs = await Promise.all(
      examples.map((entry) => resolveExampleConfig(entry.name, { root: ROOT })),
    );
    expect(configs.some((config) => Boolean(config?.customHandler))).toBe(true);
  });

  test("resolveExampleConfig throws with available-list on unknown example", async () => {
    await expect(resolveExampleConfig("bogus", { root: ROOT })).rejects.toThrow(/Available:/);
  });

  test("resolveExampleConfig resolves projector overrides for discovered examples", async () => {
    const example = (await discoverExamples(ROOT)).find((entry) =>
      existsSync(resolve(entry.dir, "projection", "projection.yaml")),
    );
    const config = await resolveExampleConfig(example!.name, {
      projector: "projection/projection.yaml",
      root: ROOT,
    });

    expect(config?.projectorPath.endsWith("projection.yaml")).toBe(true);
  });
});
