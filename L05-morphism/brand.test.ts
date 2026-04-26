import { describe, test, expect } from "bun:test";
import { MetamodelKernel } from "../L13-facade/index.ts";
import { BrandingEngine } from "./brand.ts";

describe("Layer 14: Branded Types", () => {
  const OBJECT_BASE_SCHEMA = {
    type: "object" as const,
    required: ["value"],
    properties: { value: { type: "number" as const } },
  };

  function setup() {
    const kernel = MetamodelKernel.create();
    const engine = new BrandingEngine(kernel);
    return { kernel, engine };
  }

  test("structurally identical types with different brands are not the same brand", () => {
    const { kernel, engine } = setup();

    const measureBase = kernel.defineRecord("Measure", "1.0", (t) => {
      t.number("value", { required: true });
    });

    const temperature = engine.define("Temperature", "1.0", measureBase, "temperature");
    const speed = engine.define("Speed", "1.0", measureBase, "speed");

    // Both validate the same structural data
    expect(engine.validate({ value: 100 }, temperature.id).valid).toBe(true);
    expect(engine.validate({ value: 100 }, speed.id).valid).toBe(true);

    // But they are not the same brand
    expect(engine.areSameBrand(temperature.id, speed.id)).toBe(false);
  });

  test("currency brands: USD vs EUR are distinct, USD matches itself", () => {
    const { kernel, engine } = setup();

    const currencyBase = kernel.defineScalar("CurrencyAmount", "1.0", { type: "number" });

    const usd = engine.define("USD", "1.0", currencyBase, "usd");
    const eur = engine.define("EUR", "1.0", currencyBase, "eur");

    // Both validate the same numeric data
    expect(engine.validate(42.5, usd.id).valid).toBe(true);
    expect(engine.validate(42.5, eur.id).valid).toBe(true);

    // Different brands
    expect(engine.areSameBrand(usd.id, eur.id)).toBe(false);

    // Same brand matches itself
    expect(engine.areSameBrand(usd.id, usd.id)).toBe(true);
  });

  test("Meters and Feet have distinct brands", () => {
    const { kernel, engine } = setup();

    const distanceBase = kernel.defineScalar("Distance", "1.0", { type: "number", minimum: 0 });

    const meters = engine.define("Meters", "1.0", distanceBase, "meters");
    const feet = engine.define("Feet", "1.0", distanceBase, "feet");

    expect(engine.areSameBrand(meters.id, feet.id)).toBe(false);
    expect(engine.getBrand(meters.id)).toBe("meters");
    expect(engine.getBrand(feet.id)).toBe("feet");
  });

  test("getBrand returns the brand string", () => {
    const { kernel, engine } = setup();

    const base = kernel.defineScalar("Weight", "1.0", { type: "number" });
    const kg = engine.define("Kilograms", "1.0", base, "kilograms");

    expect(engine.getBrand(kg.id)).toBe("kilograms");
  });

  test("getBrand returns null for non-branded type ref", () => {
    const { kernel, engine } = setup();

    kernel.defineScalar("PlainNumber", "1.0", { type: "number" });

    expect(
      engine.getBrand("type://github.com/Stream44/s44-rak-gen1@1.0/PlainNumber/1.0"),
    ).toBeNull();
  });

  test("validate rejects structurally invalid data", () => {
    const { kernel, engine } = setup();

    const base = kernel.defineRecord("Measurement", "1.0", (t) => {
      t.number("value", { required: true });
      t.string("unit", { required: true });
    });

    const branded = engine.define("Pressure", "1.0", base, "pressure");

    // Missing required field "unit"
    const result = engine.validate({ value: 101.3 }, branded.id);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("resolve returns the branded type definition", () => {
    const { kernel, engine } = setup();

    const base = kernel.defineScalar("Voltage", "1.0", { type: "number" });
    const volts = engine.define("Volts", "1.0", base, "volts");

    const resolved = engine.resolve(volts.id);
    expect(resolved.id).toBe(volts.id);
    expect(resolved.brand).toBe("volts");
    expect(resolved.baseType).toBe(base);
    expect(resolved.name).toBe("Volts");
    expect(resolved.version).toBe("1.0");
  });

  test("resolve throws for unknown id", () => {
    const { engine } = setup();

    expect(() => engine.resolve("type://github.com/Stream44/s44-rak-gen1@1.0/Unknown/1.0")).toThrow(
      "Branded type not found: type://github.com/Stream44/s44-rak-gen1@1.0/Unknown/1.0",
    );
  });
});
