import { describe, test, expect } from "bun:test";
import { ExpressionEvaluator } from "../L13-facade/index.ts";
import type { KernelExpression } from "../L13-facade/index.ts";

describe("Layer 10: ExpressionEvaluator", () => {
  const evaluator = new ExpressionEvaluator();

  test("const returns value", () => {
    expect(evaluator.evaluate({ op: "const", value: 42 }).value).toBe(42);
  });

  test("var reads from context", () => {
    expect(evaluator.evaluate({ op: "var", name: "x" }, { x: 10 }).value).toBe(10);
  });

  test("arithmetic operations", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "add",
        args: [
          { op: "const", value: 3 },
          { op: "const", value: 4 },
        ],
      }).value,
    ).toBe(7);
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "mul",
        args: [
          { op: "const", value: 6 },
          { op: "const", value: 7 },
        ],
      }).value,
    ).toBe(42);
  });

  test("comparison operations", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "gt",
        args: [
          { op: "const", value: 10 },
          { op: "const", value: 5 },
        ],
      }).value,
    ).toBe(true);
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "eq",
        args: [
          { op: "const", value: "hello" },
          { op: "const", value: "hello" },
        ],
      }).value,
    ).toBe(true);
  });

  test("boolean operations", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "and",
        args: [
          { op: "const", value: true },
          { op: "const", value: false },
        ],
      }).value,
    ).toBe(false);
    expect(
      evaluator.evaluate({ op: "call", fn: "not", args: [{ op: "const", value: false }] }).value,
    ).toBe(true);
  });

  test("if-then-else", () => {
    const expr: KernelExpression = {
      op: "if",
      cond: { op: "const", value: true },
      then: { op: "const", value: "yes" },
      else: { op: "const", value: "no" },
    };
    expect(evaluator.evaluate(expr).value).toBe("yes");
  });

  test("let bindings", () => {
    const expr: KernelExpression = {
      op: "let",
      name: "x",
      value: { op: "const", value: 10 },
      body: {
        op: "call",
        fn: "mul",
        args: [
          { op: "var", name: "x" },
          { op: "const", value: 2 },
        ],
      },
    };
    expect(evaluator.evaluate(expr).value).toBe(20);
  });

  test("lambda and apply", () => {
    const expr: KernelExpression = {
      op: "apply",
      fn: {
        op: "lambda",
        param: "x",
        body: {
          op: "call",
          fn: "add",
          args: [
            { op: "var", name: "x" },
            { op: "const", value: 1 },
          ],
        },
      },
      arg: { op: "const", value: 41 },
    };
    expect(evaluator.evaluate(expr).value).toBe(42);
  });

  test("record construction", () => {
    const expr: KernelExpression = {
      op: "record",
      fields: { name: { op: "const", value: "Ada" }, age: { op: "const", value: 36 } },
    };
    expect(evaluator.evaluate(expr).value).toEqual({ name: "Ada", age: 36 });
  });

  test("array construction", () => {
    const expr: KernelExpression = {
      op: "array",
      elements: [
        { op: "const", value: 1 },
        { op: "const", value: 2 },
        { op: "const", value: 3 },
      ],
    };
    expect(evaluator.evaluate(expr).value).toEqual([1, 2, 3]);
  });

  test("arrayConcat concatenates arrays", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "arrayConcat",
        args: [
          { op: "const", value: [1] },
          { op: "const", value: [2, 3] },
        ],
      }).value,
    ).toEqual([1, 2, 3]);
  });

  test("arrayConcat handles empty arrays", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "arrayConcat",
        args: [
          { op: "const", value: [] },
          { op: "const", value: [] },
        ],
      }).value,
    ).toEqual([]);
  });

  test("arrayConcat errors when left operand is not an array", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "arrayConcat",
        args: [
          { op: "const", value: "nope" },
          { op: "const", value: [1] },
        ],
      }).error,
    ).toBe("arrayConcat requires array left operand, got string");
  });

  test("arrayConcat errors when right operand is not an array", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "arrayConcat",
        args: [
          { op: "const", value: [1] },
          { op: "const", value: 2 },
        ],
      }).error,
    ).toBe("arrayConcat requires array right operand, got number");
  });

  test("get path extraction", () => {
    expect(
      evaluator.evaluate({ op: "get", path: "name" }, { $self: { name: "Ada", age: 36 } }).value,
    ).toBe("Ada");
  });

  test("pattern matching", () => {
    const expr: KernelExpression = {
      op: "match",
      scrutinee: { op: "const", value: { kind: "circle", radius: 5 } },
      cases: [
        {
          pattern: { kind: "record", fields: { kind: { kind: "const", value: "square" } } },
          body: { op: "const", value: "is square" },
        },
        {
          pattern: {
            kind: "record",
            fields: {
              kind: { kind: "const", value: "circle" },
              radius: { kind: "var", name: "r" },
            },
          },
          body: {
            op: "call",
            fn: "mul",
            args: [
              { op: "const", value: 3.14159 },
              {
                op: "call",
                fn: "mul",
                args: [
                  { op: "var", name: "r" },
                  { op: "var", name: "r" },
                ],
              },
            ],
          },
        },
      ],
    };
    expect(evaluator.evaluate(expr).value).toBeCloseTo(78.54, 1);
  });

  test("map over array", () => {
    const expr: KernelExpression = {
      op: "call",
      fn: "map",
      args: [
        { op: "const", value: [1, 2, 3] },
        {
          op: "lambda",
          param: "x",
          body: {
            op: "call",
            fn: "mul",
            args: [
              { op: "var", name: "x" },
              { op: "const", value: 2 },
            ],
          },
        },
      ],
    };
    expect(evaluator.evaluate(expr).value).toEqual([2, 4, 6]);
  });

  test("filter array", () => {
    const expr: KernelExpression = {
      op: "call",
      fn: "filter",
      args: [
        { op: "const", value: [1, 2, 3, 4, 5] },
        {
          op: "lambda",
          param: "x",
          body: {
            op: "call",
            fn: "gt",
            args: [
              { op: "var", name: "x" },
              { op: "const", value: 3 },
            ],
          },
        },
      ],
    };
    expect(evaluator.evaluate(expr).value).toEqual([4, 5]);
  });

  test("eval builtin evaluates a const expression value", () => {
    const expr: KernelExpression = {
      op: "call",
      fn: "eval",
      args: [{ op: "const", value: { op: "const", value: 42 } }],
    };
    expect(evaluator.evaluate(expr).value).toBe(42);
  });

  test("eval builtin uses only the provided nested context", () => {
    const expr: KernelExpression = {
      op: "call",
      fn: "eval",
      args: [
        { op: "const", value: { op: "var", name: "x" } },
        { op: "const", value: { x: 7 } },
      ],
    };
    expect(evaluator.evaluate(expr, { x: 99 }).value).toBe(7);
  });

  test("eval builtin shares gas with the caller", () => {
    const ev = new ExpressionEvaluator({ maxGas: 8 });
    let nested: KernelExpression = { op: "const", value: 0 };
    for (let i = 0; i < 10; i++) {
      nested = { op: "call", fn: "add", args: [nested, { op: "const", value: 1 }] };
    }
    const expr: KernelExpression = {
      op: "call",
      fn: "eval",
      args: [
        { op: "const", value: nested },
        { op: "const", value: {} },
      ],
    };
    expect(ev.evaluate(expr).error).toBe("OutOfGas");
  });

  test("eval builtin fully reduces apply chains from runtime expression values", () => {
    const storedExpr: KernelExpression = {
      op: "apply",
      fn: {
        op: "lambda",
        param: "x",
        body: {
          op: "call",
          fn: "mul",
          args: [
            {
              op: "call",
              fn: "add",
              args: [
                { op: "var", name: "x" },
                { op: "const", value: 1 },
              ],
            },
            { op: "const", value: 2 },
          ],
        },
      },
      arg: { op: "const", value: 20 },
    };
    const expr: KernelExpression = {
      op: "call",
      fn: "eval",
      args: [{ op: "const", value: storedExpr }],
    };
    expect(evaluator.evaluate(expr).value).toBe(42);
  });

  test("eval builtin defaults nested evaluation to an empty env", () => {
    const expr: KernelExpression = {
      op: "call",
      fn: "eval",
      args: [{ op: "const", value: { op: "var", name: "x" } }],
    };
    expect(evaluator.evaluate(expr, { x: 99 }).error).toBe("Unbound variable: x");
  });

  test("eval builtin rejects non-expression values with an eval-specific error", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "eval",
        args: [{ op: "const", value: 5 }],
      }).error,
    ).toContain("eval");
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "eval",
        args: [{ op: "const", value: { notAnOp: true } }],
      }).error,
    ).toContain("eval");
  });

  test("eval builtin rejects non-object contexts with an eval-specific error", () => {
    const expr: KernelExpression = {
      op: "call",
      fn: "eval",
      args: [
        { op: "const", value: { op: "const", value: 1 } },
        { op: "const", value: 7 },
      ],
    };
    expect(evaluator.evaluate(expr).error).toBe(
      "eval requires a plain object context as second arg, got number",
    );
  });

  test("eval builtin turns self-referential expression values into OutOfGas", () => {
    const cyclicExpr = {
      op: "if",
      cond: { op: "const", value: true },
      then: null,
      else: { op: "const", value: 0 },
    } as unknown as KernelExpression & { then: KernelExpression };
    cyclicExpr.then = cyclicExpr;

    const ev = new ExpressionEvaluator({ maxGas: 32 });
    const expr: KernelExpression = {
      op: "call",
      fn: "eval",
      args: [{ op: "const", value: cyclicExpr }],
    };
    expect(ev.evaluate(expr).error).toBe("OutOfGas");
  });

  test("gas exhaustion prevents infinite computation", () => {
    const ev = new ExpressionEvaluator({ maxGas: 10 });
    let expr: KernelExpression = { op: "const", value: 0 };
    for (let i = 0; i < 20; i++) {
      expr = { op: "call", fn: "add", args: [expr, { op: "const", value: 1 }] };
    }
    expect(ev.evaluate(expr).error).toBe("OutOfGas");
  });

  test("division by zero error", () => {
    expect(
      evaluator.evaluate({
        op: "call",
        fn: "div",
        args: [
          { op: "const", value: 10 },
          { op: "const", value: 0 },
        ],
      }).error,
    ).toBe("Division by zero");
  });

  test("unbound variable error", () => {
    expect(evaluator.evaluate({ op: "var", name: "undefined_var" }).error).toBe(
      "Unbound variable: undefined_var",
    );
  });

  test("celsius to fahrenheit morphism", () => {
    const expr: KernelExpression = {
      op: "call",
      fn: "add",
      args: [
        {
          op: "call",
          fn: "mul",
          args: [
            { op: "var", name: "celsius" },
            { op: "const", value: 1.8 },
          ],
        },
        { op: "const", value: 32 },
      ],
    };
    expect(evaluator.evaluate(expr, { celsius: 100 }).value).toBe(212);
  });

  test("refinement predicate: startDate < endDate", () => {
    const predicate: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "startDate" },
        { op: "get", path: "endDate" },
      ],
    };
    expect(evaluator.evaluate(predicate, { $self: { startDate: 100, endDate: 200 } }).value).toBe(
      true,
    );
    expect(evaluator.evaluate(predicate, { $self: { startDate: 300, endDate: 200 } }).value).toBe(
      false,
    );
  });
});
