import { beforeEach, describe, expect, test } from "bun:test";
import {
  AlgebraicKernel,
  MetaLevel,
  SchemaValidator,
  TypeRegistry,
  type TypeDef,
} from "../../L13-facade/index.ts";
import { IntentProcessor } from "../../L07-agency/intent.ts";
import { UnfoldingEngine } from "./engine.ts";
import {
  ConformanceEngine,
  type ConformanceRulesDocument,
} from "../../L03-tower/conformance/engine.ts";
import type { UnfoldRulesDocument } from "./rules-types.ts";

const unfoldDoc = (id: string, actionName: string): UnfoldRulesDocument =>
  ({
    id,
    version: "1.0",
    conformsTo: "adk:RulesDocument/1.0",
    discriminator: "unfold",
    heuristics: [
      {
        id: "transitions-to-actions",
        when: { requires: ["detect-lifecycle"] },
        emit: {
          kind: "action-per-transition",
          actionName: { template: actionName },
          inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
          origin: "test.example",
        },
      },
    ],
  }) as UnfoldRulesDocument;
const confDoc = (message: string): ConformanceRulesDocument => ({
  id: `adk:${message}/1.0`,
  version: "1.0",
  conformsTo: "adk:RulesDocument/1.0",
  discriminator: "conformance",
  rules: [
    {
      id: "project.custom-policy",
      when: { childLevel: 1, parentLevel: 2, childIdEqualsParentId: false },
      outcome: { onFail: { message, keyword: "custom" } },
    },
  ],
});
const boundType = (id: string, doc: unknown): TypeDef => ({
  id,
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
  name: id.split("/").at(-2),
  schema: { type: "object", properties: {}, default: doc },
});

describe("rule engine hot reload", () => {
  let ak: AlgebraicKernel, intents: IntentProcessor, registry: TypeRegistry, seed: string;
  beforeEach(() => {
    ak = AlgebraicKernel.create();
    intents = new IntentProcessor(ak);
    registry = ak.kernel.registry;
    seed = "type://test.example/Order/1.0";
    ak.defineType({
      id: seed,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      name: "Order",
      version: "1.0",
      schema: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["pending", "paid"] },
        },
      },
    });
  });

  test("boot with rule name uses current binding", () => {
    const cid = registry.defineType(
      boundType(
        "type://test.example/OldRules/1.0",
        unfoldDoc("adk:old/1.0", "Old${capitalize(verb)}${entity.name}"),
      ),
    );
    registry.bind("X", cid);
    expect(
      new UnfoldingEngine(ak, intents, { ruleNames: ["X"] })
        .unfold(seed)
        .strata.actions.map((a) => a.name),
    ).toContain("OldPaidOrder");
  });

  test("rebind updates next unfold without restart", () => {
    const v1 = registry.defineType(
      boundType(
        "type://test.example/RulesV1/1.0",
        unfoldDoc("adk:v1/1.0", "Old${capitalize(verb)}${entity.name}"),
      ),
    );
    const v2 = registry.defineType(
      boundType(
        "type://test.example/RulesV2/1.0",
        unfoldDoc("adk:v2/1.0", "New${capitalize(verb)}${entity.name}"),
      ),
    );
    const engine = new UnfoldingEngine(ak, intents, { ruleNames: ["X"] });
    registry.bind("X", v1);
    expect(engine.unfold(seed).strata.actions.map((a) => a.name)).toContain("OldPaidOrder");
    registry.bind("X", v2);
    expect(engine.unfold(seed).strata.actions.map((a) => a.name)).toContain("NewPaidOrder");
    expect(engine).toBe(engine);
  });

  test("same engine instance survives multiple binds", () => {
    const engine = new UnfoldingEngine(ak, intents, { ruleNames: ["X"] });
    const first = registry.defineType(
      boundType(
        "type://test.example/RulesSameA/1.0",
        unfoldDoc("adk:same-a/1.0", "One${capitalize(verb)}${entity.name}"),
      ),
    );
    const second = registry.defineType(
      boundType(
        "type://test.example/RulesSameB/1.0",
        unfoldDoc("adk:same-b/1.0", "Two${capitalize(verb)}${entity.name}"),
      ),
    );
    registry.bind("X", first);
    expect(engine.unfold(seed).strata.actions.map((a) => a.name)).toContain("OnePaidOrder");
    registry.bind("X", second);
    expect(engine.unfold(seed).strata.actions.map((a) => a.name)).toContain("TwoPaidOrder");
  });

  test("in-flight unfold keeps old rules and next call sees new rules", () => {
    const v1 = registry.defineType(
      boundType(
        "type://test.example/RulesA/1.0",
        unfoldDoc("adk:a/1.0", "Old${capitalize(verb)}${entity.name}"),
      ),
    );
    const v2 = registry.defineType(
      boundType(
        "type://test.example/RulesB/1.0",
        unfoldDoc("adk:b/1.0", "New${capitalize(verb)}${entity.name}"),
      ),
    );
    registry.bind("X", v1);
    const engine = new UnfoldingEngine(ak, intents, { ruleNames: ["X"] }),
      original = engine["interpolate"].bind(engine);
    let rebound = false;
    engine["interpolate"] = ((template: string, scope: Record<string, unknown>) => {
      if (!rebound && template.includes("Old")) {
        rebound = true;
        registry.bind("X", v2);
      }
      return original(template, scope);
    }) as (typeof engine)["interpolate"];
    expect(engine.unfold(seed).strata.actions.map((a) => a.name)).toContain("OldPaidOrder");
    expect(engine.unfold(seed).strata.actions.map((a) => a.name)).toContain("NewPaidOrder");
  });

  test("unrelated bind does not invalidate unfold cache", () => {
    const cid = registry.defineType(
      boundType(
        "type://test.example/Rules/1.0",
        unfoldDoc("adk:cache/1.0", "Hot${capitalize(verb)}${entity.name}"),
      ),
    );
    registry.bind("X", cid);
    const engine = new UnfoldingEngine(ak, intents, { ruleNames: ["X"] }),
      original = engine["recompileRules"].bind(engine);
    let recompiles = 0;
    engine["recompileRules"] = (() => {
      recompiles += 1;
      return original();
    }) as (typeof engine)["recompileRules"];
    engine.unfold(seed);
    registry.bind("Y", cid);
    engine.unfold(seed);
    expect(recompiles).toBe(1);
  });

  test("disposing engine prevents future invalidations", () => {
    const v1 = registry.defineType(
      boundType(
        "type://test.example/RulesStay/1.0",
        unfoldDoc("adk:stay/1.0", "Old${capitalize(verb)}${entity.name}"),
      ),
    );
    const v2 = registry.defineType(
      boundType(
        "type://test.example/RulesGone/1.0",
        unfoldDoc("adk:gone/1.0", "New${capitalize(verb)}${entity.name}"),
      ),
    );
    registry.bind("X", v1);
    const engine = new UnfoldingEngine(ak, intents, { ruleNames: ["X"] });
    expect(engine.unfold(seed).strata.actions.map((a) => a.name)).toContain("OldPaidOrder");
    engine.dispose();
    registry.bind("X", v2);
    expect(engine.unfold(seed).strata.actions.map((a) => a.name)).toContain("OldPaidOrder");
  });

  test("conformance engine rebind uses latest bound rules", () => {
    const registry = new TypeRegistry(),
      engine = new ConformanceEngine(new SchemaValidator(), { registry, ruleNames: ["C"] });
    const child: TypeDef = {
      id: "type://Example/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: {} },
    };
    const parent: TypeDef = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      level: MetaLevel.Metamodel,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
      schema: { type: "object", properties: {} },
    };
    registry.bind(
      "C",
      registry.defineType(boundType("type://test.example/ConfA/1.0", confDoc("blocked v1"))),
    );
    expect(engine.checkDirect(child, parent).errors[0]?.message).toBe("blocked v1");
    registry.bind(
      "C",
      registry.defineType(boundType("type://test.example/ConfB/1.0", confDoc("blocked v2"))),
    );
    expect(engine.checkDirect(child, parent).errors[0]?.message).toBe("blocked v2");
  });

  test("subscribeToRules filters by name", () => {
    const registry = new TypeRegistry(),
      seen: string[] = [],
      cid = registry.defineType(boundType("type://test.example/Any/1.0", confDoc("seen")));
    const off = registry.subscribeToRules(["X", "Y"], (name) => seen.push(name));
    registry.bind("X", cid);
    registry.bind("Z", cid);
    registry.bind("Y", cid);
    off();
    registry.bind("X", cid);
    expect(seen).toEqual(["X", "Y"]);
  });
});
