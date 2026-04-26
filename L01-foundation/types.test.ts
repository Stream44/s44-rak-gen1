import { describe, test, expect } from "bun:test";

import {
  canonicalize,
  isContentId,
  isTypeUri,
  parseTypeUri,
  buildTypeUri,
  extractTypeRefs,
  requiredDiff,
} from "../L13-facade/index.ts";
import type { JsonSchema } from "../L13-facade/index.ts";

describe("Layer 1: Types + Utilities", () => {
  describe("canonicalize", () => {
    test("sorts object keys deterministically", () => {
      expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    });

    test("handles nested objects", () => {
      expect(canonicalize({ z: { b: 2, a: 1 }, a: 0 })).toBe('{"a":0,"z":{"a":1,"b":2}}');
    });

    test("handles arrays (preserves order)", () => {
      expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
    });

    test("handles primitives", () => {
      expect(canonicalize(42)).toBe("42");
      expect(canonicalize("hello")).toBe('"hello"');
      expect(canonicalize(true)).toBe("true");
      expect(canonicalize(null)).toBe("null");
    });

    test("omits undefined values", () => {
      expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
    });

    test("produces identical output for identical data", () => {
      const a = { name: "Ada", born: 1815, tags: ["math"] };
      const b = { tags: ["math"], born: 1815, name: "Ada" };
      expect(canonicalize(a)).toBe(canonicalize(b));
    });
  });

  describe("CID and TypeURI", () => {
    test("isContentId recognizes CIDs", () => {
      expect(isContentId("cid:sha256:abc123")).toBe(true);
      expect(isContentId("type://Person/1.0")).toBe(false);
    });

    test("isTypeUri recognizes type URIs", () => {
      expect(isTypeUri("type://Person/1.0")).toBe(true);
      expect(isTypeUri("cid:sha256:abc123")).toBe(false);
    });

    test("parseTypeUri parses valid URIs", () => {
      expect(parseTypeUri("type://test.example/Person/1.0")).toEqual({
        origin: "test.example",
        name: "Person",
        version: "1.0",
      });
    });

    test("parseTypeUri handles versioned multi-segment origins", () => {
      expect(parseTypeUri("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0")).toEqual({
        origin: "github.com/Stream44/s44-rak-gen1@1.0",
        name: "record",
        version: "1.0",
      });
      expect(
        parseTypeUri("type://github.com/Stream44/s44-rak-gen1@1.0/adk/AcceptanceMorphisms/1.0"),
      ).toEqual({
        origin: "github.com/Stream44/s44-rak-gen1@1.0",
        name: "adk/AcceptanceMorphisms",
        version: "1.0",
      });
    });

    test("parseTypeUri keeps legacy single-segment origin parsing", () => {
      expect(parseTypeUri("type://example.com/record/1.0")).toEqual({
        origin: "example.com",
        name: "record",
        version: "1.0",
      });
    });

    test("parseTypeUri returns null for invalid URIs", () => {
      expect(parseTypeUri("not-a-uri")).toBeNull();
      expect(parseTypeUri("type://")).toBeNull();
    });

    test("buildTypeUri creates correct URIs", () => {
      expect(buildTypeUri("test.example", "Person", "1.0")).toBe("type://test.example/Person/1.0");
    });
  });

  describe("extractTypeRefs", () => {
    test("extracts $typeRef from properties", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          address: { type: "string", $typeRef: "type://Address/1.0" },
          name: { type: "string" },
        },
      };
      expect(extractTypeRefs(schema)).toEqual(["type://Address/1.0"]);
    });

    test("extracts from nested schemas", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string", $typeRef: "type://Item/1.0" },
          },
        },
      };
      expect(extractTypeRefs(schema)).toEqual(["type://Item/1.0"]);
    });

    test("returns empty for schema without refs", () => {
      expect(extractTypeRefs({ type: "string" })).toEqual([]);
    });
  });

  describe("requiredDiff", () => {
    test("detects added and removed required fields", () => {
      const old: JsonSchema = { required: ["a", "b"] };
      const nw: JsonSchema = { required: ["b", "c"] };
      const diff = requiredDiff(old, nw);
      expect(diff.added).toEqual(["c"]);
      expect(diff.removed).toEqual(["a"]);
    });
  });
});
