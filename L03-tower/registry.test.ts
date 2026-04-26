import { describe, test, expect } from "bun:test";
import {
  BOOTSTRAP_TYPES,
  M3_META,
  MetaLevel,
  TypeNotFoundError,
  TypeLevelError,
  DatumValidationError,
  BatchDefinitionError,
  isContentId,
  TypeRegistry,
} from "../L13-facade/index.ts";
import type { TypeDef } from "../L13-facade/index.ts";
import { ALGEBRA_OPERATOR_METAMODEL } from "../L02-metamodels/algebra-operator.ts";
import { MORPHISM_DOCUMENT_M2 } from "../L02-metamodels/morphism-document.ts";

describe("Layer 7: TypeRegistry", () => {
  test("bootstraps with M3 + M2s", () => {
    const registry = new TypeRegistry();
    expect(registry.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0")).toBe(true);
    expect(registry.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0")).toBe(true);
    expect(registry.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0")).toBe(true);
    expect(registry.typeCount()).toBe(BOOTSTRAP_TYPES.length);
  });

  test("defineType registers an M1 type", () => {
    const registry = new TypeRegistry();
    const personDef: TypeDef = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          age: { type: "integer", minimum: 0 },
        },
        required: ["name"],
      },
      name: "Person",
      version: "1.0",
    };
    const cid = registry.defineType(personDef);
    expect(isContentId(cid)).toBe(true);
    expect(registry.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0")).toBe(true);
    expect(
      registry.resolveType("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0").name,
    ).toBe("Person");
  });

  test("defineType rejects invalid conformsTo", () => {
    const registry = new TypeRegistry();
    const bad: TypeDef = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Bad/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/nonexistent/1.0",
      schema: { type: "object", properties: {} },
    };
    expect(() => registry.defineType(bad)).toThrow(TypeNotFoundError);
  });

  test("defineType rejects wrong level", () => {
    const registry = new TypeRegistry();
    const bad: TypeDef = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Bad/1.0",
      level: MetaLevel.Metamodel,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: {} },
    };
    expect(() => registry.defineType(bad)).toThrow(TypeLevelError);
  });

  test("resolveType throws for missing type", () => {
    const registry = new TypeRegistry();
    expect(() =>
      registry.resolveType("type://github.com/Stream44/s44-rak-gen1@1.0/Missing/1.0"),
    ).toThrow(TypeNotFoundError);
  });

  test("tryResolveType returns undefined for missing", () => {
    const registry = new TypeRegistry();
    expect(
      registry.tryResolveType("type://github.com/Stream44/s44-rak-gen1@1.0/Missing/1.0"),
    ).toBeUndefined();
  });

  test("validateData checks against type schema", () => {
    const registry = new TypeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    });
    expect(
      registry.validateData(
        { name: "Ada" },
        "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      ).valid,
    ).toBe(true);
    expect(
      registry.validateData({}, "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0").valid,
    ).toBe(false);
  });

  test("createDatum validates and returns Datum with CID", () => {
    const registry = new TypeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    });
    const datum = registry.createDatum(
      { name: "Ada" },
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
    );
    expect(datum.id.startsWith("cid:sha256:")).toBe(true);
    expect(datum.type).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    expect(datum.data).toEqual({ name: "Ada" });
  });

  test("createDatum throws on invalid data", () => {
    const registry = new TypeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    });
    expect(() =>
      registry.createDatum({}, "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0"),
    ).toThrow(DatumValidationError);
  });

  test("defineTypes batch atomic — all succeed", () => {
    const registry = new TypeRegistry();
    const types: TypeDef[] = [
      {
        id: "type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0",
        level: MetaLevel.Model,
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        schema: { type: "object", properties: { street: { type: "string" } } },
      },
      {
        id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
        level: MetaLevel.Model,
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            address: {
              type: "string",
              $typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0",
            },
          },
        },
      },
    ];
    const results = registry.defineTypes(types);
    expect(results.size).toBe(2);
    expect(registry.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0")).toBe(true);
    expect(registry.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0")).toBe(true);
  });

  test("defineTypes batch atomic — failure rolls back all", () => {
    const registry = new TypeRegistry();
    const types: TypeDef[] = [
      {
        id: "type://github.com/Stream44/s44-rak-gen1@1.0/Good/1.0",
        level: MetaLevel.Model,
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        schema: { type: "object", properties: {} },
      },
      {
        id: "type://github.com/Stream44/s44-rak-gen1@1.0/Bad/1.0",
        level: MetaLevel.Metamodel,
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        schema: { type: "object", properties: {} },
      },
    ];
    expect(() => registry.defineTypes(types)).toThrow(BatchDefinitionError);
    expect(registry.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/Good/1.0")).toBe(false);
  });

  test("conformsTo checks transitive chain", () => {
    const registry = new TypeRegistry();
    expect(
      registry.conformsTo(
        "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
      ),
    ).toBe(true);
  });

  test("getConformanceChain returns full chain", () => {
    const registry = new TypeRegistry();
    const chain = registry.getConformanceChain(
      "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    );
    expect(chain.length).toBe(2);
    expect(chain[0].id).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0");
    expect(chain[1].id).toBe(M3_META.id);
  });

  test("listTypes and findTypes", () => {
    const registry = new TypeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      name: "Person",
      schema: { type: "object", properties: {} },
    });
    expect(registry.listTypes(MetaLevel.Metamodel).length).toBe(
      BOOTSTRAP_TYPES.filter((typeDef) => typeDef.level === MetaLevel.Metamodel).length,
    );
    const found = registry.findTypes("Person");
    expect(found.length).toBe(1);
    expect(found[0].name).toBe("Person");
  });

  test("listMorphisms returns bootstrapped morphism documents", () => {
    const registry = new TypeRegistry();
    expect(registry.listMorphisms().length).toBeGreaterThanOrEqual(1);
  });

  test("listMorphisms entries conform to the morphism document metamodel", () => {
    const registry = new TypeRegistry();
    expect(
      registry.listMorphisms().every((typeDef) => typeDef.conformsTo === MORPHISM_DOCUMENT_M2.id),
    ).toBe(true);
  });

  test("listMorphisms entries are all model-level types", () => {
    const registry = new TypeRegistry();
    expect(registry.listMorphisms().every((typeDef) => typeDef.level === MetaLevel.Model)).toBe(
      true,
    );
  });

  test("listByConformsTo matches listAlgebraOperators for the algebra operator metamodel", () => {
    const registry = new TypeRegistry();
    const byConformsTo = registry.listByConformsTo(ALGEBRA_OPERATOR_METAMODEL.id);
    const operators = registry.listAlgebraOperators();
    expect(byConformsTo).toHaveLength(operators.length);
    expect(byConformsTo.map((typeDef) => typeDef.id)).toEqual(
      operators.map((typeDef) => typeDef.id),
    );
  });

  test("listByConformsTo returns an empty array for an unknown metamodel CID", () => {
    const registry = new TypeRegistry();
    expect(registry.listByConformsTo("nonexistent-cid")).toEqual([]);
  });

  test("listByConformsTo returns every direct child of the M3 CID", () => {
    const registry = new TypeRegistry();
    const metamodels = registry.listTypes().filter((typeDef) => typeDef.conformsTo === M3_META.id);
    const byConformsTo = registry.listByConformsTo(M3_META.id);
    expect(byConformsTo).toHaveLength(metamodels.length);
    expect(byConformsTo.map((typeDef) => typeDef.id)).toEqual(
      metamodels.map((typeDef) => typeDef.id),
    );
  });

  test("listByMetalevel aliases listTypes for model-level types", () => {
    const registry = new TypeRegistry();
    const models = registry.listTypes(MetaLevel.Model);
    const byMetalevel = registry.listByMetalevel(MetaLevel.Model);
    expect(byMetalevel).toHaveLength(models.length);
    expect(byMetalevel.map((typeDef) => typeDef.id)).toEqual(models.map((typeDef) => typeDef.id));
  });

  test("listByMetalevel aliases listTypes for metamodel-level types", () => {
    const registry = new TypeRegistry();
    const metamodels = registry.listTypes(MetaLevel.Metamodel);
    const byMetalevel = registry.listByMetalevel(MetaLevel.Metamodel);
    expect(byMetalevel).toHaveLength(metamodels.length);
    expect(byMetalevel.map((typeDef) => typeDef.id)).toEqual(
      metamodels.map((typeDef) => typeDef.id),
    );
  });

  test("events are emitted on type definition", () => {
    const registry = new TypeRegistry();
    const events: any[] = [];
    registry.on((e) => events.push(e));
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Test/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: {} },
    });
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe("type:defined");
  });

  test("computeJoin returns common properties", () => {
    const registry = new TypeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/A/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        required: ["name", "age"],
        properties: {
          name: { type: "string" },
          age: { type: "integer", minimum: 0, maximum: 150 },
        },
      },
    });
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/B/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        required: ["name", "email"],
        properties: { name: { type: "string" }, email: { type: "string" } },
      },
    });
    const join = registry.computeJoin(
      "type://github.com/Stream44/s44-rak-gen1@1.0/A/1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/B/1.0",
    );
    expect(join.properties).toHaveProperty("name");
    expect(join.properties).not.toHaveProperty("age");
    expect(join.properties).not.toHaveProperty("email");
    expect(join.required).toEqual(["name"]);
  });

  test("computeMeet returns all properties", () => {
    const registry = new TypeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/A/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, age: { type: "integer" } },
      },
    });
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/B/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        required: ["email"],
        properties: { name: { type: "string" }, email: { type: "string" } },
      },
    });
    const meet = registry.computeMeet(
      "type://github.com/Stream44/s44-rak-gen1@1.0/A/1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/B/1.0",
    );
    expect(meet.properties).toHaveProperty("name");
    expect(meet.properties).toHaveProperty("age");
    expect(meet.properties).toHaveProperty("email");
    expect(meet.required).toContain("name");
    expect(meet.required).toContain("email");
  });
});
