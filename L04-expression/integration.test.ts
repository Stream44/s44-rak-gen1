import { describe, test, expect } from "bun:test";
import {
  BOOTSTRAP_TYPES,
  M3_META,
  MetaLevel,
  Compatibility,
  MetamodelKernel,
  ExpressionEvaluator,
} from "../L13-facade/index.ts";
import type { KernelExpression } from "../L13-facade/index.ts";

describe("Integration: End-to-End", () => {
  test("complete domain model with interconnected types", () => {
    const kernel = MetamodelKernel.create();

    kernel.defineRecord("Address", "1.0", (t) => {
      t.string("street", { required: true });
      t.string("city", { required: true });
      t.string("zip", { required: true, pattern: "^[0-9]{5}$" });
      t.string("country", { default: "US" });
    });

    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true, minLength: 1, maxLength: 256 });
      t.integer("born", { required: true, minimum: -4000, maximum: 2200 });
      t.array("tags", { type: "string" });
      t.typeRef("address", "type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0");
    });

    kernel.defineEnum("OrderStatus", "1.0", [
      "pending",
      "paid",
      "shipped",
      "delivered",
      "cancelled",
    ]);

    kernel.defineRecord("Order", "1.0", (t) => {
      t.string("id", { required: true });
      t.typeRef("customer", "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", {
        required: true,
      });
      t.enum("status", ["pending", "paid", "shipped", "delivered", "cancelled"], {
        required: true,
      });
      t.number("total", { required: true, minimum: 0 });
    });

    // Validate data
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", {
        name: "Ada Lovelace",
        born: 1815,
        tags: ["mathematics", "programming"],
      }).valid,
    ).toBe(true);
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0", {
        street: "123 Main St",
        city: "London",
        zip: "12345",
      }).valid,
    ).toBe(true);
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Order/1.0", {
        id: "order-001",
        customer: "cid:sha256:abc123",
        status: "pending",
        total: 99.99,
      }).valid,
    ).toBe(true);

    // Create content-addressed datums
    const personDatum = kernel.createDatum(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      { name: "Ada Lovelace", born: 1815, tags: ["mathematics", "programming"] },
    );
    expect(personDatum.id.startsWith("cid:sha256:")).toBe(true);
    const addressDatum = kernel.createDatum(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Address/1.0",
      { street: "123 Main St", city: "London", zip: "12345" },
    );
    expect(addressDatum.id.startsWith("cid:sha256:")).toBe(true);

    // Verify the tower
    const chain = kernel.getConformanceChain(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
    );
    expect(chain.map((t) => t.id)).toEqual([
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      M3_META.id,
    ]);

    // Graph queries
    expect(
      kernel.dependenciesOf("type://github.com/Stream44/s44-rak-gen1@1.0/Order/1.0"),
    ).toContain("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    expect(kernel.impactOf("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0")).toContain(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Order/1.0",
    );

    // Type counts
    expect(kernel.listTypes(MetaLevel.Model).length).toBe(
      BOOTSTRAP_TYPES.filter((typeDef) => typeDef.level === MetaLevel.Model).length + 4,
    );
    expect(kernel.listTypes(MetaLevel.Metamodel).length).toBe(
      BOOTSTRAP_TYPES.filter((typeDef) => typeDef.level === MetaLevel.Metamodel).length,
    );
    expect(kernel.listTypes(MetaLevel.MetaMetamodel).length).toBe(1);
  });

  test("schema evolution with compatibility checking", () => {
    const kernel = MetamodelKernel.create();
    kernel.defineRecord("Person", "1.0", (t) => {
      t.string("name", { required: true });
      t.integer("age");
    });
    kernel.defineRecord("Person", "2.0", (t) => {
      t.string("name", { required: true });
      t.integer("age");
      t.string("email");
    });

    const backwardResult = kernel.checkCompatibility(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/2.0",
      Compatibility.Backward,
    );
    expect(backwardResult.compatible).toBe(true);

    // V1 data should validate against V2
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/Person/2.0", { name: "Ada" })
        .valid,
    ).toBe(true);
  });

  test("expression evaluator as refinement predicate", () => {
    const kernel = MetamodelKernel.create();
    const evaluator = new ExpressionEvaluator();

    kernel.defineRecord("DateRange", "1.0", (t) => {
      t.integer("start", { required: true });
      t.integer("end", { required: true });
    });

    const refinement: KernelExpression = {
      op: "call",
      fn: "gt",
      args: [
        { op: "get", path: "end" },
        { op: "get", path: "start" },
      ],
    };
    const data = { start: 100, end: 200 };

    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/DateRange/1.0", data).valid,
    ).toBe(true);
    expect(evaluator.evaluate(refinement, { $self: data }).value).toBe(true);
    expect(evaluator.evaluate(refinement, { $self: { start: 300, end: 100 } }).value).toBe(false);
  });

  test("custom M2 metamodel", () => {
    const kernel = MetamodelKernel.create();

    kernel.defineMetamodel("event", "1.0", {
      type: "object",
      required: ["id", "level", "conformsTo", "schema"],
      properties: {
        id: { type: "string", minLength: 1 },
        level: { type: "integer", const: 1 },
        conformsTo: {
          type: "string",
          const: "type://github.com/Stream44/s44-rak-gen1@1.0/event/1.0",
        },
        schema: {
          type: "object",
          required: ["type", "properties"],
          properties: {
            type: { type: "string", const: "object" },
            properties: { type: "object" },
            required: { type: "array" },
          },
        },
        name: { type: "string" },
        version: { type: "string" },
      },
    });

    kernel.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/UserCreated/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/event/1.0",
      name: "UserCreated",
      version: "1.0",
      schema: {
        type: "object",
        required: ["userId", "timestamp"],
        properties: { userId: { type: "string" }, timestamp: { type: "integer" } },
      },
    });

    expect(kernel.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/UserCreated/1.0")).toBe(
      true,
    );
    expect(
      kernel.validate("type://github.com/Stream44/s44-rak-gen1@1.0/UserCreated/1.0", {
        userId: "user-123",
        timestamp: 1713000000,
      }).valid,
    ).toBe(true);
  });
});
