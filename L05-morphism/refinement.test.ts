import { describe, test, expect } from "bun:test";
import { MetamodelKernel, ExpressionEvaluator } from "../L13-facade/index.ts";
import type { KernelExpression } from "../L13-facade/index.ts";
import { RefinementEngine } from "./refinement.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function gt(a: KernelExpression, b: KernelExpression): KernelExpression {
  return { op: "call", fn: "gt", args: [a, b] };
}

function lt(a: KernelExpression, b: KernelExpression): KernelExpression {
  return { op: "call", fn: "lt", args: [a, b] };
}

function gte(a: KernelExpression, b: KernelExpression): KernelExpression {
  return { op: "call", fn: "gte", args: [a, b] };
}

function lte(a: KernelExpression, b: KernelExpression): KernelExpression {
  return { op: "call", fn: "lte", args: [a, b] };
}

function and(a: KernelExpression, b: KernelExpression): KernelExpression {
  return { op: "call", fn: "and", args: [a, b] };
}

function eq(a: KernelExpression, b: KernelExpression): KernelExpression {
  return { op: "call", fn: "eq", args: [a, b] };
}

function mod(a: KernelExpression, b: KernelExpression): KernelExpression {
  return { op: "call", fn: "mod", args: [a, b] };
}

function length(a: KernelExpression): KernelExpression {
  return { op: "call", fn: "length", args: [a] };
}

const $self: KernelExpression = { op: "var", name: "$self" };
const c = (v: unknown): KernelExpression => ({ op: "const", value: v });
const get = (path: string): KernelExpression => ({ op: "get", path });

// ── Tests ────────────────────────────────────────────────────────────

describe("Layer 13: Refinement Types", () => {
  function setup() {
    const kernel = MetamodelKernel.create();
    const evaluator = new ExpressionEvaluator();
    const engine = new RefinementEngine(kernel, evaluator);
    return { kernel, evaluator, engine };
  }

  test("PositiveInteger: base integer, predicate $self > 0", () => {
    const { kernel, engine } = setup();

    // Define base type
    const intRef = kernel.defineScalar("integer", "1.0", { type: "integer" });

    // Define refinement: $self > 0
    const refinement = engine.define("PositiveInteger", "1.0", intRef, gt($self, c(0)));

    // 42 passes both structural and predicate
    const r1 = engine.validate(42, refinement.id);
    expect(r1.structurallyValid).toBe(true);
    expect(r1.predicateSatisfied).toBe(true);
    expect(r1.errors).toHaveLength(0);

    // -5 passes structural, fails predicate
    const r2 = engine.validate(-5, refinement.id);
    expect(r2.structurallyValid).toBe(true);
    expect(r2.predicateSatisfied).toBe(false);
    expect(r2.errors.length).toBeGreaterThan(0);

    // "hello" fails structural, predicate is null
    const r3 = engine.validate("hello", refinement.id);
    expect(r3.structurallyValid).toBe(false);
    expect(r3.predicateSatisfied).toBeNull();
    expect(r3.errors.length).toBeGreaterThan(0);
  });

  test("NonEmptyString: base string, predicate length($self) > 0", () => {
    const { kernel, engine } = setup();

    const strRef = kernel.defineScalar("string", "1.0", { type: "string" });

    const refinement = engine.define("NonEmptyString", "1.0", strRef, gt(length($self), c(0)));

    // "hello" passes
    const r1 = engine.validate("hello", refinement.id);
    expect(r1.structurallyValid).toBe(true);
    expect(r1.predicateSatisfied).toBe(true);
    expect(r1.errors).toHaveLength(0);

    // "" fails predicate
    const r2 = engine.validate("", refinement.id);
    expect(r2.structurallyValid).toBe(true);
    expect(r2.predicateSatisfied).toBe(false);
    expect(r2.errors.length).toBeGreaterThan(0);
  });

  test("ValidAge: base integer with min/max, predicate $self >= 0 AND $self <= 150", () => {
    const { kernel, engine } = setup();

    const ageRef = kernel.defineScalar("age-int", "1.0", {
      type: "integer",
      minimum: 0,
      maximum: 150,
    });

    const refinement = engine.define(
      "ValidAge",
      "1.0",
      ageRef,
      and(gte($self, c(0)), lte($self, c(150))),
    );

    // 25 passes both
    const r1 = engine.validate(25, refinement.id);
    expect(r1.structurallyValid).toBe(true);
    expect(r1.predicateSatisfied).toBe(true);

    // 200 fails structural (maximum: 150) so predicate is null
    const r2 = engine.validate(200, refinement.id);
    expect(r2.structurallyValid).toBe(false);
    expect(r2.predicateSatisfied).toBeNull();

    // -1 fails structural (minimum: 0) so predicate is null
    const r3 = engine.validate(-1, refinement.id);
    expect(r3.structurallyValid).toBe(false);
    expect(r3.predicateSatisfied).toBeNull();
  });

  test("DateRange: base record with start/end, predicate start < end", () => {
    const { kernel, engine } = setup();

    const rangeRef = kernel.defineRecord("DateRange", "1.0", (b) => {
      b.integer("start", { required: true });
      b.integer("end", { required: true });
    });

    // Predicate: start < end (using get to read from $self)
    const refinement = engine.define(
      "ValidDateRange",
      "1.0",
      rangeRef,
      lt(get("start"), get("end")),
    );

    // Valid: { start: 10, end: 20 }
    const r1 = engine.validate({ start: 10, end: 20 }, refinement.id);
    expect(r1.structurallyValid).toBe(true);
    expect(r1.predicateSatisfied).toBe(true);
    expect(r1.errors).toHaveLength(0);

    // Invalid: { start: 30, end: 10 }
    const r2 = engine.validate({ start: 30, end: 10 }, refinement.id);
    expect(r2.structurallyValid).toBe(true);
    expect(r2.predicateSatisfied).toBe(false);
    expect(r2.errors.length).toBeGreaterThan(0);
  });

  test("EvenNumber: base integer, predicate $self % 2 == 0", () => {
    const { kernel, engine } = setup();

    const intRef = kernel.defineScalar("even-int", "1.0", { type: "integer" });

    const refinement = engine.define("EvenNumber", "1.0", intRef, eq(mod($self, c(2)), c(0)));

    // 4 passes
    const r1 = engine.validate(4, refinement.id);
    expect(r1.structurallyValid).toBe(true);
    expect(r1.predicateSatisfied).toBe(true);

    // 3 fails predicate
    const r2 = engine.validate(3, refinement.id);
    expect(r2.structurallyValid).toBe(true);
    expect(r2.predicateSatisfied).toBe(false);
  });

  test("resolve() returns the refinement definition", () => {
    const { kernel, engine } = setup();

    const intRef = kernel.defineScalar("resolve-int", "1.0", {
      type: "integer",
    });

    const refinement = engine.define("ResolveTest", "1.0", intRef, gt($self, c(0)));

    const resolved = engine.resolve(refinement.id);
    expect(resolved).toBeDefined();
    expect(resolved!.id).toBe(refinement.id);
    expect(resolved!.name).toBe("ResolveTest");
    expect(resolved!.refines).toBe(intRef);
    expect(resolved!.predicate).toEqual(gt($self, c(0)));
  });

  test("validate() with unknown refinement id throws", () => {
    const { engine } = setup();

    expect(() => {
      engine.validate(42, "type://github.com/Stream44/s44-rak-gen1@1.0/Nonexistent/1.0");
    }).toThrow("Unknown refinement");
  });
});
