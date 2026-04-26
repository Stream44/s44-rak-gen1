import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BuiltinFn, KernelExpression } from "../../L04-expression/evaluator.ts";
import { TypeRegistry } from "../../L03-tower/registry.ts";
import { NormalizeError, normalize, type NormalizeContext } from "./normalize.ts";

const BUILTINS: BuiltinFn[] = [
  "add",
  "sub",
  "mul",
  "div",
  "mod",
  "neg",
  "abs",
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "and",
  "or",
  "not",
  "concat",
  "arrayConcat",
  "length",
  "substr",
  "head",
  "tail",
  "map",
  "filter",
  "fold",
  "keys",
  "values",
  "has",
  "merge",
  "matches",
  "canonicalize",
  "eval",
];
const ctx = (builtins = BUILTINS): NormalizeContext => ({
  validOps: new Set(new TypeRegistry().listAlgebraOperators().map((entry) => entry.name)),
  validBuiltins: new Set<string>(builtins),
});
const ids = (node: {
  nodeId: number;
  children: Array<{ nodeId: number; children: Array<unknown> }>;
}): number[] => [node.nodeId, ...node.children.flatMap((child) => ids(child as never))];
const morphisms = () =>
  (
    Bun.YAML.parse(
      readFileSync(resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml"), "utf-8"),
    ) as { morphisms: Record<string, { impl?: { kind?: string; ast?: KernelExpression } }> }
  ).morphisms;

describe("normalize", () => {
  test("tags a const leaf", () => {
    expect(normalize({ op: "const", value: 42 }, ctx())).toEqual({
      op: "const",
      value: 42,
      nodeId: 0,
      children: [],
    });
  });

  test("tags nested call nodes in pre-order", () => {
    const out = normalize(
      {
        op: "call",
        fn: "add",
        args: [
          { op: "const", value: 1 },
          { op: "const", value: 2 },
        ],
      },
      ctx(),
    );
    expect(ids(out as never)).toEqual([0, 1, 2]);
  });

  test("keeps deep nesting monotonic", () => {
    let ast: KernelExpression = { op: "const", value: 0 };
    for (let i = 0; i < 9; i++) ast = { op: "lambda", param: `$v${i}`, body: ast };
    expect(ids(normalize(ast, ctx()) as never)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("rejects an unknown op", () => {
    expect(() => normalize({ op: "frobnicate" } as never, ctx())).toThrow(NormalizeError);
  });

  test("accepts a registry op", () => {
    expect(normalize({ op: "product" } as never, ctx()).children).toEqual([]);
  });

  test("rejects an unknown builtin", () => {
    expect(() => normalize({ op: "call", fn: "mysteryFn", args: [] } as never, ctx())).toThrow(
      'unknown builtin "mysteryFn"',
    );
  });

  test("accepts a caller-provided builtin", () => {
    expect(
      normalize(
        { op: "call", fn: "upperCase", args: [] } as never,
        ctx([...BUILTINS, "upperCase" as BuiltinFn]),
      ).op,
    ).toBe("call");
  });

  test("is deterministic across repeated runs", () => {
    const ast: KernelExpression = {
      op: "record",
      fields: { foo: { op: "const", value: 1 }, bar: { op: "const", value: 2 } },
    };
    expect(normalize(ast, ctx())).toEqual(normalize(ast, ctx()));
  });

  test("includes the parent op in error context", () => {
    expect(() =>
      normalize(
        { op: "call", fn: "add", args: [{ op: "frobnicate" } as never, { op: "const", value: 2 }] },
        ctx(),
      ),
    ).toThrow('under "call"');
  });

  test("accepts a null const", () => {
    expect(normalize({ op: "const", value: null }, ctx()).nodeId).toBe(0);
  });

  test("tags record field children", () => {
    const out = normalize(
      { op: "record", fields: { foo: { op: "const", value: 1 }, bar: { op: "const", value: 2 } } },
      ctx(),
    ) as { fields: Record<string, { nodeId: number }> };
    expect([out.nodeId, out.fields.foo.nodeId, out.fields.bar.nodeId]).toEqual([0, 1, 2]);
  });

  test("normalizes ten real kernel-model algebra morphisms", () => {
    for (const ast of Object.values(morphisms())
      .filter((entry) => entry.impl?.kind === "algebra")
      .slice(0, 10)
      .map((entry) => entry.impl?.ast as KernelExpression)) {
      expect(() => normalize(ast, ctx())).not.toThrow();
    }
  });
});
