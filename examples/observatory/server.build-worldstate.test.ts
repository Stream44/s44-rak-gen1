import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { bootNode, buildWorldState } from "../../L14-hosts/projection-runtime/index.ts";

const ARRAY_FIELDS = [
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
] as const;

describe("observatory buildWorldState", () => {
  const runtime = bootNode(resolve(import.meta.dir, "fixtures/boot-sds"));
  test("buildWorldState('*') returns all 22 required fields with array payloads", () => {
    const state = buildWorldState(runtime);
    expect(state.model.name).toBe("ecommerce");
    for (const field of ARRAY_FIELDS) expect(Array.isArray(state[field])).toBe(true);
  });

  test("buildWorldState('*').modelTypes.length is populated after default boot", () => {
    expect(buildWorldState(runtime).modelTypes.length).toBeGreaterThan(0);
  });

  test("buildWorldState('*').morphisms.length is populated after default boot", () => {
    expect(buildWorldState(runtime).morphisms.length).toBeGreaterThan(0);
  });

  test("buildWorldState('*').metamodels.length includes the substrate M2s", () => {
    expect(buildWorldState(runtime).metamodels.length).toBeGreaterThanOrEqual(8);
  });

  test("buildWorldState('ecommerce') excludes core modelTypes", () => {
    const state = buildWorldState(runtime, { scope: "ecommerce" });
    expect(state.modelTypes.length).toBeGreaterThan(0);
    expect(state.modelTypes.every((type) => type.modelName === "ecommerce")).toBe(true);
  });

  test("buildWorldState('core') excludes ecommerce modelTypes", () => {
    const state = buildWorldState(runtime, { scope: "core" });
    expect(state.modelTypes.length).toBeGreaterThan(0);
    expect(state.modelTypes.every((type) => type.modelName === "core")).toBe(true);
  });

  test("buildWorldState('*').models.length includes core and ecommerce", () => {
    expect(buildWorldState(runtime).models.length).toBeGreaterThanOrEqual(2);
  });

  test("buildWorldState('unknown-model') empties scoped M1 arrays but keeps substrate data", () => {
    const state = buildWorldState(runtime, { scope: "unknown-model" });
    expect(state.modelTypes).toHaveLength(0);
    expect(state.morphisms).toHaveLength(0);
    expect(state.specialisationRules).toHaveLength(0);
    expect(state.capabilities).toHaveLength(0);
    expect(state.pluggableInterfaces).toHaveLength(0);
    expect(state.intents).toHaveLength(0);
    expect(state.policies).toHaveLength(0);
    expect(state.projections).toHaveLength(0);
    expect(state.bundles).toHaveLength(0);
    expect(state.instances).toHaveLength(0);
    expect(state.machines).toHaveLength(0);
    expect(state.actions).toHaveLength(0);
    expect(state.contracts).toHaveLength(0);
    expect(state.metamodels.length).toBeGreaterThan(0);
    expect(state.algebraOperators.length).toBeGreaterThan(0);
    expect(state.models).toHaveLength(0);
  });

  test("buildWorldState('*').auditLog captures bootstrap defineType activity", () => {
    expect(buildWorldState(runtime).auditLog.length).toBeGreaterThan(0);
  });
});
