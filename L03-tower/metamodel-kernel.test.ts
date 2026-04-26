import { describe, test, expect } from "bun:test";
import {
  BOOTSTRAP_TYPES,
  M3_META,
  MetaLevel,
  Compatibility,
  RecordSchemaBuilder,
  MetamodelKernel,
} from "../L13-facade/index.ts";
import type { JsonSchema } from "../L13-facade/index.ts";

describe("Layer 9: RecordSchemaBuilder", () => {
  test("builds basic record schema", () => {
    const builder = new RecordSchemaBuilder();
    builder
      .string("name", { required: true, minLength: 1 })
      .integer("age", { minimum: 0 })
      .boolean("active", { default: true });
    const schema = builder.build();
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["name"]);
    expect(schema.properties!.name).toEqual({ type: "string", minLength: 1 });
    expect(schema.properties!.age).toEqual({ type: "integer", minimum: 0 });
  });

  test("builds nested objects", () => {
    const builder = new RecordSchemaBuilder();
    builder.object(
      "address",
      (a) => {
        a.string("street", { required: true });
        a.string("city", { required: true });
      },
      { required: true },
    );
    const schema = builder.build();
    const addressSchema = schema.properties!.address as JsonSchema;
    expect(addressSchema.type).toBe("object");
    expect(addressSchema.required).toEqual(["street", "city"]);
  });

  test("builds typeRef properties", () => {
    const builder = new RecordSchemaBuilder();
    builder.typeRef("author", "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", {
      required: true,
    });
    const schema = builder.build();
    expect(schema.properties!.author).toEqual({
      type: "string",
      $typeRef: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
    });
  });

  test("builds enum properties", () => {
    const builder = new RecordSchemaBuilder();
    builder.enum("status", ["active", "inactive"], { required: true });
    const schema = builder.build();
    expect(schema.properties!.status).toEqual({ enum: ["active", "inactive"] });
  });

  test("additionalProperties setting", () => {
    const builder = new RecordSchemaBuilder();
    builder.string("name").additionalProperties(false);
    const schema = builder.build();
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("Layer 9: MetamodelKernel", () => {
  test("create returns functional kernel", () => {
    const kernel = MetamodelKernel.create();
    expect(kernel.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0")).toBe(true);
    expect(kernel.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0")).toBe(true);
  });

  test("defineRecord creates M1 type", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true, minLength: 1 });
      t.integer("age", { minimum: 0, maximum: 150 });
    });
    expect(kernel.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0")).toBe(true);
    const td = kernel.resolveType("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    expect(td.level).toBe(MetaLevel.Model);
    expect(td.conformsTo).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0");
  });

  test("defineEnum creates M1 enum type", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineEnum("Status", "1.0", ["active", "inactive", "suspended"]);
    expect(kernel.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/Status/1.0")).toBe(true);
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Status/1.0", "active").valid,
    ).toBe(true);
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Status/1.0", "unknown").valid,
    ).toBe(false);
  });

  test("defineCollection creates M1 collection type", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineCollection("Tags", "1.0", { type: "string" }, { minItems: 1, uniqueItems: true });
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Tags/1.0", ["a", "b"]).valid,
    ).toBe(true);
    expect(kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Tags/1.0", []).valid).toBe(
      false,
    );
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Tags/1.0", ["a", "a"]).valid,
    ).toBe(false);
  });

  test("defineScalar creates M1 scalar type", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineScalar("Age", "1.0", { type: "integer", minimum: 0, maximum: 150 });
    expect(kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Age/1.0", 25).valid).toBe(
      true,
    );
    expect(kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Age/1.0", -1).valid).toBe(
      false,
    );
    expect(kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Age/1.0", 200).valid).toBe(
      false,
    );
  });

  test("validate and createDatum end-to-end", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true, minLength: 1, maxLength: 256 });
      t.integer("born", { required: true, minimum: -4000, maximum: 2200 });
      t.array("tags", { type: "string" });
    });
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", {
        name: "Ada Lovelace",
        born: 1815,
        tags: ["mathematics"],
      }).valid,
    ).toBe(true);
    const datum = kernel.createDatum("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", {
      name: "Ada Lovelace",
      born: 1815,
      tags: ["mathematics"],
    });
    expect(datum.id.startsWith("cid:sha256:")).toBe(true);
    expect(datum.type).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
  });

  test("validate rejects invalid data", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
    });
    const result = kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", {
      name: 42,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].keyword).toBe("type");
  });

  test("defineExtension extends a base type", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
    });
    kernel.defineExtension(
      "Employee",
      "1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      (t) => {
        t.string("department", { required: true });
      },
    );
    expect(kernel.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/Employee/1.0")).toBe(true);
  });

  test("definePartial creates all-optional version", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
      t.integer("age");
    });
    kernel.definePartial(
      "PersonPatch",
      "1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
    );
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/PersonPatch/1.0", {}).valid,
    ).toBe(true);
  });

  test("definePick creates subset", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
      t.integer("age");
      t.string("email");
    });
    kernel.definePick(
      "PersonSummary",
      "1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      ["name", "email"],
    );
    const td = kernel.resolveType("type://github.com/Stream44/s44-rak-gen1@1.0/PersonSummary/1.0");
    expect(Object.keys(td.schema.properties!)).toEqual(["name", "email"]);
  });

  test("conformsTo chain", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
    });
    expect(
      kernel.conformsTo(
        "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
        "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      ),
    ).toBe(true);
    expect(
      kernel.conformsTo(
        "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
      ),
    ).toBe(true);
  });

  test("getConformanceChain from M1 to M3", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
    });
    const chain = kernel.getConformanceChain(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
    );
    expect(chain.length).toBe(3);
    expect(chain[0].id).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    expect(chain[1].id).toBe("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0");
    expect(chain[2].id).toBe(M3_META.id);
  });

  test("impactOf and dependenciesOf", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Address", "1.0", (t) => {
      t.string("street", { required: true });
    });
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
      t.typeRef("address", "type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0");
    });
    expect(
      kernel.dependenciesOf("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0"),
    ).toContain("type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0");
    expect(kernel.impactOf("type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0")).toContain(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
    );
  });

  test("checkCompatibility", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
    });
    kernel.defineRecord("Person", "2.0", (t) => {
      t.string("name", { required: true });
      t.string("email");
    });
    const result = kernel.checkCompatibility(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/2.0",
      Compatibility.Backward,
    );
    expect(result.compatible).toBe(true);
  });

  test("exportTower and importTower roundtrip", () => {
    const kernel1 = MetamodelKernel.create();
    kernel1.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
    });
    const exported = kernel1.exportTower();
    expect(exported.types.length).toBeGreaterThan(6);
    const kernel2 = MetamodelKernel.create();
    kernel2.importTower(exported);
    expect(kernel2.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0")).toBe(true);
  });

  test("listTypes filters by level", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name");
    });
    kernel.defineEnum("Status", "1.0", ["a", "b"]);
    expect(kernel.listTypes(MetaLevel.Model).length).toBe(
      BOOTSTRAP_TYPES.filter((typeDef) => typeDef.level === MetaLevel.Model).length + 2,
    );
    expect(kernel.listTypes(MetaLevel.Metamodel).length).toBe(
      BOOTSTRAP_TYPES.filter((typeDef) => typeDef.level === MetaLevel.Metamodel).length,
    );
  });

  test("findTypes searches by name", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name");
    });
    kernel.defineRecord("PersonAddress", "1.0", (t) => {
      t.string("street");
    });
    expect(kernel.findTypes("person").length).toBe(2);
  });

  test("typesConformingTo finds all matching M1s", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("A", "1.0", (t) => t.string("x"));
    kernel.defineRecord("B", "1.0", (t) => t.string("y"));
    kernel.defineEnum("C", "1.0", ["a", "b"]);
    expect(
      kernel.typesConformingTo("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0").length,
    ).toBe(2);
    expect(
      kernel.typesConformingTo("type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0").length,
    ).toBe(1);
  });
});
