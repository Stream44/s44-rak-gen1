import { describe, test, expect, beforeEach } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { TraitEngine } from "./trait.ts";

describe("Layer 22: Traits", () => {
  let ak: AlgebraicKernel;
  let engine: TraitEngine;

  const TIMESTAMPED_SCHEMA = {
    type: "object" as const,
    properties: {
      createdAt: { type: "string" as const },
      updatedAt: { type: "string" as const },
    },
    required: ["createdAt", "updatedAt"],
  };

  const AUDITABLE_SCHEMA = {
    type: "object" as const,
    properties: {
      createdBy: { type: "string" as const },
      modifiedBy: { type: "string" as const },
    },
    required: ["createdBy", "modifiedBy"],
  };

  const PERSON_BASE = {
    type: "object" as const,
    properties: {
      name: { type: "string" as const },
      email: { type: "string" as const },
    },
    required: ["name", "email"],
  };

  beforeEach(() => {
    ak = AlgebraicKernel.create();
    engine = new TraitEngine(ak);
  });

  test("define and resolve Timestamped and Auditable traits", () => {
    const ts = engine.define("Timestamped", "1.0", TIMESTAMPED_SCHEMA);
    const au = engine.define("Auditable", "1.0", AUDITABLE_SCHEMA);

    expect(ts.id).toBe("trait://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0");
    expect(au.id).toBe("trait://github.com/Stream44/s44-rak-gen1@1.0/Auditable/1.0");

    const resolved = engine.resolve(ts.id);
    expect(resolved.name).toBe("Timestamped");
    expect(resolved.schema.properties).toHaveProperty("createdAt");

    const resolvedAu = engine.resolve(au.id);
    expect(resolvedAu.name).toBe("Auditable");
    expect(resolvedAu.schema.properties).toHaveProperty("createdBy");
  });

  test("compose base with Timestamped trait merges all fields", () => {
    engine.define("Timestamped", "1.0", TIMESTAMPED_SCHEMA);

    const merged = engine.compose(PERSON_BASE, [
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0",
    ]);

    expect(merged.type).toBe("object");
    expect(merged.properties).toHaveProperty("name");
    expect(merged.properties).toHaveProperty("email");
    expect(merged.properties).toHaveProperty("createdAt");
    expect(merged.properties).toHaveProperty("updatedAt");
    expect(merged.required).toContain("name");
    expect(merged.required).toContain("createdAt");
    expect(merged.required).toContain("updatedAt");
  });

  test("compose with Timestamped and Auditable merges all 6 fields", () => {
    engine.define("Timestamped", "1.0", TIMESTAMPED_SCHEMA);
    engine.define("Auditable", "1.0", AUDITABLE_SCHEMA);

    const merged = engine.compose(PERSON_BASE, [
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0",
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Auditable/1.0",
    ]);

    const propKeys = Object.keys(merged.properties!);
    expect(propKeys).toContain("name");
    expect(propKeys).toContain("email");
    expect(propKeys).toContain("createdAt");
    expect(propKeys).toContain("updatedAt");
    expect(propKeys).toContain("createdBy");
    expect(propKeys).toContain("modifiedBy");
    expect(propKeys).toHaveLength(6);
  });

  test("defineWithTraits registers in kernel and validates data", () => {
    engine.define("Timestamped", "1.0", TIMESTAMPED_SCHEMA);

    const typeRef = engine.defineWithTraits("Person", "1.0", PERSON_BASE, [
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0",
    ]);

    expect(ak.hasType(typeRef)).toBe(true);

    const result = ak.validate(typeRef, {
      name: "Ada",
      email: "ada@x.com",
      createdAt: "2026",
      updatedAt: "2026",
    });
    expect(result.valid).toBe(true);
  });

  test("validate composed type: valid data passes, missing required field fails", () => {
    engine.define("Timestamped", "1.0", TIMESTAMPED_SCHEMA);

    const typeRef = engine.defineWithTraits("Person", "1.0", PERSON_BASE, [
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0",
    ]);

    // Valid data
    const pass = ak.validate(typeRef, {
      name: "Ada",
      email: "ada@x.com",
      createdAt: "2026",
      updatedAt: "2026",
    });
    expect(pass.valid).toBe(true);

    // Missing createdAt (required from trait)
    const fail = ak.validate(typeRef, {
      name: "Ada",
      email: "ada@x.com",
      updatedAt: "2026",
    });
    expect(fail.valid).toBe(false);
  });

  test("trait with isAbstract: true reports abstract correctly", () => {
    const trait = engine.define(
      "BaseEntity",
      "1.0",
      {
        type: "object" as const,
        properties: { id: { type: "string" as const } },
      },
      { isAbstract: true },
    );

    expect(engine.isAbstract(trait.id)).toBe(true);
  });

  test("compose is order-independent: [A, B] same properties as [B, A]", () => {
    engine.define("Timestamped", "1.0", TIMESTAMPED_SCHEMA);
    engine.define("Auditable", "1.0", AUDITABLE_SCHEMA);

    const ab = engine.compose(PERSON_BASE, [
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0",
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Auditable/1.0",
    ]);
    const ba = engine.compose(PERSON_BASE, [
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Auditable/1.0",
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0",
    ]);

    const abKeys = Object.keys(ab.properties!).sort();
    const baKeys = Object.keys(ba.properties!).sort();
    expect(abKeys).toEqual(baKeys);

    const abRequired = [...(ab.required ?? [])].sort();
    const baRequired = [...(ba.required ?? [])].sort();
    expect(abRequired).toEqual(baRequired);
  });

  test("resolve throws for unknown trait id", () => {
    expect(() =>
      engine.resolve("trait://github.com/Stream44/s44-rak-gen1@1.0/Unknown/1.0"),
    ).toThrow("Trait not found: trait://github.com/Stream44/s44-rak-gen1@1.0/Unknown/1.0");
  });

  test("list returns all defined traits", () => {
    engine.define("Timestamped", "1.0", TIMESTAMPED_SCHEMA);
    engine.define("Auditable", "1.0", AUDITABLE_SCHEMA);

    const all = engine.list();
    expect(all).toHaveLength(2);
    const names = all.map((t) => t.name).sort();
    expect(names).toEqual(["Auditable", "Timestamped"]);
  });

  test("compose with trait that adds required fields includes them in merged required", () => {
    const taggable = {
      type: "object" as const,
      properties: {
        tags: { type: "array" as const, items: { type: "string" as const } },
      },
      required: ["tags"],
    };
    engine.define("Taggable", "1.0", taggable);

    const base = {
      type: "object" as const,
      properties: {
        title: { type: "string" as const },
      },
      required: ["title"],
    };

    const merged = engine.compose(base, [
      "trait://github.com/Stream44/s44-rak-gen1@1.0/Taggable/1.0",
    ]);

    expect(merged.required).toContain("title");
    expect(merged.required).toContain("tags");
  });
});
