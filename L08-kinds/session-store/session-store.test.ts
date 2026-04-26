import { describe, expect, test } from "bun:test";
import { SESSION_STORE_M1, validateSessionStoreM1 } from "./m1.ts";
import MemorySessionStore from "./memory-session-store.ts";

describe("session-store kind", () => {
  test("create returns a fresh sessionId and get returns the stored record", () => {
    expect(() => validateSessionStoreM1(SESSION_STORE_M1)).not.toThrow();
    const store = new MemorySessionStore(),
      id = store.create({ id: "u1", capabilities: { read: "cap://read" } }, "orders"),
      record = store.get(id);
    expect(record).toMatchObject({
      id,
      userId: "u1",
      scope: "orders",
      capabilities: { read: "cap://read" },
    });
  });

  test("getByScope returns the same record as get after create", () => {
    const store = new MemorySessionStore(),
      id = store.create({ id: "u1", capabilities: { read: "cap://read" } }, "orders");
    expect(store.getByScope("u1", "orders")).toEqual(store.get(id));
  });

  test("create twice with the same userId and scope destroys the first session", () => {
    const store = new MemorySessionStore(),
      first = store.create({ id: "u1", capabilities: { read: "cap://read" } }, "orders"),
      second = store.create({ id: "u1", capabilities: { write: "cap://write" } }, "orders");
    expect(store.get(first)).toBeNull();
    expect(store.get(second)?.capabilities).toEqual({ write: "cap://write" });
  });

  test("attach merges capabilities and detach removes them", () => {
    const store = new MemorySessionStore(),
      id = store.create({ id: "u1", capabilities: { read: "cap://read" } }, "orders");
    store.attach(id, { pay: "cap://pay" }, ["orders"]);
    expect(store.get(id)?.capabilities).toEqual({ read: "cap://read", pay: "cap://pay" });
    store.detach(id, ["pay"]);
    expect(store.get(id)?.capabilities).toEqual({ read: "cap://read" });
  });

  test("destroy and destroyByUserScope remove records from both indices", () => {
    const store = new MemorySessionStore(),
      a = store.create({ id: "u1", capabilities: {} }, "orders"),
      b = store.create({ id: "u1", capabilities: {} }, "billing");
    store.destroy(a);
    store.destroyByUserScope("u1", "billing");
    expect(store.get(a)).toBeNull();
    expect(store.getByScope("u1", "orders")).toBeNull();
    expect(store.get(b)).toBeNull();
    expect(store.getByScope("u1", "billing")).toBeNull();
  });

  test("list returns all records in stable ordering and filters by userId", () => {
    const store = new MemorySessionStore(),
      a = store.create({ id: "u1", capabilities: {} }, "orders"),
      b = store.create({ id: "u2", capabilities: {} }, "billing"),
      c = store.create({ id: "u1", capabilities: {} }, "support");
    expect(store.list().map((record) => record.id)).toEqual([a, b, c]);
    expect(store.list("u1").map((record) => record.id)).toEqual([a, c]);
  });
});
