import { describe, test, expect } from "bun:test";
import { SchemaValidator } from "../L13-facade/index.ts";
import type { JsonSchema } from "../L13-facade/index.ts";

describe("Layer 3: SchemaValidator", () => {
  const v = new SchemaValidator();

  describe("type checking", () => {
    test("validates string type", () => {
      expect(v.validate("hello", { type: "string" }).valid).toBe(true);
      expect(v.validate(42, { type: "string" }).valid).toBe(false);
    });

    test("validates integer type", () => {
      expect(v.validate(42, { type: "integer" }).valid).toBe(true);
      expect(v.validate(3.14, { type: "integer" }).valid).toBe(false);
    });

    test("validates number type (integer is also number)", () => {
      expect(v.validate(42, { type: "number" }).valid).toBe(true);
      expect(v.validate(3.14, { type: "number" }).valid).toBe(true);
    });

    test("validates boolean type", () => {
      expect(v.validate(true, { type: "boolean" }).valid).toBe(true);
      expect(v.validate("true", { type: "boolean" }).valid).toBe(false);
    });

    test("validates null type", () => {
      expect(v.validate(null, { type: "null" }).valid).toBe(true);
      expect(v.validate(0, { type: "null" }).valid).toBe(false);
    });

    test("validates array type", () => {
      expect(v.validate([1, 2], { type: "array" }).valid).toBe(true);
      expect(v.validate("not-array", { type: "array" }).valid).toBe(false);
    });

    test("validates object type", () => {
      expect(v.validate({}, { type: "object" }).valid).toBe(true);
      expect(v.validate([], { type: "object" }).valid).toBe(false);
    });
  });

  describe("const and enum", () => {
    test("const matches exact value", () => {
      expect(v.validate(42, { const: 42 }).valid).toBe(true);
      expect(v.validate(43, { const: 42 }).valid).toBe(false);
    });

    test("enum matches one of values", () => {
      expect(v.validate("a", { enum: ["a", "b", "c"] }).valid).toBe(true);
      expect(v.validate("d", { enum: ["a", "b", "c"] }).valid).toBe(false);
    });
  });

  describe("numeric constraints", () => {
    test("minimum", () => {
      expect(v.validate(5, { type: "integer", minimum: 0 }).valid).toBe(true);
      expect(v.validate(-1, { type: "integer", minimum: 0 }).valid).toBe(false);
    });

    test("maximum", () => {
      expect(v.validate(5, { type: "integer", maximum: 10 }).valid).toBe(true);
      expect(v.validate(11, { type: "integer", maximum: 10 }).valid).toBe(false);
    });

    test("exclusiveMinimum", () => {
      expect(v.validate(1, { type: "integer", exclusiveMinimum: 0 }).valid).toBe(true);
      expect(v.validate(0, { type: "integer", exclusiveMinimum: 0 }).valid).toBe(false);
    });

    test("multipleOf", () => {
      expect(v.validate(10, { type: "integer", multipleOf: 5 }).valid).toBe(true);
      expect(v.validate(7, { type: "integer", multipleOf: 5 }).valid).toBe(false);
    });
  });

  describe("string constraints", () => {
    test("minLength", () => {
      expect(v.validate("abc", { type: "string", minLength: 1 }).valid).toBe(true);
      expect(v.validate("", { type: "string", minLength: 1 }).valid).toBe(false);
    });

    test("maxLength", () => {
      expect(v.validate("ab", { type: "string", maxLength: 5 }).valid).toBe(true);
      expect(v.validate("toolong", { type: "string", maxLength: 3 }).valid).toBe(false);
    });

    test("pattern", () => {
      expect(v.validate("12345", { type: "string", pattern: "^[0-9]{5}$" }).valid).toBe(true);
      expect(v.validate("abc", { type: "string", pattern: "^[0-9]{5}$" }).valid).toBe(false);
    });
  });

  describe("array constraints", () => {
    test("items validation", () => {
      const schema: JsonSchema = { type: "array", items: { type: "integer" } };
      expect(v.validate([1, 2, 3], schema).valid).toBe(true);
      expect(v.validate([1, "two", 3], schema).valid).toBe(false);
    });

    test("minItems and maxItems", () => {
      expect(v.validate([1], { type: "array", minItems: 2 }).valid).toBe(false);
      expect(v.validate([1, 2, 3], { type: "array", maxItems: 2 }).valid).toBe(false);
    });

    test("uniqueItems", () => {
      expect(v.validate([1, 2, 3], { type: "array", uniqueItems: true }).valid).toBe(true);
      expect(v.validate([1, 1, 2], { type: "array", uniqueItems: true }).valid).toBe(false);
    });
  });

  describe("object constraints", () => {
    test("required fields", () => {
      const schema: JsonSchema = {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      };
      expect(v.validate({ name: "Ada" }, schema).valid).toBe(true);
      expect(v.validate({}, schema).valid).toBe(false);
    });

    test("property validation", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: { age: { type: "integer", minimum: 0 } },
      };
      expect(v.validate({ age: 25 }, schema).valid).toBe(true);
      expect(v.validate({ age: -1 }, schema).valid).toBe(false);
    });

    test("additionalProperties false", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: { name: { type: "string" } },
        additionalProperties: false,
      };
      expect(v.validate({ name: "Ada" }, schema).valid).toBe(true);
      expect(v.validate({ name: "Ada", extra: true }, schema).valid).toBe(false);
    });
  });

  describe("composition keywords", () => {
    test("allOf requires all schemas match", () => {
      const schema: JsonSchema = {
        allOf: [
          { type: "object", required: ["a"], properties: { a: { type: "integer" } } },
          { type: "object", required: ["b"], properties: { b: { type: "string" } } },
        ],
      };
      expect(v.validate({ a: 1, b: "x" }, schema).valid).toBe(true);
      expect(v.validate({ a: 1 }, schema).valid).toBe(false);
    });

    test("anyOf requires at least one match", () => {
      const schema: JsonSchema = { anyOf: [{ type: "string" }, { type: "integer" }] };
      expect(v.validate("hello", schema).valid).toBe(true);
      expect(v.validate(42, schema).valid).toBe(true);
      expect(v.validate(true, schema).valid).toBe(false);
    });

    test("oneOf requires exactly one match", () => {
      const schema: JsonSchema = {
        oneOf: [
          { type: "integer", minimum: 0 },
          { type: "integer", maximum: 10 },
        ],
      };
      expect(v.validate(15, schema).valid).toBe(true);
      expect(v.validate(5, schema).valid).toBe(false);
    });

    test("not requires no match", () => {
      expect(v.validate(42, { not: { type: "string" } }).valid).toBe(true);
      expect(v.validate("hello", { not: { type: "string" } }).valid).toBe(false);
    });
  });

  describe("error paths", () => {
    test("reports correct JSON Pointer paths", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          address: {
            type: "object",
            required: ["zip"],
            properties: { zip: { type: "string", pattern: "^[0-9]{5}$" } },
          },
        },
      };
      const result = v.validate({ address: { zip: "abc" } }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe("/address/zip");
      expect(result.errors[0].keyword).toBe("pattern");
    });
  });

  describe("structural subtyping", () => {
    test("wider type is subtype (more required fields)", () => {
      const child: JsonSchema = {
        type: "object",
        required: ["name", "age"],
        properties: { name: { type: "string" }, age: { type: "integer" } },
      };
      const parent: JsonSchema = {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      };
      expect(v.isSubtype(child, parent).isSubtype).toBe(true);
    });

    test("missing required field is not subtype", () => {
      const child: JsonSchema = { type: "object", properties: { name: { type: "string" } } };
      const parent: JsonSchema = {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      };
      expect(v.isSubtype(child, parent).isSubtype).toBe(false);
    });

    test("tighter numeric range is subtype", () => {
      expect(
        v.isSubtype(
          { type: "integer", minimum: 0, maximum: 100 },
          { type: "integer", minimum: 0, maximum: 150 },
        ).isSubtype,
      ).toBe(true);
    });

    test("wider numeric range is not subtype", () => {
      expect(
        v.isSubtype(
          { type: "integer", minimum: 0, maximum: 200 },
          { type: "integer", minimum: 0, maximum: 150 },
        ).isSubtype,
      ).toBe(false);
    });

    test("empty parent accepts everything", () => {
      expect(v.isSubtype({ type: "string", minLength: 5 }, {}).isSubtype).toBe(true);
    });
  });
});
