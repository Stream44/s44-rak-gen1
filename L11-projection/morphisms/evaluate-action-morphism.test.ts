import { describe, expect, test } from "bun:test";
import { AlgebraicKernel, MetaLevel } from "../../L13-facade/index.ts";
import evaluateActionMorphism from "./evaluate-action-morphism.ts";

function kernel() {
  const ak = AlgebraicKernel.create();
  for (const name of ["Input", "Output"])
    ak.defineType({
      id: `type://adk/${name}/1.0`,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: {}, additionalProperties: true },
      name,
      version: "1.0",
    });
  const id = ak.morphisms.define(
    "identity",
    "type://adk/Input/1.0",
    "type://adk/Input/1.0",
    { op: "var", name: "$input" },
    { impl: { kind: "algebra", ast: { op: "var", name: "$input" } } },
  ).id;
  const wrap = ak.morphisms.define(
    "wrap",
    "type://adk/Input/1.0",
    "type://adk/Output/1.0",
    { op: "record", fields: { value: { op: "get", path: "$input/value" } } },
    {
      impl: {
        kind: "algebra",
        ast: { op: "record", fields: { value: { op: "get", path: "$input/value" } } },
      },
    },
  ).id;
  return {
    ak,
    morphismIdsByName: new Map([
      ["identity", id],
      ["wrap", wrap],
    ]),
    algebraBindings: new Map<string, Function>(),
  };
}

describe("evaluateActionMorphism", () => {
  test("evaluates named refs", async () => {
    const { ak, morphismIdsByName, algebraBindings } = kernel();
    await expect(
      evaluateActionMorphism(
        { kind: "name", name: "identity" },
        { value: "ok" },
        morphismIdsByName,
        algebraBindings,
        ak,
      ),
    ).resolves.toEqual({ value: "ok" });
  });

  test("evaluates two-step compose refs in order", async () => {
    const { ak, morphismIdsByName, algebraBindings } = kernel();
    await expect(
      evaluateActionMorphism(
        {
          kind: "compose",
          f: { kind: "name", name: "identity" },
          g: { kind: "name", name: "wrap" },
        },
        { value: "ok" },
        morphismIdsByName,
        algebraBindings,
        ak,
      ),
    ).resolves.toEqual({ value: "ok" });
  });

  test("throws on inline AST refs", async () => {
    const { ak, morphismIdsByName, algebraBindings } = kernel();
    await expect(
      evaluateActionMorphism(
        {
          kind: "product",
          left: { kind: "name", name: "identity" },
          right: { kind: "name", name: "wrap" },
        },
        { value: "ok" },
        morphismIdsByName,
        algebraBindings,
        ak,
      ),
    ).rejects.toThrow(/inline-AST action morphisms/);
  });
});
