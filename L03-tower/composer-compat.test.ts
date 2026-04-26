import { describe, test, expect } from "bun:test";
import {
  MetaLevel,
  TypeRegistry,
  SchemaComposer,
  CompatibilityChecker,
} from "../L13-facade/index.ts";
import type { TypeDef } from "../L13-facade/index.ts";

describe("Layer 8: SchemaComposer", () => {
  function makeRegistry() {
    const registry = new TypeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1 },
          age: { type: "integer", minimum: 0 },
          email: { type: "string" },
        },
      },
    });
    return registry;
  }

  test("extend adds properties", () => {
    const registry = makeRegistry();
    const composer = new SchemaComposer((ref) => registry.resolveType(ref));
    const schema = composer.extend("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", {
      type: "object",
      properties: { department: { type: "string" } },
      required: ["department"],
    });
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("name");
    expect(schema.properties).toHaveProperty("department");
    expect(schema.required).toContain("name");
    expect(schema.required).toContain("department");
  });

  test("pick selects fields", () => {
    const registry = makeRegistry();
    const composer = new SchemaComposer((ref) => registry.resolveType(ref));
    const schema = composer.pick("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", [
      "name",
      "email",
    ]);
    expect(Object.keys(schema.properties!)).toEqual(["name", "email"]);
    expect(schema.required).toEqual(["name"]);
  });

  test("omit removes fields", () => {
    const registry = makeRegistry();
    const composer = new SchemaComposer((ref) => registry.resolveType(ref));
    const schema = composer.omit("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0", ["age"]);
    expect(schema.properties).not.toHaveProperty("age");
    expect(schema.properties).toHaveProperty("name");
  });

  test("partial removes required", () => {
    const registry = makeRegistry();
    const composer = new SchemaComposer((ref) => registry.resolveType(ref));
    const schema = composer.partial("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    expect(schema.required).toBeUndefined();
    expect(schema.properties).toHaveProperty("name");
  });

  test("complete makes all required", () => {
    const registry = makeRegistry();
    const composer = new SchemaComposer((ref) => registry.resolveType(ref));
    const schema = composer.complete("type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    expect(schema.required).toEqual(["name", "age", "email"]);
  });

  test("union produces anyOf", () => {
    const registry = makeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Org/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: { orgName: { type: "string" } } },
    });
    const composer = new SchemaComposer((ref) => registry.resolveType(ref));
    const schema = composer.union(
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/Org/1.0",
    );
    expect(schema.anyOf).toBeDefined();
    expect(schema.anyOf!.length).toBe(2);
  });

  test("merge produces allOf", () => {
    const registry = makeRegistry();
    registry.defineType({
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: { createdAt: { type: "string" } } },
    });
    const composer = new SchemaComposer((ref) => registry.resolveType(ref));
    const schema = composer.merge([
      "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/Timestamped/1.0",
    ]);
    expect(schema.allOf!.length).toBe(2);
  });
});

describe("Layer 8: CompatibilityChecker", () => {
  const checker = new CompatibilityChecker();
  const v1: TypeDef = {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0",
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, age: { type: "integer", minimum: 0, maximum: 150 } },
    },
  };

  test("backward compatible: optional field added", () => {
    const v2: TypeDef = {
      ...v1,
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/2.0",
      schema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          age: { type: "integer", minimum: 0, maximum: 150 },
          email: { type: "string" },
        },
      },
    };
    expect(checker.isBackwardCompatible(v1, v2).compatible).toBe(true);
  });

  test("backward incompatible: required field added without default", () => {
    const v2: TypeDef = {
      ...v1,
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/2.0",
      schema: {
        type: "object",
        required: ["name", "email"],
        properties: {
          name: { type: "string" },
          age: { type: "integer", minimum: 0, maximum: 150 },
          email: { type: "string" },
        },
      },
    };
    const result = checker.isBackwardCompatible(v1, v2);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges[0].kind).toBe("required-added");
  });

  test("backward incompatible: range narrowed", () => {
    const v2: TypeDef = {
      ...v1,
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/2.0",
      schema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          age: { type: "integer", minimum: 0, maximum: 120 },
        },
      },
    };
    const result = checker.isBackwardCompatible(v1, v2);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some((b) => b.kind === "range-narrowed")).toBe(true);
  });

  test("suggestMigration detects added required fields", () => {
    const v2: TypeDef = {
      ...v1,
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/Person/2.0",
      schema: {
        type: "object",
        required: ["name", "email"],
        properties: { name: { type: "string" }, email: { type: "string" } },
      },
    };
    const steps = checker.suggestMigration(v1, v2);
    expect(steps.some((s) => s.action === "add-default" && s.path === "/email")).toBe(true);
  });
});
