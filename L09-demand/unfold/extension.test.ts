import { beforeEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "url";
import { AlgebraicKernel, MetaLevel, type KernelExpression } from "../../L13-facade/index.ts";
import { buildTypeUri } from "../../L01-foundation/utils.ts";
import { IntentProcessor } from "../../L07-agency/intent.ts";
import { UnfoldingEngine } from "./engine.ts";
import type { MorphismAST, RefNode } from "../../L11-projection/algebra.ts";
import type { UnfoldRulesDocument } from "./rules-types.ts";

const OWNER_FIXTURE_PATH = fileURLToPath(
  new URL("./__fixtures__/owner-id-auth.yaml", import.meta.url),
);
const OWNER_CAP = "cap://test.example/authorize-owner/1.0";
const AUDIT_CAP = "cap://test.example/audit-owner/1.0";

let ak: AlgebraicKernel;
let intents: IntentProcessor;
let engine: UnfoldingEngine;

beforeEach(() => {
  ak = AlgebraicKernel.create();
  intents = new IntentProcessor(ak);
  engine = new UnfoldingEngine(ak, intents);
});

function defineOrderType(): string {
  const id = buildTypeUri("test.example", "Order", "1.0");
  ak.defineType({
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    name: "Order",
    version: "1.0",
    schema: {
      type: "object",
      required: ["id", "status", "total"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "paid", "shipped", "delivered"] },
        total: { type: "number", minimum: 0 },
      },
    },
  });
  return id;
}

function defineTaskType(): string {
  const id = buildTypeUri("test.example", "Task", "1.0");
  ak.defineType({
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    name: "Task",
    version: "1.0",
    schema: {
      type: "object",
      required: ["id", "status", "ownerId"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["open", "done"] },
        ownerId: { type: "string" },
      },
    },
  });
  return id;
}

function defineProductType(): string {
  const id = buildTypeUri("test.example", "Product", "1.0");
  ak.defineType({
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    name: "Product",
    version: "1.0",
    schema: {
      type: "object",
      required: ["sku", "name", "price"],
      properties: {
        sku: { type: "string" },
        name: { type: "string" },
        price: { type: "number" },
      },
    },
  });
  return id;
}

function collectRefs(ast: MorphismAST): RefNode[] {
  switch (ast.op) {
    case "ref":
      return [ast];
    case "product":
      return [...collectRefs(ast.left), ...collectRefs(ast.right)];
    case "compose":
      return [...collectRefs(ast.outer), ...collectRefs(ast.inner)];
    case "sum":
      return [...collectRefs(ast.then), ...collectRefs(ast.else)];
    case "restrict":
      return [...collectRefs(ast.f), ...(ast.fallback ? collectRefs(ast.fallback) : [])];
    case "extend":
      return collectRefs(ast.f);
    case "fmap":
      return collectRefs(ast.f);
    case "iter":
      return collectRefs(ast.template);
    case "cond":
      return [...collectRefs(ast.then), ...(ast.else ? collectRefs(ast.else) : [])];
    case "guard":
      return [...collectRefs(ast.f), ...(ast.fallback ? collectRefs(ast.fallback) : [])];
    case "literal":
      return [];
  }
}

function extractCapabilityUris(expr: KernelExpression): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.startsWith("cap://")) found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value && typeof value === "object") {
      for (const entry of Object.values(value as Record<string, unknown>)) visit(entry);
    }
  };
  visit(expr);
  return [...found];
}

function preconditionExtension(id: string, cap: string): UnfoldRulesDocument {
  return {
    conformsTo: "adk:RulesDocument/1.0",
    discriminator: "unfold",
    id: `adk:${id}/1.0`,
    version: "1.0",
    heuristics: [
      {
        id,
        when: { fieldNames: ["ownerId"] },
        emit: {
          kind: "action-precondition",
          appliesTo: "all-generated-actions",
          precondition: {
            op: "record",
            fields: {
              requires: { op: "const", value: cap },
            },
          },
        },
      },
    ],
  } as UnfoldRulesDocument;
}

describe("UnfoldingEngine extensions", () => {
  test("baseline engine unfolds Order with no extensions", () => {
    const result = engine.unfold(defineOrderType());
    expect(result.strata.process).toBe("order-lifecycle");
    expect(result.strata.actions).toHaveLength(3);
    expect(JSON.stringify(result.strata.projection.morphism)).not.toContain(OWNER_CAP);
  });

  test("ownerId extension loads via filesystem ref", () => {
    expect(() =>
      engine.extendRules(OWNER_FIXTURE_PATH, { strategy: "append", conflictPolicy: "error" }),
    ).not.toThrow();
  });

  test("seed with ownerId adds auth preconditions to generated actions", () => {
    engine.extendRules(OWNER_FIXTURE_PATH, { strategy: "append", conflictPolicy: "error" });
    const result = engine.unfold(defineTaskType());
    expect(result.strata.actions).toHaveLength(1);
    expect(
      result.strata.actions[0].preconditions.flatMap((expr) => extractCapabilityUris(expr)),
    ).toEqual([OWNER_CAP]);
  });

  test("generated endpoint projection node includes auth capability in requires", () => {
    engine.extendRules(OWNER_FIXTURE_PATH, { strategy: "append", conflictPolicy: "error" });
    const result = engine.unfold(defineTaskType());
    const endpointNode = collectRefs(result.strata.projection.morphism).find(
      (node) => node.props?.path === "/tasks/:id/done",
    );
    expect(endpointNode).toBeDefined();
    expect(endpointNode?.requires).toContain(OWNER_CAP);
  });

  test("seed without ownerId is unaffected", () => {
    engine.extendRules(OWNER_FIXTURE_PATH, { strategy: "append", conflictPolicy: "error" });
    const result = engine.unfold(defineProductType());
    expect(result.strata.actions).toHaveLength(0);
    expect(JSON.stringify(result.strata.projection.morphism)).not.toContain(OWNER_CAP);
  });

  test("strategy disagreement throws a descriptive error on the second detect-ownership extension", () => {
    engine.extendRules(OWNER_FIXTURE_PATH, { strategy: "append", conflictPolicy: "error" });
    const conflicting = preconditionExtension("detect-ownership", OWNER_CAP);
    conflicting.id = "adk:UnfoldRules-Extension-OwnerIdAuth-Prepend/1.0";
    let message = "";
    try {
      engine.extendRules(conflicting, { strategy: "prepend", conflictPolicy: "error" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("strategy disagreement");
    expect(message).toContain("detect-ownership");
    expect(message).toContain("append");
    expect(message).toContain("prepend");
    expect(message).toContain("adk:UnfoldRules-Extension-OwnerIdAuth/1.0");
    expect(message).toContain("adk:UnfoldRules-Extension-OwnerIdAuth-Prepend/1.0");
  });

  test("two extensions with matching tuples both succeed when heuristic ids differ", () => {
    engine.extendRules(OWNER_FIXTURE_PATH, { strategy: "append", conflictPolicy: "error" });
    engine.extendRules(preconditionExtension("detect-owner-audit", AUDIT_CAP), {
      strategy: "append",
      conflictPolicy: "error",
    });
    const result = engine.unfold(defineTaskType());
    const endpointNode = collectRefs(result.strata.projection.morphism).find(
      (node) => node.props?.path === "/tasks/:id/done",
    );
    expect(
      result.strata.actions[0].preconditions.flatMap((expr) => extractCapabilityUris(expr)),
    ).toEqual(expect.arrayContaining([OWNER_CAP, AUDIT_CAP]));
    expect(endpointNode?.requires).toEqual(expect.arrayContaining([OWNER_CAP, AUDIT_CAP]));
  });
});
