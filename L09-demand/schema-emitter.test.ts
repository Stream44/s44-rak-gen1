import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  __resetSchemaEmitterWarnings,
  emitContextUri,
  emitSchema,
  emitSchemaVersion,
  validateAgainstSchema,
} from "./schema-emitter.ts";

const todoDoc = {
  model: "catalog",
  version: "1.0",
  origin: "https://example.kernel/catalog",
  entities: {
    Item: {
      description: "An item",
      attributes: {
        title: { type: "string", required: true, minLength: 1, pattern: "^[a-z ]+$" },
        completed: { type: "boolean", default: false },
      },
    },
    Project: {
      required: ["name"],
      attributes: {
        name: { type: "string" },
        owner: { type: "core:Person" },
        tags: { type: "list<Tag>" },
      },
    },
  },
} as const;

beforeEach(() => {
  __resetSchemaEmitterWarnings();
});

describe("emitContextUri", () => {
  test("composes origin + version", () => {
    expect(emitContextUri(todoDoc as any)).toBe("https://example.kernel/catalog/schema/1.0");
  });

  test("strips trailing slash from origin", () => {
    expect(emitContextUri({ ...todoDoc, origin: "https://x.com/y/" } as any)).toBe(
      "https://x.com/y/schema/1.0",
    );
  });

  test("defaults version to 1.0 when missing", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const { version, ...rest } = todoDoc as any;
    expect(emitContextUri(rest)).toBe("https://example.kernel/catalog/schema/1.0");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("does not double-append schema path", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect(emitContextUri({ ...todoDoc, origin: "https://x.com/schema/1.0" } as any)).toBe(
      "https://x.com/schema/1.0",
    );
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("emitSchemaVersion", () => {
  test("produces type URI with hostname", () => {
    expect(emitSchemaVersion(todoDoc as any, "Item")).toBe("type://example.kernel/Item/1.0");
  });

  test("falls back when origin is not a valid URL", () => {
    expect(emitSchemaVersion({ ...todoDoc, origin: "example.kernel/x" } as any, "Item")).toBe(
      "type://example.kernel/Item/1.0",
    );
  });

  test("sanitizes bare origins with fragments and queries", () => {
    expect(
      emitSchemaVersion({ ...todoDoc, origin: "example.kernel/x?a=1#frag" } as any, "Item"),
    ).toBe("type://example.kernel/Item/1.0");
  });
});

describe("emitSchema", () => {
  test("produces object schema for entity", () => {
    const emitted = emitSchema(todoDoc as any, "Item");
    expect(emitted.contextUri).toBe("https://example.kernel/catalog/schema/1.0");
    expect(emitted.schemaVersion).toBe("type://example.kernel/Item/1.0");
    expect(emitted.jsonSchema.type).toBe("object");
    expect(emitted.jsonSchema.properties.title).toMatchObject({ type: "string", minLength: 1 });
    expect(emitted.jsonSchema.properties.completed).toMatchObject({ type: "boolean" });
    expect(emitted.jsonSchema.required).toEqual(["title"]);
    expect(emitted.jsonSchema.additionalProperties).toBe(true);
    expect(emitted.jsonSchema.$id).toBe(emitted.schemaVersion);
  });

  test("entity-level required array wins when present", () => {
    const emitted = emitSchema(todoDoc as any, "Project");
    expect(emitted.jsonSchema.required).toEqual(["name"]);
  });

  test("compileAttributeType output is reused for prefixed and list refs", () => {
    const emitted = emitSchema(todoDoc as any, "Project");
    expect(emitted.jsonSchema.properties.owner).toMatchObject({
      type: "string",
      $typeRef: "type://example.kernel/Person/1.0",
    });
    expect(emitted.jsonSchema.properties.tags).toMatchObject({
      type: "array",
      items: { type: "string", $typeRef: "type://https://example.kernel/catalog/Tag/1.0" },
    });
  });

  test("throws when entity is missing", () => {
    expect(() => emitSchema(todoDoc as any, "NotThere")).toThrow(/NotThere/);
  });
});

describe("validateAgainstSchema", () => {
  const schema = emitSchema(todoDoc as any, "Item").jsonSchema;
  const projectSchema = emitSchema(todoDoc as any, "Project").jsonSchema;

  test("known-good record validates", () => {
    expect(validateAgainstSchema({ title: "buy milk", completed: false }, schema)).toEqual({
      ok: true,
    });
  });

  test("missing required field fails with clear error", () => {
    const result = validateAgainstSchema({ completed: true }, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/title: required field missing/);
  });

  test("wrong type fails", () => {
    const result = validateAgainstSchema({ title: "buy milk", completed: "nope" }, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/completed: expected boolean/);
  });

  test("string constraints fail", () => {
    const result = validateAgainstSchema({ title: "" }, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/minLength 1 violated/);
  });

  test("unknown fields are tolerated", () => {
    expect(validateAgainstSchema({ title: "milk", mysteryField: 42 }, schema)).toEqual({
      ok: true,
    });
  });

  test("array items recurse", () => {
    const result = validateAgainstSchema({ name: "Launch", tags: ["ok", 2] }, projectSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/\$\.tags\[1\]: expected string/);
  });

  test("enum and numeric bounds are enforced", () => {
    const result = validateAgainstSchema(
      { status: "bad", count: 0 },
      {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok"] },
          count: { type: "integer", minimum: 1, maximum: 5 },
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toMatch(/status: value "bad" not in enum/);
      expect(result.errors.join("\n")).toMatch(/count: minimum 1 violated/);
    }
  });
});
