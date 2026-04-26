import { describe, expect, test } from "bun:test";
import type { KernelExpression } from "../L04-expression/evaluator.ts";
import { ExpressionEvaluator } from "../L04-expression/evaluator.ts";
import { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";
import { MorphismRegistry } from "./registry.ts";

describe("Layer 12: Morphisms algebra dispatch", () => {
  function setup() {
    const kernel = MetamodelKernel.create();
    const evaluator = new ExpressionEvaluator();
    const registry = new MorphismRegistry(kernel, evaluator);

    const numberType = kernel.defineScalar("Number", "1.0", { type: "number" });
    const numberArrayType = kernel.defineCollection("NumberArray", "1.0", { type: "number" });
    const stringType = kernel.defineScalar("String", "1.0", { type: "string" });

    return { kernel, evaluator, registry, numberType, numberArrayType, stringType };
  }

  test("single algebra morphism dispatches end-to-end", async () => {
    const { registry, numberType } = setup();
    const addTen: KernelExpression = {
      op: "call",
      fn: "add",
      args: [
        { op: "var", name: "$input" },
        { op: "const", value: 10 },
      ],
    };

    const morphism = registry.define(
      "addTenAlgebra",
      numberType,
      numberType,
      { op: "var", name: "$input" },
      {
        impl: { kind: "algebra", ast: addTen },
      },
    );

    await expect(registry.evaluate(morphism.id, 5)).resolves.toBe(15);
  });

  test("compose of two algebra morphisms threads values correctly", async () => {
    const { registry, numberType } = setup();
    const doubleExpr: KernelExpression = {
      op: "call",
      fn: "mul",
      args: [
        { op: "var", name: "$input" },
        { op: "const", value: 2 },
      ],
    };
    const incrExpr: KernelExpression = {
      op: "call",
      fn: "add",
      args: [
        { op: "var", name: "$input" },
        { op: "const", value: 1 },
      ],
    };

    const double = registry.define("doubleAlgebra", numberType, numberType, doubleExpr, {
      impl: { kind: "algebra", ast: doubleExpr },
    });
    const incr = registry.define("incrAlgebra", numberType, numberType, incrExpr, {
      impl: { kind: "algebra", ast: incrExpr },
    });

    const composed = registry.compose(double.id, incr.id);
    await expect(registry.evaluate(composed.id, 3)).resolves.toBe(7);
  });

  test("error propagation parity with module-impl names both morphism ids", async () => {
    const { registry, numberType } = setup();
    const algebra = registry.define(
      "divZeroAlgebra",
      numberType,
      numberType,
      { op: "var", name: "$input" },
      {
        impl: {
          kind: "algebra",
          ast: {
            op: "call",
            fn: "div",
            args: [
              { op: "var", name: "$input" },
              { op: "const", value: 0 },
            ],
          },
        },
      },
    );

    const module = registry.define(
      "divZeroModule",
      numberType,
      numberType,
      { op: "var", name: "$input" },
      {
        impl: { kind: "module", uri: "module://./div-zero.ts", export: "divZero" },
      },
    );
    registry.registerModuleResolver(async (_uri: string, _exportName: string) => {
      return () => {
        throw new Error(`Morphism ${module.id}: Division by zero`);
      };
    });

    await expect(registry.evaluate(algebra.id, 1)).rejects.toThrow(
      new RegExp(
        `Morphism ${algebra.id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}: algebra evaluation failed: Division by zero`,
      ),
    );

    try {
      await registry.evaluate(module.id, 1);
      throw new Error("Expected module evaluation failure");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain(module.id);
      expect(message).toContain("Division by zero");
    }
  });

  test("gas exhaustion surfaces as a typed error", async () => {
    const { registry, numberArrayType } = setup();
    const morphism = registry.define(
      "mapHugeArrayAlgebra",
      numberArrayType,
      numberArrayType,
      { op: "var", name: "$input" },
      {
        impl: {
          kind: "algebra",
          ast: {
            op: "call",
            fn: "map",
            args: [
              { op: "var", name: "$input" },
              {
                op: "lambda",
                param: "item",
                body: {
                  op: "call",
                  fn: "add",
                  args: [
                    { op: "var", name: "item" },
                    { op: "const", value: 1 },
                  ],
                },
              },
            ],
          },
        },
      },
    );

    const largeInput = Array.from({ length: 200_000 }, (_, i) => i);
    await expect(registry.evaluate(morphism.id, largeInput)).rejects.toThrow(
      /Morphism .*: algebra evaluation failed: OutOfGas/,
    );
  });

  test("input validation still fires for algebra morphisms", async () => {
    const { registry, numberType } = setup();
    const morphism = registry.define(
      "inputValidatedAlgebra",
      numberType,
      numberType,
      { op: "var", name: "$input" },
      {
        impl: { kind: "algebra", ast: { op: "const", value: 1 } },
      },
    );

    await expect(registry.evaluate(morphism.id, "not a number")).rejects.toThrow(
      /Morphism .*: input does not conform to/,
    );
  });

  test("output validation still fires for algebra morphisms", async () => {
    const { registry, numberType } = setup();
    const morphism = registry.define(
      "outputValidatedAlgebra",
      numberType,
      numberType,
      { op: "var", name: "$input" },
      {
        impl: { kind: "algebra", ast: { op: "const", value: "a string" } },
      },
    );

    await expect(registry.evaluate(morphism.id, 1)).rejects.toThrow(
      /Morphism .*: output does not conform to/,
    );
  });
});
