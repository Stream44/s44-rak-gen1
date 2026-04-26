import { describe, test, expect } from "bun:test";
import { MetamodelKernel, ExpressionEvaluator } from "../L13-facade/index.ts";
import { DependentTypeEngine } from "./dependent.ts";
import type { DependentIndex, DependentTypeGenerator } from "./dependent.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function setup() {
  const kernel = MetamodelKernel.create();
  const evaluator = new ExpressionEvaluator();
  const engine = new DependentTypeEngine(kernel, evaluator);

  // Define an integer scalar type for use as index type
  const intRef = kernel.defineScalar("integer", "1.0", { type: "integer" });

  return { kernel, evaluator, engine, intRef };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Layer 18: Dependent Types", () => {
  // ── Fixture 1: FixedLengthArray (Vec<N>) ──────────────────────────

  describe("FixedArray (Vec<N>)", () => {
    function setupFixedArray() {
      const ctx = setup();
      const { engine, intRef } = ctx;

      const indices: DependentIndex[] = [{ name: "n", type: intRef }];

      const generator: DependentTypeGenerator = (vals) => ({
        type: "array",
        items: { type: "number" },
        minItems: vals.n as number,
        maxItems: vals.n as number,
      });

      const def = engine.define("FixedArray", indices, { type: "array" }, generator);
      return { ...ctx, def };
    }

    test("1. n=3: [1,2,3] passes, [1,2] fails, [1,2,3,4] fails", () => {
      const { engine, def } = setupFixedArray();

      const ref = engine.instantiate(def.id, { n: 3 });

      const pass = engine.validate([1, 2, 3], def.id, { n: 3 });
      expect(pass.valid).toBe(true);

      const tooShort = engine.validate([1, 2], def.id, { n: 3 });
      expect(tooShort.valid).toBe(false);

      const tooLong = engine.validate([1, 2, 3, 4], def.id, { n: 3 });
      expect(tooLong.valid).toBe(false);
    });

    test("2. n=0: [] passes, [1] fails", () => {
      const { engine, def } = setupFixedArray();

      const pass = engine.validate([], def.id, { n: 0 });
      expect(pass.valid).toBe(true);

      const fail = engine.validate([1], def.id, { n: 0 });
      expect(fail.valid).toBe(false);
    });

    test("3. n=5 produces correct schema", () => {
      const { engine, kernel, def } = setupFixedArray();

      const ref = engine.instantiate(def.id, { n: 5 });
      const typeDef = kernel.resolveType(ref);

      expect(typeDef.schema.type).toBe("array");
      expect(typeDef.schema.minItems).toBe(5);
      expect(typeDef.schema.maxItems).toBe(5);
    });
  });

  // ── Fixture 2: BoundedInteger (Range<min, max>) ───────────────────

  describe("BoundedInt (Range<min, max>)", () => {
    function setupBoundedInt() {
      const ctx = setup();
      const { engine, intRef } = ctx;

      const indices: DependentIndex[] = [
        { name: "min", type: intRef },
        { name: "max", type: intRef },
      ];

      const generator: DependentTypeGenerator = (vals) => ({
        type: "integer",
        minimum: vals.min as number,
        maximum: vals.max as number,
      });

      const def = engine.define("BoundedInt", indices, { type: "integer" }, generator);
      return { ...ctx, def };
    }

    test("4. min=0, max=100: 50 passes, -1 fails, 101 fails", () => {
      const { engine, def } = setupBoundedInt();

      const pass = engine.validate(50, def.id, { min: 0, max: 100 });
      expect(pass.valid).toBe(true);

      const tooLow = engine.validate(-1, def.id, { min: 0, max: 100 });
      expect(tooLow.valid).toBe(false);

      const tooHigh = engine.validate(101, def.id, { min: 0, max: 100 });
      expect(tooHigh.valid).toBe(false);
    });

    test("5. min=-10, max=10: different constraints", () => {
      const { engine, def } = setupBoundedInt();

      const pass = engine.validate(-5, def.id, { min: -10, max: 10 });
      expect(pass.valid).toBe(true);

      const fail = engine.validate(-11, def.id, { min: -10, max: 10 });
      expect(fail.valid).toBe(false);

      const pass2 = engine.validate(10, def.id, { min: -10, max: 10 });
      expect(pass2.valid).toBe(true);

      const fail2 = engine.validate(11, def.id, { min: -10, max: 10 });
      expect(fail2.valid).toBe(false);
    });

    test("6. same indices return cached TypeRef", () => {
      const { engine, def } = setupBoundedInt();

      const ref1 = engine.instantiate(def.id, { min: 0, max: 100 });
      const ref2 = engine.instantiate(def.id, { min: 0, max: 100 });
      expect(ref1).toBe(ref2);

      // Different indices should produce a different ref
      const ref3 = engine.instantiate(def.id, { min: 0, max: 50 });
      expect(ref3).not.toBe(ref1);
    });
  });

  // ── Fixture 3: StringOfLength(maxLen) ─────────────────────────────

  describe("BoundedString (StringOfLength<maxLen>)", () => {
    function setupBoundedString() {
      const ctx = setup();
      const { engine, intRef } = ctx;

      const indices: DependentIndex[] = [{ name: "maxLen", type: intRef }];

      const generator: DependentTypeGenerator = (vals) => ({
        type: "string",
        maxLength: vals.maxLen as number,
      });

      const def = engine.define("BoundedString", indices, { type: "string" }, generator);
      return { ...ctx, def };
    }

    test("7. maxLen=5: 'hello' passes, 'toolong' fails", () => {
      const { engine, def } = setupBoundedString();

      const pass = engine.validate("hello", def.id, { maxLen: 5 });
      expect(pass.valid).toBe(true);

      const fail = engine.validate("toolong", def.id, { maxLen: 5 });
      expect(fail.valid).toBe(false);
    });

    test("8. maxLen=0: only '' passes", () => {
      const { engine, def } = setupBoundedString();

      const pass = engine.validate("", def.id, { maxLen: 0 });
      expect(pass.valid).toBe(true);

      const fail = engine.validate("a", def.id, { maxLen: 0 });
      expect(fail.valid).toBe(false);
    });
  });

  // ── Additional tests ──────────────────────────────────────────────

  test("9. resolve() returns the dependent type definition", () => {
    const { engine, intRef } = setup();

    const def = engine.define(
      "TestType",
      [{ name: "n", type: intRef }],
      { type: "integer" },
      (vals) => ({ type: "integer", minimum: vals.n as number }),
    );

    const resolved = engine.resolve(def.id);
    expect(resolved.id).toBe(def.id);
    expect(resolved.name).toBe("TestType");
    expect(resolved.indices).toHaveLength(1);
    expect(resolved.indices[0].name).toBe("n");
  });

  test("10. resolve() throws for unknown id", () => {
    const { engine } = setup();

    expect(() => engine.resolve("deptype://unknown/Nope")).toThrow("Unknown dependent type");
  });

  test("11. validate() shortcut works without manual instantiate", () => {
    const { engine, intRef } = setup();

    const def = engine.define(
      "ShortcutType",
      [{ name: "n", type: intRef }],
      { type: "array" },
      (vals) => ({
        type: "array",
        items: { type: "number" },
        minItems: vals.n as number,
        maxItems: vals.n as number,
      }),
    );

    // validate() should instantiate internally and validate
    const pass = engine.validate([1, 2], def.id, { n: 2 });
    expect(pass.valid).toBe(true);

    const fail = engine.validate([1], def.id, { n: 2 });
    expect(fail.valid).toBe(false);
  });

  test("12. instantiated types are registered in the kernel and resolvable", () => {
    const { engine, kernel, intRef } = setup();

    const def = engine.define(
      "KernelRegistered",
      [{ name: "n", type: intRef }],
      { type: "integer" },
      (vals) => ({ type: "integer", minimum: vals.n as number }),
    );

    const ref = engine.instantiate(def.id, { n: 42 });

    // Should be resolvable from the kernel directly
    const typeDef = kernel.resolveType(ref);
    expect(typeDef).toBeDefined();
    expect(typeDef.schema.type).toBe("integer");
    expect(typeDef.schema.minimum).toBe(42);

    // The kernel should be able to validate against it directly
    const result = kernel.validate(ref, 50);
    expect(result.valid).toBe(true);

    const fail = kernel.validate(ref, 10);
    expect(fail.valid).toBe(false);
  });
});
