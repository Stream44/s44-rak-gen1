import { describe, test, expect } from "bun:test";
import {
  MetaLevel,
  SchemaValidator,
  ConformanceEngine,
  M3_META,
  M2_RECORD,
  BOOTSTRAP_INDEX,
} from "../L13-facade/index.ts";
import type { TypeDef } from "../L13-facade/index.ts";

describe("Layer 5: ConformanceEngine", () => {
  const v = new SchemaValidator();
  const engine = new ConformanceEngine(v);

  test("M3 self-reference passes level check", () => {
    expect(engine.checkLevel(M3_META, M3_META)).toBeNull();
  });

  test("M2 → M3 passes level check", () => {
    expect(engine.checkLevel(M2_RECORD, M3_META)).toBeNull();
  });

  test("M1 → M2 passes level check", () => {
    const m1: TypeDef = {
      id: "type://Test/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: {} },
    };
    expect(engine.checkLevel(m1, M2_RECORD)).toBeNull();
  });

  test("invalid level fails", () => {
    const m1: TypeDef = {
      id: "type://Test/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
      schema: { type: "object", properties: {} },
    };
    expect(engine.checkLevel(m1, M3_META)).not.toBeNull();
  });

  test("checkDirect validates against parent schema", () => {
    const m1: TypeDef = {
      id: "type://Person/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: { name: { type: "string" } } },
    };
    const result = engine.checkDirect(m1, M2_RECORD);
    expect(result.valid).toBe(true);
  });

  test("walkChain from M2 to M3", () => {
    const chain = engine.walkChain(M2_RECORD, (ref) => BOOTSTRAP_INDEX.get(ref)!);
    expect(chain.length).toBe(2);
    expect(chain[0].id).toBe(M2_RECORD.id);
    expect(chain[1].id).toBe(M3_META.id);
  });

  test("walkChain from M3 (single element)", () => {
    const chain = engine.walkChain(M3_META, (ref) => BOOTSTRAP_INDEX.get(ref)!);
    expect(chain.length).toBe(1);
    expect(chain[0].id).toBe(M3_META.id);
  });
});
