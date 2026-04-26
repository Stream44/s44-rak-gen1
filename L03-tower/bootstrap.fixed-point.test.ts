import { describe, expect, test } from "bun:test";
import { MetaLevel } from "../L01-foundation/types.ts";
import type { TypeDef } from "../L01-foundation/types.ts";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import { M3_META } from "./bootstrap.ts";
import { TypeRegistry } from "./registry.ts";

const META_ALIAS = "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0";

describe("Layer 4: M3 fixed point", () => {
  const encoder = new JsonEncoder();

  test("M3_META id matches the field-excluded CID", () => {
    expect(encoder.encodeAndHashWithExclusion(M3_META, ["id", "conformsTo"]).cid).toBe(M3_META.id);
  });

  test("M3_META conforms to itself", () => {
    expect(M3_META.conformsTo).toBe(M3_META.id);
  });

  test("M3_META preserves the legacy URL alias", () => {
    expect(M3_META.aliases).toContain(META_ALIAS);
  });

  test("registry resolves M3_META by CID", () => {
    expect(new TypeRegistry().resolveType(M3_META.id)).toBe(M3_META);
  });

  test("registry resolves M3_META by alias", () => {
    expect(new TypeRegistry().resolveType(META_ALIAS)).toBe(M3_META);
  });

  test("changing a non-excluded field changes the M3 CID", () => {
    const mutated: TypeDef = { ...M3_META, description: `${M3_META.description} changed` };
    expect(encoder.encodeAndHashWithExclusion(mutated, ["id", "conformsTo"]).cid).not.toBe(
      M3_META.id,
    );
  });

  test("new TypeDefs may use the URL alias as conformsTo", () => {
    const aliasChild: TypeDef = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/AliasChild/1.0",
      level: MetaLevel.Metamodel,
      conformsTo: META_ALIAS,
      schema: { type: "object", properties: {} },
    };
    expect(() => new TypeRegistry().defineType(aliasChild)).not.toThrow();
  });
});
