import { describe, expect, test } from "bun:test";
import type { KernelExpression } from "../L04-expression/evaluator.ts";
import { ExpressionEvaluator } from "../L04-expression/evaluator.ts";
import { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";
import { MorphismRegistry } from "./registry.ts";

const inputs = ["hello", "world", "", "x".repeat(100), "hEllo-µ"];
const mulberry32 = (a: number) => () =>
  ((a |= 0),
  (a = (a + 0x6d2b79f5) | 0),
  (((a ^ (a >>> 15)) * (1 | a)) ^
    ((a ^ (a >>> 15)) * (1 | a) +
      (((a ^ (a >>> 15)) * (1 | a)) ^ a) *
        (61 | ((a ^ (a >>> 15)) * (1 | a) + (((a ^ (a >>> 15)) * (1 | a)) ^ a)))) ^
    ((((a ^ (a >>> 15)) * (1 | a)) ^
      ((a ^ (a >>> 15)) * (1 | a) +
        (((a ^ (a >>> 15)) * (1 | a)) ^ a) *
          (61 | ((a ^ (a >>> 15)) * (1 | a) + (((a ^ (a >>> 15)) * (1 | a)) ^ a))))) >>>
      14)) >>>
    0) / 4294967296;
const rng = mulberry32(0xc0ffee);
const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!;
const expr = (d = 0): KernelExpression =>
  d > 1 || rng() < 0.4
    ? pick([
        { op: "var", name: "$input" },
        { op: "const", value: "" },
        { op: "const", value: "x" },
        { op: "const", value: "Ω" },
      ])
    : { op: "call", fn: "concat", args: [expr(d + 1), expr(d + 1)] };

function setup() {
  const kernel = MetamodelKernel.create();
  const registry = new MorphismRegistry(kernel, new ExpressionEvaluator());
  return {
    registry,
    A: kernel.defineScalar("A", "1.0", { type: "string" }),
    B: kernel.defineScalar("B", "1.0", { type: "string" }),
    C: kernel.defineScalar("C", "1.0", { type: "string" }),
    D: kernel.defineScalar("D", "1.0", { type: "string" }),
  };
}

function morphism(
  registry: MorphismRegistry,
  name: string,
  sourceType: string,
  targetType: string,
) {
  const ast = expr();
  return registry.define(name, sourceType, targetType, ast, { impl: { kind: "algebra", ast } });
}

describe("Layer 12: Morphism category laws", () => {
  for (let i = 0; i < 10; i++) {
    test(`left identity ${i + 1}`, async () => {
      const { registry, A, B } = setup();
      const f = morphism(registry, `left_${i}`, A, B);
      const lhs = registry.compose(registry.identity(A).id, f.id);
      for (const input of inputs)
        expect(await registry.evaluate(lhs.id, input)).toEqual(
          await registry.evaluate(f.id, input),
        );
    });

    test(`right identity ${i + 1}`, async () => {
      const { registry, A, B } = setup();
      const f = morphism(registry, `right_${i}`, A, B);
      const rhs = registry.compose(f.id, registry.identity(B).id);
      for (const input of inputs)
        expect(await registry.evaluate(rhs.id, input)).toEqual(
          await registry.evaluate(f.id, input),
        );
    });

    test(`associativity ${i + 1}`, async () => {
      const { registry, A, B, C, D } = setup();
      const f = morphism(registry, `f_${i}`, A, B);
      const g = morphism(registry, `g_${i}`, B, C);
      const h = morphism(registry, `h_${i}`, C, D);
      const lhs = registry.compose(registry.compose(f.id, g.id).id, h.id);
      const rhs = registry.compose(f.id, registry.compose(g.id, h.id).id);
      for (const input of inputs)
        expect(await registry.evaluate(lhs.id, input)).toEqual(
          await registry.evaluate(rhs.id, input),
        );
    });
  }
});
