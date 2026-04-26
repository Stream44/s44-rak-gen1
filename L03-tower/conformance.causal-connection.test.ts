import { describe, expect, test } from "bun:test";
import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { IntentProcessor } from "../L13-facade/index.ts";
import { TypeRegistry } from "./registry.ts";
import { UnfoldingEngine } from "../L09-demand/unfold.ts";
import type { UnfoldRulesDocument } from "../L09-demand/unfold/rules-types.ts";

const ext = (
  id: string,
  ...heuristics: UnfoldRulesDocument["heuristics"]
): UnfoldRulesDocument => ({
  id,
  version: "1.0",
  conformsTo: "adk:RulesDocument/1.0",
  discriminator: "unfold",
  heuristics,
});
const actionRule = (id: string, prefix: string) =>
  ({
    id,
    when: { requires: ["detect-lifecycle"] },
    emit: {
      kind: "action-per-transition",
      actionName: { template: `${prefix}\${capitalize(verb)}\${entity.name}` },
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      origin: "test.example",
    },
  }) as UnfoldRulesDocument["heuristics"][number];
const define = (registry: TypeRegistry, id: string, doc: UnfoldRulesDocument) =>
  registry.defineType({
    id,
    name: id.split("/").at(-2),
    level: MetaLevel.Model,
    version: "1.0",
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: { type: "object", properties: {}, default: doc },
  } as TypeDef);
const actions = (engine: UnfoldingEngine, seed: string) =>
  engine
    .unfold(seed)
    .strata.actions.map((action) => action.name)
    .sort();
const stable = (engine: UnfoldingEngine, pid: number, ctor: typeof UnfoldingEngine) => {
  expect(process.pid).toBe(pid);
  expect(engine.constructor).toBe(ctor);
};

function boot() {
  const kernel = AlgebraicKernel.create();
  const registry = kernel.kernel.registry;
  const intents = new IntentProcessor(kernel);
  const seed = "type://test.example/Order/1.0";
  kernel.defineType({
    id: seed,
    name: "Order",
    version: "1.0",
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: {
      type: "object",
      required: ["id", "status"],
      properties: { id: { type: "string" }, status: { type: "string", enum: ["draft", "paid"] } },
    },
  });
  return {
    registry,
    engine: new UnfoldingEngine(kernel, intents, { ruleNames: ["unfoldRules"] }),
    seed,
    pid: process.pid,
    ctor: UnfoldingEngine,
  };
}

describe("causal connection e2e", () => {
  test("unfolding rule change swaps the output shape on next call", () => {
    const { registry, engine, seed, pid, ctor } = boot(),
      v1 = define(
        registry,
        "type://test.example/RulesV1/1.0",
        ext("adk:v1/1.0", actionRule("transitions-to-actions", "Old")),
      ),
      v2 = define(
        registry,
        "type://test.example/RulesV2/1.0",
        ext("adk:v2/1.0", actionRule("transitions-to-actions", "New")),
      );
    registry.bind("unfoldRules", v1);
    const r1 = actions(engine, seed);
    registry.bind("unfoldRules", v2);
    const r2 = actions(engine, seed);
    expect(r1).toEqual(["OldPaidOrder"]);
    expect(r2).toEqual(["NewPaidOrder"]);
    stable(engine, pid, ctor);
  });

  test("rule removal drops a previously added action and falls through to the base rule", () => {
    const { registry, engine, seed, pid, ctor } = boot(),
      v1 = define(
        registry,
        "type://test.example/RulesKeepExtra/1.0",
        ext(
          "adk:keep-extra/1.0",
          actionRule("transitions-to-actions", "Old"),
          actionRule("bonus-actions", "Extra"),
        ),
      ),
      v2 = define(
        registry,
        "type://test.example/RulesDropExtra/1.0",
        ext("adk:drop-extra/1.0", actionRule("transitions-to-actions", "Old")),
      );
    registry.bind("unfoldRules", v1);
    const r1 = actions(engine, seed);
    registry.bind("unfoldRules", v2);
    const r2 = actions(engine, seed);
    expect(r1).toEqual(["ExtraPaidOrder", "OldPaidOrder"]);
    expect(r2).toEqual(["OldPaidOrder"]);
    stable(engine, pid, ctor);
  });

  test("rule addition starts affecting an input that v1 left on the base behavior", () => {
    const { registry, engine, seed, pid, ctor } = boot(),
      v1 = define(
        registry,
        "type://test.example/RulesBaseOnly/1.0",
        ext("adk:base-only/1.0", actionRule("transitions-to-actions", "")),
      ),
      v2 = define(
        registry,
        "type://test.example/RulesWithExtra/1.0",
        ext(
          "adk:with-extra/1.0",
          actionRule("transitions-to-actions", ""),
          actionRule("bonus-actions", "Extra"),
        ),
      );
    registry.bind("unfoldRules", v1);
    const r1 = actions(engine, seed);
    registry.bind("unfoldRules", v2);
    const r2 = actions(engine, seed);
    expect(r1).toEqual(["PaidOrder"]);
    expect(r2).toEqual(["ExtraPaidOrder", "PaidOrder"]);
    stable(engine, pid, ctor);
  });

  test("multiple rebinds produce three distinct outputs without leakage", () => {
    const { registry, engine, seed, pid, ctor } = boot(),
      v1 = define(
        registry,
        "type://test.example/RulesA/1.0",
        ext("adk:a/1.0", actionRule("transitions-to-actions", "One")),
      ),
      v2 = define(
        registry,
        "type://test.example/RulesB/1.0",
        ext("adk:b/1.0", actionRule("transitions-to-actions", "Two")),
      ),
      v3 = define(
        registry,
        "type://test.example/RulesC/1.0",
        ext("adk:c/1.0", actionRule("transitions-to-actions", "Three")),
      );
    registry.bind("unfoldRules", v1);
    const r1 = actions(engine, seed);
    registry.bind("unfoldRules", v2);
    const r2 = actions(engine, seed);
    registry.bind("unfoldRules", v3);
    const r3 = actions(engine, seed);
    expect([r1, r2, r3]).toEqual([["OnePaidOrder"], ["TwoPaidOrder"], ["ThreePaidOrder"]]);
    stable(engine, pid, ctor);
  });

  test("rebinding an unrelated name leaves the unfold result unchanged", () => {
    const { registry, engine, seed, pid, ctor } = boot(),
      rules = define(
        registry,
        "type://test.example/RulesStable/1.0",
        ext("adk:stable/1.0", actionRule("transitions-to-actions", "Scoped")),
      ),
      other1 = define(
        registry,
        "type://test.example/OtherA/1.0",
        ext("adk:other-a/1.0", actionRule("transitions-to-actions", "OtherA")),
      ),
      other2 = define(
        registry,
        "type://test.example/OtherB/1.0",
        ext("adk:other-b/1.0", actionRule("transitions-to-actions", "OtherB")),
      );
    registry.bind("unfoldRules", rules);
    const r1 = actions(engine, seed);
    registry.bind("differentRules", other1);
    registry.bind("differentRules", other2);
    const r2 = actions(engine, seed);
    expect(r1).toEqual(["ScopedPaidOrder"]);
    expect(r2).toEqual(["ScopedPaidOrder"]);
    stable(engine, pid, ctor);
  });

  test("subscriber unwired keeps later rebinds from affecting the stale engine", () => {
    const kernel = AlgebraicKernel.create(),
      registry = kernel.kernel.registry,
      intents = new IntentProcessor(kernel),
      seed = "type://test.example/Order/1.0",
      pid = process.pid,
      ctor = UnfoldingEngine;
    kernel.defineType({
      id: seed,
      name: "Order",
      version: "1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        required: ["id", "status"],
        properties: { id: { type: "string" }, status: { type: "string", enum: ["draft", "paid"] } },
      },
    });
    const originalOnRebind = registry.onRebind.bind(registry);
    let off: (() => void) | undefined;
    registry.onRebind = ((handler) =>
      (off = originalOnRebind(handler))) as typeof registry.onRebind;
    const engine = new UnfoldingEngine(kernel, intents, { ruleNames: ["unfoldRules"] });
    registry.onRebind = originalOnRebind;
    const v1 = define(
        registry,
        "type://test.example/RulesStay/1.0",
        ext("adk:stay/1.0", actionRule("transitions-to-actions", "Stay")),
      ),
      v2 = define(
        registry,
        "type://test.example/RulesGone/1.0",
        ext("adk:gone/1.0", actionRule("transitions-to-actions", "Gone")),
      );
    registry.bind("unfoldRules", v1);
    const r1 = actions(engine, seed);
    off!();
    registry.bind("unfoldRules", v2);
    const r2 = actions(engine, seed);
    expect(r1).toEqual(["StayPaidOrder"]);
    expect(r2).toEqual(["StayPaidOrder"]);
    stable(engine, pid, ctor);
  });
});
