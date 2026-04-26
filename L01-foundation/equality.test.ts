import { describe, expect, test } from "bun:test";
import { deepEqual } from "./equality.ts";

describe("deepEqual", () => {
  test("matches equal and unequal primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(false, true)).toBe(false);
  });

  test("uses Object.is semantics for NaN and signed zero", () => {
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(false);
  });

  test("compares arrays structurally", () => {
    expect(deepEqual([], [])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 4, 3])).toBe(false);
  });

  test("compares plain objects by sorted keys and nested values", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  test("rejects mismatched shapes and null asymmetry", () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual(undefined, null)).toBe(false);
  });

  test("covers validator-style const and enum payloads", () => {
    expect(deepEqual({ kind: "const", value: 42 }, { kind: "const", value: 42 })).toBe(true);
    expect(
      deepEqual(
        { enum: ["draft", "live"], meta: { active: true } },
        { meta: { active: true }, enum: ["draft", "live"] },
      ),
    ).toBe(true);
    expect(deepEqual({ value: 1 }, { value: "1" })).toBe(false);
  });

  test("covers registry-style recursive AST trees", () => {
    const left = {
      op: "compose",
      outer: { op: "ref", asset: "asset://adk/Button/1.0" },
      inner: {
        op: "product",
        left: { op: "literal", value: { text: "ok" } },
        right: { op: "literal", value: ["x", "y"] },
      },
    };
    const right = {
      inner: {
        right: { op: "literal", value: ["x", "y"] },
        left: { value: { text: "ok" }, op: "literal" },
        op: "product",
      },
      outer: { asset: "asset://adk/Button/1.0", op: "ref" },
      op: "compose",
    };
    expect(deepEqual(left, right)).toBe(true);
  });

  test("covers acceptance-style assertion state records", () => {
    const left = {
      actual: {
        ord_1: { status: "paid", totals: { subtotal: 12, tax: 3 } },
        ord_2: { status: "draft", totals: { subtotal: 2, tax: 0 } },
      },
      expected: {
        ord_1: { status: "paid", totals: { subtotal: 12, tax: 3 } },
        ord_2: { status: "draft", totals: { subtotal: 2, tax: 0 } },
      },
    };
    const right = {
      expected: {
        ord_2: { totals: { tax: 0, subtotal: 2 }, status: "draft" },
        ord_1: { totals: { tax: 3, subtotal: 12 }, status: "paid" },
      },
      actual: {
        ord_2: { totals: { tax: 0, subtotal: 2 }, status: "draft" },
        ord_1: { totals: { tax: 3, subtotal: 12 }, status: "paid" },
      },
    };
    expect(deepEqual(left, right)).toBe(true);
  });
});
