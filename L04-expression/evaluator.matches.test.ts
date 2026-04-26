import { describe, expect, test } from "bun:test";
import { ExpressionEvaluator } from "../L13-facade/index.ts";
import type { KernelExpression, Pattern } from "../L13-facade/index.ts";

describe("Layer 10: matches builtin", () => {
  const evaluator = new ExpressionEvaluator();

  function matches(value: unknown, pattern: Pattern) {
    const expr: KernelExpression = {
      op: "call",
      fn: "matches",
      args: [
        { op: "const", value },
        { op: "const", value: pattern },
      ],
    };

    return evaluator.evaluate(expr).value;
  }

  test("wildcard pattern matches any value and binds nothing", () => {
    const pattern: Pattern = { kind: "wildcard" };

    expect(matches(42, pattern)).toEqual({ matched: true, bindings: {} });
    expect(matches("hello", pattern)).toEqual({ matched: true, bindings: {} });
    expect(matches([1, 2, 3], pattern)).toEqual({ matched: true, bindings: {} });
    expect(matches({ ok: true }, pattern)).toEqual({ matched: true, bindings: {} });
    expect(matches(null, pattern)).toEqual({ matched: true, bindings: {} });
  });

  test("var pattern matches any value and binds by name", () => {
    expect(matches(42, { kind: "var", name: "x" })).toEqual({
      matched: true,
      bindings: { x: 42 },
    });
    expect(matches({ a: 1 }, { kind: "var", name: "obj" })).toEqual({
      matched: true,
      bindings: { obj: { a: 1 } },
    });
  });

  test("const pattern matches equal values and fails on unequal values", () => {
    expect(matches(42, { kind: "const", value: 42 })).toEqual({
      matched: true,
      bindings: {},
    });
    expect(matches(42, { kind: "const", value: 41 })).toEqual({
      matched: false,
      bindings: {},
    });
    expect(matches({ a: 1, b: 2 }, { kind: "const", value: { a: 1, b: 2 } })).toEqual({
      matched: true,
      bindings: {},
    });
  });

  test("record pattern matches field-by-field with nested vars", () => {
    const pattern: Pattern = {
      kind: "record",
      fields: {
        from: { kind: "var", name: "f" },
        event: { kind: "const", value: "click" },
      },
    };

    expect(matches({ from: "idle", event: "click" }, pattern)).toEqual({
      matched: true,
      bindings: { f: "idle" },
    });
    expect(matches({ from: "idle", event: "hover" }, pattern)).toEqual({
      matched: false,
      bindings: {},
    });
  });

  test("record pattern missing field fails cleanly", () => {
    const pattern: Pattern = {
      kind: "record",
      fields: {
        from: { kind: "var", name: "f" },
        event: { kind: "const", value: "click" },
      },
    };

    expect(matches({ from: "idle" }, pattern)).toEqual({
      matched: false,
      bindings: {},
    });
  });

  test("deeply nested record patterns match recursively", () => {
    const pattern: Pattern = {
      kind: "record",
      fields: {
        machine: {
          kind: "record",
          fields: {
            state: { kind: "var", name: "state" },
            meta: {
              kind: "record",
              fields: {
                version: { kind: "const", value: 1 },
                tag: { kind: "var", name: "tag" },
              },
            },
          },
        },
        payload: {
          kind: "record",
          fields: {
            event: { kind: "const", value: "click" },
            detail: { kind: "wildcard" },
            nested: {
              kind: "record",
              fields: {
                target: { kind: "var", name: "target" },
              },
            },
          },
        },
      },
    };

    expect(
      matches(
        {
          machine: { state: "idle", meta: { version: 1, tag: "ui" } },
          payload: {
            event: "click",
            detail: { retries: 2 },
            nested: { target: "button.primary" },
          },
        },
        pattern,
      ),
    ).toEqual({
      matched: true,
      bindings: {
        state: "idle",
        tag: "ui",
        target: "button.primary",
      },
    });
  });

  test("non-matching returns empty bindings object", () => {
    const result = matches(
      { from: "idle", event: "hover" },
      {
        kind: "record",
        fields: {
          from: { kind: "const", value: "idle" },
          event: { kind: "const", value: "click" },
        },
      },
    );

    expect(result).toEqual({ matched: false, bindings: {} });
    expect(result).not.toBeNull();
    expect((result as { bindings: Record<string, unknown> }).bindings).toEqual({});
  });

  test("evaluate dispatches matches builtin through full expression path", () => {
    const expr: KernelExpression = {
      op: "call",
      fn: "matches",
      args: [
        { op: "var", name: "$input" },
        {
          op: "const",
          value: {
            kind: "record",
            fields: {
              from: { kind: "const", value: "idle" },
            },
          } satisfies Pattern,
        },
      ],
    };

    expect(evaluator.evaluate(expr, { $input: { from: "idle" } }).value).toEqual({
      matched: true,
      bindings: {},
    });
  });
});
