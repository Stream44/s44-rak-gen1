import { describe, test, expect } from "bun:test";
import { ExpressionEvaluator } from "../L13-facade/index.ts";
import type { KernelExpression } from "../L13-facade/index.ts";

describe("Layer 10: ExpressionEvaluator canonicalize builtin", () => {
  const evaluator = new ExpressionEvaluator();

  function canonicalizeExpr(value: unknown): KernelExpression {
    return {
      op: "call",
      fn: "canonicalize",
      args: [{ op: "const", value }],
    };
  }

  test("same value twice produces the same string", () => {
    const expr = canonicalizeExpr({ a: 1, b: 2, c: 3 });

    const first = evaluator.evaluate(expr);
    const second = evaluator.evaluate(expr);

    expect(first.value).toBe('{"a":1,"b":2,"c":3}');
    expect(second.value).toBe(first.value);
  });

  test("property-order permutation produces the same string", () => {
    const ab = evaluator.evaluate(canonicalizeExpr({ a: 1, b: 2 }));
    const ba = evaluator.evaluate(canonicalizeExpr({ b: 2, a: 1 }));
    const abc = evaluator.evaluate(canonicalizeExpr({ a: 1, b: 2, c: 3 }));
    const cba = evaluator.evaluate(canonicalizeExpr({ c: 3, b: 2, a: 1 }));

    expect(ab.value).toBe('{"a":1,"b":2}');
    expect(ba.value).toBe('{"a":1,"b":2}');
    expect(abc.value).toBe('{"a":1,"b":2,"c":3}');
    expect(cba.value).toBe('{"a":1,"b":2,"c":3}');
  });

  test("two distinct values produce distinct strings", () => {
    const one = evaluator.evaluate(canonicalizeExpr({ a: 1 }));
    const two = evaluator.evaluate(canonicalizeExpr({ a: 2 }));
    const stringOne = evaluator.evaluate(canonicalizeExpr({ a: "1" }));

    expect(one.value).not.toBe(two.value);
    expect(one.value).not.toBe(stringOne.value);
  });

  test("deeply nested structures are stable", () => {
    const left = {
      z: {
        beta: [
          { y: true, x: null },
          { m: "text", a: [3, 2, 1] },
        ],
        alpha: {
          tail: { k: "v", j: 9 },
          head: { flag: false, score: 1.5 },
        },
      },
      a: { list: [1, { d: 4, c: 3 }], on: true },
    };
    const right = {
      a: { on: true, list: [1, { c: 3, d: 4 }] },
      z: {
        alpha: {
          head: { score: 1.5, flag: false },
          tail: { j: 9, k: "v" },
        },
        beta: [
          { x: null, y: true },
          { a: [3, 2, 1], m: "text" },
        ],
      },
    };

    const first = evaluator.evaluate(canonicalizeExpr(left));
    const second = evaluator.evaluate(canonicalizeExpr(right));

    expect(first.value).toBe(second.value);
  });

  test("cycles throw cleanly with a descriptive error", () => {
    const cyclicValue: Record<string, unknown> = {};
    cyclicValue.self = cyclicValue;
    const expr: KernelExpression = {
      op: "call",
      fn: "canonicalize",
      args: [{ op: "var", name: "$input" }],
    };

    const result = evaluator.evaluate(expr, { $input: cyclicValue });

    expect(result.error).toBe("Cannot canonicalize cyclic value");
    expect(result.error).toMatch(/Cannot canonicalize cyclic value/);
  });

  test("undefined inside an object is elided and top-level undefined matches the helper behavior", () => {
    const objectResult = evaluator.evaluate(canonicalizeExpr({ a: 1, b: undefined, c: 3 }));
    const undefinedResult = evaluator.evaluate(canonicalizeExpr(undefined));

    expect(objectResult.value).toBe('{"a":1,"c":3}');
    expect(undefinedResult.value).toBeUndefined();
  });

  test("arrays preserve order and are not sorted", () => {
    const result = evaluator.evaluate(canonicalizeExpr([3, 1, 2]));

    expect(result.value).toBe("[3,1,2]");
  });

  test("primitives round-trip through JSON.stringify", () => {
    expect(evaluator.evaluate(canonicalizeExpr(42)).value).toBe("42");
    expect(evaluator.evaluate(canonicalizeExpr("hello")).value).toBe('"hello"');
    expect(evaluator.evaluate(canonicalizeExpr(true)).value).toBe("true");
    expect(evaluator.evaluate(canonicalizeExpr(null)).value).toBe("null");
  });
});
