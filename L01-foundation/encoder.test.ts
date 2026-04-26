import { describe, test, expect } from "bun:test";
import { JsonEncoder, MemoryStore } from "../L13-facade/index.ts";

describe("Layer 2: Encoder + MemoryStore", () => {
  const encoder = new JsonEncoder();

  describe("JsonEncoder", () => {
    test("encode/decode roundtrip", () => {
      const data = { name: "Ada", born: 1815, tags: ["math"] };
      const bytes = encoder.encode(data);
      const decoded = encoder.decode(bytes);
      expect(decoded).toEqual(data);
    });

    test("encode is deterministic (canonical)", () => {
      const a = encoder.encode({ b: 2, a: 1 });
      const b = encoder.encode({ a: 1, b: 2 });
      expect(a).toEqual(b);
    });

    test("hash produces CID format", () => {
      const bytes = encoder.encode({ test: true });
      const cid = encoder.hash(bytes);
      expect(cid.startsWith("cid:sha256:")).toBe(true);
      expect(cid.length).toBeGreaterThan(20);
    });

    test("same data produces same hash", () => {
      const a = encoder.encode({ x: 1 });
      const b = encoder.encode({ x: 1 });
      expect(encoder.hash(a)).toBe(encoder.hash(b));
    });

    test("different data produces different hash", () => {
      const a = encoder.encode({ x: 1 });
      const b = encoder.encode({ x: 2 });
      expect(encoder.hash(a)).not.toBe(encoder.hash(b));
    });

    test("verify returns true for matching CID", () => {
      const bytes = encoder.encode({ verify: "me" });
      const cid = encoder.hash(bytes);
      expect(encoder.verify(cid, bytes)).toBe(true);
    });

    test("verify returns false for wrong CID", () => {
      const bytes = encoder.encode({ verify: "me" });
      expect(encoder.verify("cid:sha256:wrong", bytes)).toBe(false);
    });

    test("encodeAndHash convenience", () => {
      const { bytes, cid } = encoder.encodeAndHash({ test: true });
      expect(encoder.verify(cid, bytes)).toBe(true);
    });
  });

  describe("MemoryStore", () => {
    test("put and get", () => {
      const store = new MemoryStore();
      const bytes = new Uint8Array([1, 2, 3]);
      store.put("id1", bytes);
      expect(store.get("id1")).toEqual(bytes);
    });

    test("get returns null for missing", () => {
      const store = new MemoryStore();
      expect(store.get("missing")).toBeNull();
    });

    test("has checks existence", () => {
      const store = new MemoryStore();
      store.put("id1", new Uint8Array([1]));
      expect(store.has("id1")).toBe(true);
      expect(store.has("id2")).toBe(false);
    });

    test("delete removes entry", () => {
      const store = new MemoryStore();
      store.put("id1", new Uint8Array([1]));
      expect(store.delete("id1")).toBe(true);
      expect(store.get("id1")).toBeNull();
    });

    test("size tracks entries", () => {
      const store = new MemoryStore();
      expect(store.size).toBe(0);
      store.put("a", new Uint8Array([1]));
      store.put("b", new Uint8Array([2]));
      expect(store.size).toBe(2);
    });

    test("clear removes all", () => {
      const store = new MemoryStore();
      store.put("a", new Uint8Array([1]));
      store.clear();
      expect(store.size).toBe(0);
    });
  });
});
