import { describe, test, expect } from "bun:test";
import {
  MetaLevel,
  SchemaValidator,
  M3_META,
  M2_RECORD,
  M2_ENUM,
  M2_UNION,
  M2_COLLECTION,
  M2_SCALAR,
  BOOTSTRAP_TYPES,
  BOOTSTRAP_INDEX,
} from "../L13-facade/index.ts";
import type { TypeDef } from "../L13-facade/index.ts";
import { STATE_MACHINE_MORPHISMS_M1 } from "../L06-process/m1.ts";

describe("Layer 4: Bootstrap", () => {
  const v = new SchemaValidator();

  test("M3 validates against itself (self-referential fixed point)", () => {
    const result = v.validate(M3_META, M3_META.schema);
    expect(result.valid).toBe(true);
  });

  test("all M2 metamodels validate against M3", () => {
    for (const m2 of [M2_RECORD, M2_ENUM, M2_UNION, M2_COLLECTION, M2_SCALAR]) {
      const result = v.validate(m2, M3_META.schema);
      expect(result.valid).toBe(true);
    }
  });

  test("M3 has level 3 and conforms to itself", () => {
    expect(M3_META.level).toBe(MetaLevel.MetaMetamodel);
    expect(M3_META.conformsTo).toBe(M3_META.id);
  });

  test("all M2s have level 2 and conform to M3", () => {
    for (const m2 of [M2_RECORD, M2_ENUM, M2_UNION, M2_COLLECTION, M2_SCALAR]) {
      expect(m2.level).toBe(MetaLevel.Metamodel);
      expect(m2.conformsTo).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0");
    }
  });

  test("BOOTSTRAP_TYPES stays in sync with the bootstrap index", () => {
    const aliasCount = BOOTSTRAP_TYPES.reduce(
      (count, typeDef) => count + (typeDef.aliases?.length ?? 0),
      0,
    );
    expect(BOOTSTRAP_INDEX.size).toBe(BOOTSTRAP_TYPES.length + aliasCount);
    expect(new Set(BOOTSTRAP_TYPES.map((typeDef) => typeDef.id)).size).toBe(BOOTSTRAP_TYPES.length);
    expect(BOOTSTRAP_INDEX.get(M3_META.id)).toBe(M3_META);
    expect(BOOTSTRAP_INDEX.get("type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0")).toBe(
      M3_META,
    );
  });

  test("BOOTSTRAP_INDEX is keyed by id", () => {
    expect(BOOTSTRAP_INDEX.get(M3_META.id)).toBe(M3_META);
    expect(BOOTSTRAP_INDEX.get("type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0")).toBe(
      M3_META,
    );
    expect(BOOTSTRAP_INDEX.get("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0")).toBe(
      M2_RECORD,
    );
  });

  test("state-machine morphism M1 is registered via bootstrap side effect", () => {
    expect(BOOTSTRAP_INDEX.get(STATE_MACHINE_MORPHISMS_M1.id)).toBe(STATE_MACHINE_MORPHISMS_M1);
  });

  test("M2_RECORD schema constrains M1 record types", () => {
    const personType: TypeDef = {
      id: "type://Person/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    };
    const result = v.validate(personType, M2_RECORD.schema);
    expect(result.valid).toBe(true);
  });

  test("M2_ENUM schema constrains M1 enum types", () => {
    const statusType: TypeDef = {
      id: "type://Status/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0",
      schema: { enum: ["active", "inactive", "suspended"] },
    };
    const result = v.validate(statusType, M2_ENUM.schema);
    expect(result.valid).toBe(true);
  });
});
