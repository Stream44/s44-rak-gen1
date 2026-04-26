import { expect, test } from "bun:test";
import { resolve } from "path";
import { bootNode } from "./boot-node.ts";
import { buildWorldState } from "./world-state.ts";

const FIXTURES = resolve(import.meta.dir, "test-fixtures");
const WORLD_STATE_SDS = resolve(FIXTURES, "world-state-node/sds.yaml");

test("buildWorldState lists all loaded models and annotates types by modelName", () => {
  const state = buildWorldState(bootNode(WORLD_STATE_SDS));
  expect(state.models).toHaveLength(2);
  expect(new Set(state.types.map((type) => type.modelName).filter(Boolean))).toEqual(
    new Set(["alpha", "beta"]),
  );
});

test("buildWorldState enumerates live instances from only the model that has state", () => {
  const runtime = bootNode(WORLD_STATE_SDS);
  runtime.apps.get("alpha")?.setState("alpha-1", { status: "active" });
  const state = buildWorldState(runtime);
  expect(state.instances).toEqual([
    { key: "alpha-1", state: { status: "active" }, modelName: "alpha" },
  ]);
});

test("buildWorldState emits one machine per lifecycle-bearing model with modelName", () => {
  const state = buildWorldState(bootNode(WORLD_STATE_SDS));
  expect(state.machines).toHaveLength(2);
  expect(new Set(state.machines.map((machine) => machine.modelName))).toEqual(
    new Set(["alpha", "beta"]),
  );
});

test("buildWorldState filters model-scoped collections by model name", () => {
  const state = buildWorldState(bootNode(WORLD_STATE_SDS), { scope: "alpha" });
  expect(state.models.map((model) => model.name)).toEqual(["alpha"]);
  expect(state.types.every((type) => type.modelName === "alpha")).toBe(true);
  expect(state.actions.every((action) => action.modelName === "alpha")).toBe(true);
  expect(state.enums.every((entry) => entry.modelName === "alpha")).toBe(true);
});

test("buildWorldState preserves registry audit history", () => {
  const state = buildWorldState(bootNode(WORLD_STATE_SDS));
  expect(state.auditLog.length).toBeGreaterThan(0);
});
