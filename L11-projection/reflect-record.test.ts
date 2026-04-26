import { describe, expect, test } from "bun:test";
import { AlgebraicKernel, type ModelDocument } from "../L13-facade/index.ts";
import { validateMorphismDocument } from "../L02-metamodels/morphism-document-adapter.ts";
import {
  buildReflectRecordRuntimeDocument,
  isReferenceValue,
  listCategories,
  reflectRecordNode,
  registerReflectRecordMorphisms,
} from "./reflect-record-m1.ts";

describe("reflect-record morphisms", () => {
  test("validateMorphismDocument(buildReflectRecordRuntimeDocument()) does not throw", () => {
    expect(() => validateMorphismDocument(buildReflectRecordRuntimeDocument())).not.toThrow();
  });

  test("isReference unit covers URI prefixes, CID-like values, $ref objects, and negatives", async () => {
    const kernel = AlgebraicKernel.create();
    registerReflectRecordMorphisms(kernel);
    expect(
      await kernel.morphisms.evaluate("morphism://adk/isReference/1.0", "morphism://adk/demo/1.0"),
    ).toBe(true);
    expect(
      await kernel.morphisms.evaluate(
        "morphism://adk/isReference/1.0",
        "projection://adk/demo/1.0",
      ),
    ).toBe(true);
    expect(
      await kernel.morphisms.evaluate("morphism://adk/isReference/1.0", "model://adk/demo/1.0"),
    ).toBe(true);
    expect(
      await kernel.morphisms.evaluate("morphism://adk/isReference/1.0", "asset://adk/demo/1.0"),
    ).toBe(true);
    expect(
      await kernel.morphisms.evaluate(
        "morphism://adk/isReference/1.0",
        "bafyreic3jv6s7wq8x9y2z3k4m5n6p7q8r9s0t1u2v3w4x5",
      ),
    ).toBe(true);
    expect(
      await kernel.morphisms.evaluate("morphism://adk/isReference/1.0", {
        $ref: "model://adk/entity/1.0",
        type: "relation",
      }),
    ).toBe(true);
    expect(
      await kernel.morphisms.evaluate("morphism://adk/isReference/1.0", "module://adk/step/1.0"),
    ).toBe(false);
    expect(
      await kernel.morphisms.evaluate("morphism://adk/isReference/1.0", { plain: "object" }),
    ).toBe(false);
    expect(isReferenceValue(42)).toBe(false);
  });

  test("listCategories unit returns all eight categories in stable order and includes empties", async () => {
    const kernel = AlgebraicKernel.create();
    registerReflectRecordMorphisms(kernel);
    const synthetic: ModelDocument = {
      model: "synthetic",
      version: "1.0.0",
      entities: { Transaction: { attributes: { id: { type: "string", required: true } } } },
      enums: { TransactionState: { values: ["pending"] } },
      relations: { TransactionParty: { roles: { transaction: "Transaction", party: "Party" } } },
      lifecycle: { states: ["pending"], initial: "pending", terminal: [], transitions: [] },
      contracts: { payable: { claim: "total >= 0" } },
      actions: {
        ConfirmOrder: { verb: "confirm", inputSchema: { type: "object", properties: {} } },
      },
      capabilities: { ManageOrders: { description: "demo" } } as unknown as Record<string, unknown>,
      morphisms: {
        ComputeShippingLabel: { impl: { kind: "module", uri: "module://./mods/x.ts" } },
      },
    } as ModelDocument;
    const categories = (await kernel.morphisms.evaluate(
      "morphism://adk/listCategories/1.0",
      synthetic,
    )) as ReturnType<typeof listCategories>;
    expect(categories.map((entry) => entry.name)).toEqual([
      "entities",
      "enums",
      "relations",
      "lifecycle",
      "contracts",
      "actions",
      "capabilities",
      "morphisms",
    ]);
    expect(categories.find((entry) => entry.name === "capabilities")?.records).toHaveLength(1);
    expect(categories.find((entry) => entry.name === "relations")?.records[0]?.id).toBe(
      "TransactionParty",
    );
  });

  test("reflectRecord renders reference badges, module URI passthrough, and truncation markers", () => {
    const node = reflectRecordNode({
      record: {
        id: "Transaction",
        relations: ["model://adk/relation/TransactionParty/1.0"],
        module: "module://adk/step/1.0",
        nested: { a: { b: { c: { d: { e: { f: "deep" } } } } } },
      },
      maxDepth: 5,
    });
    const rows = node.children;
    expect(JSON.stringify(rows)).toContain("xref.pivot");
    expect(JSON.stringify(rows)).toContain("module://adk/step/1.0");
    expect(JSON.stringify(rows)).toContain("…(truncated at depth)");
  });

  test("reflectRecord keeps synthetic morphism asset URIs as reference badges", () => {
    const morphismRecord = {
      id: "LoadAsset",
      impl: { kind: "module", uri: "asset://fixture/morphism/load-asset/1.0" },
    };
    const node = reflectRecordNode({ record: morphismRecord, maxDepth: 5 });
    expect(JSON.stringify(node)).toContain("asset://");
    expect(JSON.stringify(node)).toContain("xref.pivot");
  });

  test("reflectRecord terminates on a self-referential object in under 2s", () => {
    const cyclic: Record<string, unknown> = { id: "cycle" };
    cyclic.self = cyclic;
    const started = performance.now();
    const node = reflectRecordNode({ record: cyclic, maxDepth: 5 });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(JSON.stringify(node)).toMatch(/…\(truncated at depth\)|\.\.\.\(cycle\)/);
  });
});
