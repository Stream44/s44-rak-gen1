import { describe, test, expect } from "bun:test";
import { MetamodelKernel, ExpressionEvaluator } from "../L13-facade/index.ts";
import type { KernelExpression } from "../L13-facade/index.ts";
import { MorphismRegistry } from "./registry.ts";

describe("Layer 12: Morphisms", () => {
  // ── Helpers ──────────────────────────────────────────────────────────

  function setup() {
    const kernel = MetamodelKernel.create();
    const evaluator = new ExpressionEvaluator();
    const registry = new MorphismRegistry(kernel, evaluator);

    const celsiusRef = kernel.defineScalar("Celsius", "1.0", { type: "number" });
    const fahrenheitRef = kernel.defineScalar("Fahrenheit", "1.0", { type: "number" });

    // celsius → fahrenheit: value * 1.8 + 32
    const c2fExpr: KernelExpression = {
      op: "call",
      fn: "add",
      args: [
        {
          op: "call",
          fn: "mul",
          args: [
            { op: "var", name: "$input" },
            { op: "const", value: 1.8 },
          ],
        },
        { op: "const", value: 32 },
      ],
    };

    // fahrenheit → celsius: (value - 32) / 1.8
    const f2cExpr: KernelExpression = {
      op: "call",
      fn: "div",
      args: [
        {
          op: "call",
          fn: "sub",
          args: [
            { op: "var", name: "$input" },
            { op: "const", value: 32 },
          ],
        },
        { op: "const", value: 1.8 },
      ],
    };

    return { kernel, evaluator, registry, celsiusRef, fahrenheitRef, c2fExpr, f2cExpr };
  }

  // ── Test 1: Basic morphism define + apply ──────────────────────────

  test("define c→f morphism and apply to 0°C→32°F and 100°C→212°F", () => {
    const { kernel, registry, celsiusRef, fahrenheitRef, c2fExpr } = setup();

    const c2f = registry.define("celsiusToFahrenheit", celsiusRef, fahrenheitRef, c2fExpr);
    expect(c2f.id).toBe("morphism://github.com/Stream44/s44-rak-gen1@1.0/celsiusToFahrenheit/1.0");
    expect(c2f.sourceType).toBe(celsiusRef);
    expect(c2f.targetType).toBe(fahrenheitRef);
    expect(c2f.cid).toMatch(/^cid:sha256:/);

    const zero = kernel.createDatum(celsiusRef, 0);
    const result0 = registry.apply(c2f.id, zero);
    expect(result0.data).toBe(32);
    expect(result0.type).toBe(fahrenheitRef);

    const hundred = kernel.createDatum(celsiusRef, 100);
    const result100 = registry.apply(c2f.id, hundred);
    expect(result100.data).toBe(212);
  });

  // ── Test 2: Isomorphic pair — roundtrip ────────────────────────────

  test("isomorphic c↔f roundtrip: 100°C → 212°F → 100°C", () => {
    const { kernel, registry, celsiusRef, fahrenheitRef, c2fExpr, f2cExpr } = setup();

    const f2c = registry.define("fahrenheitToCelsius", fahrenheitRef, celsiusRef, f2cExpr, {
      isIsomorphism: true,
    });
    const c2f = registry.define("celsiusToFahrenheit", celsiusRef, fahrenheitRef, c2fExpr, {
      isIsomorphism: true,
      inverseId: f2c.id,
    });
    // Patch f2c inverseId after c2f exists
    const f2cPatched = registry.define("fahrenheitToCelsius", fahrenheitRef, celsiusRef, f2cExpr, {
      isIsomorphism: true,
      inverseId: c2f.id,
    });

    const celsius100 = kernel.createDatum(celsiusRef, 100);
    const fahrenheit212 = registry.apply(c2f.id, celsius100);
    expect(fahrenheit212.data).toBe(212);

    const backToCelsius = registry.apply(f2cPatched.id, fahrenheit212);
    expect(backToCelsius.data).toBeCloseTo(100, 10);
  });

  // ── Test 3: Compose identity ∘ morphism = morphism ─────────────────

  test("compose: identity(Celsius) then celsiusToFahrenheit = celsiusToFahrenheit", () => {
    const { kernel, registry, celsiusRef, fahrenheitRef, c2fExpr } = setup();

    const c2f = registry.define("celsiusToFahrenheit", celsiusRef, fahrenheitRef, c2fExpr);
    const idCelsius = registry.identity(celsiusRef);

    // identity then c2f
    const composed = registry.compose(idCelsius.id, c2f.id);
    expect(composed.sourceType).toBe(celsiusRef);
    expect(composed.targetType).toBe(fahrenheitRef);

    const datum = kernel.createDatum(celsiusRef, 100);
    const result = registry.apply(composed.id, datum);
    expect(result.data).toBe(212);
  });

  // ── Test 4: Compose add1 then mul2 = 5→6→12 ──────────────────────

  test("compose: add1 (A→B) then mul2 (B→C) = 5→6→12", () => {
    const { kernel, registry } = setup();

    const typeA = kernel.defineScalar("TypeA", "1.0", { type: "number" }, { tags: ["test"] });
    const typeB = kernel.defineScalar("TypeB", "1.0", { type: "number" }, { tags: ["test"] });
    const typeC = kernel.defineScalar("TypeC", "1.0", { type: "number" }, { tags: ["test"] });

    const add1Expr: KernelExpression = {
      op: "call",
      fn: "add",
      args: [
        { op: "var", name: "$input" },
        { op: "const", value: 1 },
      ],
    };
    const mul2Expr: KernelExpression = {
      op: "call",
      fn: "mul",
      args: [
        { op: "var", name: "$input" },
        { op: "const", value: 2 },
      ],
    };

    const add1 = registry.define("add1", typeA, typeB, add1Expr);
    const mul2 = registry.define("mul2", typeB, typeC, mul2Expr);

    const composed = registry.compose(add1.id, mul2.id);
    expect(composed.sourceType).toBe(typeA);
    expect(composed.targetType).toBe(typeC);

    const datum = kernel.createDatum(typeA, 5);
    const result = registry.apply(composed.id, datum);
    expect(result.data).toBe(12);
  });

  // ── Test 5: Identity morphism ──────────────────────────────────────

  test("identity morphism returns same data", () => {
    const { kernel, registry, celsiusRef } = setup();

    const id = registry.identity(celsiusRef);
    expect(id.sourceType).toBe(celsiusRef);
    expect(id.targetType).toBe(celsiusRef);

    const datum = kernel.createDatum(celsiusRef, 42);
    const result = registry.apply(id.id, datum);
    expect(result.data).toBe(42);
  });

  // ── Test 6: Invert isomorphism ─────────────────────────────────────

  test("invert isomorphism: c→f with inverse, call invert(), apply inverse to 32→0", () => {
    const { kernel, registry, celsiusRef, fahrenheitRef, c2fExpr, f2cExpr } = setup();

    const f2c = registry.define("fahrenheitToCelsius", fahrenheitRef, celsiusRef, f2cExpr, {
      isIsomorphism: true,
    });
    const c2f = registry.define("celsiusToFahrenheit", celsiusRef, fahrenheitRef, c2fExpr, {
      isIsomorphism: true,
      inverseId: f2c.id,
    });

    const inverse = registry.invert(c2f.id);
    expect(inverse.id).toBe(f2c.id);
    expect(inverse.sourceType).toBe(fahrenheitRef);
    expect(inverse.targetType).toBe(celsiusRef);

    const datum32F = kernel.createDatum(fahrenheitRef, 32);
    const result = registry.apply(inverse.id, datum32F);
    expect(result.data).toBeCloseTo(0, 10);
  });

  // ── Test 7: invert() throws for non-isomorphism ───────────────────

  test("invert() throws for non-isomorphism", () => {
    const { registry, celsiusRef, fahrenheitRef, c2fExpr } = setup();

    const c2f = registry.define("celsiusToFahrenheit", celsiusRef, fahrenheitRef, c2fExpr);
    expect(c2f.isIsomorphism).toBe(false);

    expect(() => registry.invert(c2f.id)).toThrow("not an isomorphism");
  });

  // ── Test 8: compose() throws when types don't chain ────────────────

  test("compose() throws when target of f ≠ source of g", () => {
    const { kernel, registry, celsiusRef, fahrenheitRef, c2fExpr } = setup();

    const typeX = kernel.defineScalar("TypeX", "1.0", { type: "number" });

    const c2f = registry.define("celsiusToFahrenheit", celsiusRef, fahrenheitRef, c2fExpr);
    // Another morphism from TypeX → Celsius (not from Fahrenheit)
    const x2c = registry.define("xToCelsius", typeX, celsiusRef, { op: "var", name: "$input" });

    expect(() => registry.compose(c2f.id, x2c.id)).toThrow("does not match");
  });

  // ── Test 9: apply() validates output against target type ───────────

  test("apply() errors when morphism produces invalid output", () => {
    const { kernel, registry } = setup();

    // Target type only accepts strings
    const stringType = kernel.defineScalar("StringOnly", "1.0", { type: "string" });
    const numberType = kernel.defineScalar("NumberIn", "1.0", { type: "number" });

    // Morphism that "converts" number to number — but target expects string
    const badExpr: KernelExpression = { op: "var", name: "$input" };
    const bad = registry.define("badMorphism", numberType, stringType, badExpr);

    const datum = kernel.createDatum(numberType, 42);
    expect(() => registry.apply(bad.id, datum)).toThrow("does not conform to target type");
  });

  // ── Test 10: list() with filters ──────────────────────────────────

  test("list() with sourceType and targetType filters", () => {
    const { registry, celsiusRef, fahrenheitRef, c2fExpr, f2cExpr } = setup();

    registry.define("celsiusToFahrenheit", celsiusRef, fahrenheitRef, c2fExpr);
    registry.define("fahrenheitToCelsius", fahrenheitRef, celsiusRef, f2cExpr);
    registry.identity(celsiusRef);

    // All morphisms
    expect(registry.list().length).toBe(3);

    // Filter by sourceType = Celsius
    const fromCelsius = registry.list({ sourceType: celsiusRef });
    expect(fromCelsius.length).toBe(2); // c2f + identity_Celsius
    for (const m of fromCelsius) {
      expect(m.sourceType).toBe(celsiusRef);
    }

    // Filter by targetType = Celsius
    const toCelsius = registry.list({ targetType: celsiusRef });
    expect(toCelsius.length).toBe(2); // f2c + identity_Celsius
    for (const m of toCelsius) {
      expect(m.targetType).toBe(celsiusRef);
    }

    // Filter by both
    const celsiusToFahrenheit = registry.list({
      sourceType: celsiusRef,
      targetType: fahrenheitRef,
    });
    expect(celsiusToFahrenheit.length).toBe(1);
    expect(celsiusToFahrenheit[0].name).toBe("celsiusToFahrenheit");
  });

  test("evaluate() routes algebra impls through the evaluator", async () => {
    const { registry, celsiusRef, fahrenheitRef } = setup();

    const morphism = registry.define(
      "algebraImplPlaceholder",
      celsiusRef,
      fahrenheitRef,
      { op: "var", name: "$input" },
      {
        impl: {
          kind: "algebra",
          ast: {
            op: "call",
            fn: "add",
            args: [
              { op: "var", name: "$input" },
              { op: "const", value: 32 },
            ],
          },
        },
      },
    );

    await expect(registry.evaluate(morphism.id, 10)).resolves.toBe(42);
  });

  test("evaluate() without impl falls through to expr", async () => {
    const { registry, celsiusRef, fahrenheitRef, c2fExpr } = setup();

    const morphism = registry.define("celsiusToFahrenheit", celsiusRef, fahrenheitRef, c2fExpr);

    await expect(registry.evaluate(morphism.id, 0)).resolves.toBe(32);
  });

  test("module-backed morphism without resolver throws", async () => {
    const { registry, celsiusRef, fahrenheitRef } = setup();

    const morphism = registry.define(
      "moduleWithoutResolver",
      celsiusRef,
      fahrenheitRef,
      { op: "var", name: "$input" },
      {
        impl: { kind: "module", uri: "module://./nope.ts", export: "fn" },
      },
    );

    await expect(registry.evaluate(morphism.id, 1)).rejects.toThrow(
      /no module resolver configured/,
    );
    await expect(registry.evaluate(morphism.id, 1)).rejects.toThrow(morphism.id);
  });

  test("module-backed morphism with resolver evaluates", async () => {
    const { kernel, registry } = setup();

    const numberType = kernel.defineScalar("IncrementInput", "1.0", { type: "number" });
    const resolver = async (_uri: string, _exportName: string) => (x: unknown) => (x as number) + 1;
    registry.registerModuleResolver(resolver);

    const morphism = registry.define(
      "incrementViaModule",
      numberType,
      numberType,
      { op: "var", name: "$input" },
      {
        impl: { kind: "module", uri: "module://./inc.ts", export: "inc" },
      },
    );

    await expect(registry.evaluate(morphism.id, 5)).resolves.toBe(6);
  });

  test("evaluate() input validation failure names the morphism id", async () => {
    const { kernel, registry } = setup();

    const stringType = kernel.defineScalar("StringInput", "1.0", { type: "string" });
    const resolver = async (_uri: string, _exportName: string) => () => "x";
    registry.registerModuleResolver(resolver);

    const morphism = registry.define(
      "stringOnlyModule",
      stringType,
      stringType,
      { op: "var", name: "$input" },
      {
        impl: { kind: "module", uri: "module://./string.ts", export: "fn" },
      },
    );

    try {
      await registry.evaluate(morphism.id, 42);
      throw new Error("Expected input validation failure");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/Morphism morphism:\/\/github\.com\/Stream44\/s44-rak-gen1@1\.0\//);
      expect(message).toMatch(/input does not conform to/);
    }
  });

  test("evaluate() output validation failure names the morphism id", async () => {
    const { kernel, registry } = setup();

    const numberType = kernel.defineScalar("NumberOutputInput", "1.0", { type: "number" });
    const stringType = kernel.defineScalar("StringOutput", "1.0", { type: "string" });
    const resolver = async (_uri: string, _exportName: string) => () => 42;
    registry.registerModuleResolver(resolver);

    const morphism = registry.define(
      "badOutputModule",
      numberType,
      stringType,
      { op: "var", name: "$input" },
      {
        impl: { kind: "module", uri: "module://./bad-output.ts", export: "fn" },
      },
    );

    try {
      await registry.evaluate(morphism.id, 3);
      throw new Error("Expected output validation failure");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/Morphism morphism:\/\/github\.com\/Stream44\/s44-rak-gen1@1\.0\//);
      expect(message).toMatch(/output does not conform to/);
    }
  });

  test("module resolver caches independently per morphism id", async () => {
    const { kernel, registry } = setup();

    const numberType = kernel.defineScalar("SharedNumber", "1.0", { type: "number" });
    let calls = 0;
    const resolver = async (_uri: string, _exportName: string) => {
      calls += 1;
      return (x: unknown) => x;
    };
    registry.registerModuleResolver(resolver);

    const impl = { kind: "module", uri: "module://./same.ts", export: "fn" } as const;
    const first = registry.define(
      "cachedModuleOne",
      numberType,
      numberType,
      { op: "var", name: "$input" },
      { impl },
    );
    const second = registry.define(
      "cachedModuleTwo",
      numberType,
      numberType,
      { op: "var", name: "$input" },
      { impl },
    );

    await expect(registry.evaluate(first.id, 1)).resolves.toBe(1);
    await expect(registry.evaluate(second.id, 2)).resolves.toBe(2);
    await expect(registry.evaluate(first.id, 3)).resolves.toBe(3);
    expect(calls).toBe(2);
  });
});
