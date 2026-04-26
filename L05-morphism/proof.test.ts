import { describe, test, expect, beforeEach } from "bun:test";

import { MetamodelKernel, ExpressionEvaluator } from "../L13-facade/index.ts";

import type { KernelExpression } from "../L13-facade/index.ts";

import { ProofEngine } from "./proof.ts";

// ── Helpers ──────────────────────────────────────────────────────────────

const intType = "type://github.com/Stream44/s44-rak-gen1@1.0/integer/1.0";

function createTestEngine() {
  const kernel = MetamodelKernel.create();
  kernel.defineScalar("integer", "1.0", { type: "integer" });
  const evaluator = new ExpressionEvaluator();
  const engine = new ProofEngine(kernel, evaluator);
  return { kernel, evaluator, engine };
}

// ── Reusable expressions ─────────────────────────────────────────────────

/** $self > 0 */
const isPositiveExpr: KernelExpression = {
  op: "call",
  fn: "gt",
  args: [
    { op: "var", name: "$self" },
    { op: "const", value: 0 },
  ],
};

/** a + b == b + a */
const sumCommutativeExpr: KernelExpression = {
  op: "call",
  fn: "eq",
  args: [
    {
      op: "call",
      fn: "add",
      args: [
        { op: "var", name: "a" },
        { op: "var", name: "b" },
      ],
    },
    {
      op: "call",
      fn: "add",
      args: [
        { op: "var", name: "b" },
        { op: "var", name: "a" },
      ],
    },
  ],
};

/** $self > 10 AND $self < 20 */
const inRangeExpr: KernelExpression = {
  op: "call",
  fn: "and",
  args: [
    {
      op: "call",
      fn: "gt",
      args: [
        { op: "var", name: "$self" },
        { op: "const", value: 10 },
      ],
    },
    {
      op: "call",
      fn: "lt",
      args: [
        { op: "var", name: "$self" },
        { op: "const", value: 20 },
      ],
    },
  ],
};

/** $self > 100 */
const gt100Expr: KernelExpression = {
  op: "call",
  fn: "gt",
  args: [
    { op: "var", name: "$self" },
    { op: "const", value: 100 },
  ],
};

/** a <= b */
const sortedPairExpr: KernelExpression = {
  op: "call",
  fn: "lte",
  args: [
    { op: "var", name: "a" },
    { op: "var", name: "b" },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────

describe("ProofEngine", () => {
  let engine: ProofEngine;

  beforeEach(() => {
    ({ engine } = createTestEngine());
  });

  test("1. isPositive: valid for 42, invalid for -5", () => {
    const prop = engine.defineProposition("isPositive", isPositiveExpr, {
      $self: intType,
    });

    const valid = engine.verify(prop.id, { $self: 42 });
    expect(valid.valid).toBe(true);
    expect(valid.method).toBe("evaluation");

    const invalid = engine.verify(prop.id, { $self: -5 });
    expect(invalid.valid).toBe(false);
    expect(invalid.method).toBe("evaluation");
  });

  test("2. sumIsCommutative: a + b == b + a", () => {
    const prop = engine.defineProposition("sumIsCommutative", sumCommutativeExpr, {
      a: intType,
      b: intType,
    });

    const result = engine.verify(prop.id, { a: 3, b: 7 });
    expect(result.valid).toBe(true);
  });

  test("3. verifyForAll: all positive samples hold, negative sample fails", () => {
    const prop = engine.defineProposition("allPositive", isPositiveExpr, {
      $self: intType,
    });

    const allHold = engine.verifyForAll(prop.id, "$self", [1, 2, 3, 4, 5]);
    expect(allHold.valid).toBe(true);
    expect(allHold.method).toBe("exhaustive");

    const someFail = engine.verifyForAll(prop.id, "$self", [1, 2, -1, 4]);
    expect(someFail.valid).toBe(false);
    expect(someFail.method).toBe("exhaustive");
    expect(someFail.witness).toBe(-1);
  });

  test("4. findWitness: finds 15 in range (10, 20)", () => {
    const prop = engine.defineProposition("inRange", inRangeExpr, {
      $self: intType,
    });

    const witness = engine.findWitness(prop.id, [5, 8, 15, 25]);
    expect(witness).toBe(15);
  });

  test("5. findWitness: returns null when no candidate satisfies", () => {
    const prop = engine.defineProposition("gt100", gt100Expr, {
      $self: intType,
    });

    const witness = engine.findWitness(prop.id, [1, 2, 3]);
    expect(witness).toBeNull();
  });

  test("6. sortedPair: valid for {a:1, b:2}, invalid for {a:5, b:3}", () => {
    const prop = engine.defineProposition("sortedPair", sortedPairExpr, {
      a: intType,
      b: intType,
    });

    const valid = engine.verify(prop.id, { a: 1, b: 2 });
    expect(valid.valid).toBe(true);

    const invalid = engine.verify(prop.id, { a: 5, b: 3 });
    expect(invalid.valid).toBe(false);
  });

  test("7. resolve() returns stored proposition", () => {
    const prop = engine.defineProposition("testProp", isPositiveExpr, {
      $self: intType,
    });

    const resolved = engine.resolve(prop.id);
    expect(resolved).toBe(prop);
    expect(resolved.name).toBe("testProp");
    expect(resolved.id).toBe("prop://github.com/Stream44/s44-rak-gen1@1.0/testProp");
  });

  test("8. resolve() throws for unknown id", () => {
    expect(() => engine.resolve("prop://github.com/Stream44/s44-rak-gen1@1.0/nonexistent")).toThrow(
      "Unknown proposition: prop://github.com/Stream44/s44-rak-gen1@1.0/nonexistent",
    );
  });
});
