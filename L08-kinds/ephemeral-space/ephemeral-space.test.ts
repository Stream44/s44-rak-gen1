import { describe, expect, test } from "bun:test";
import { keyedValueStoreContract } from "../storage-space/storage-space.test.ts";
import { createEphemeralSpace } from "./ephemeral-space.ts";

keyedValueStoreContract("ephemeral-space", async () => {
  const store = createEphemeralSpace({ name: "contract" });
  await store.open({});
  return { store };
});

describe("ephemeral-space", () => {
  test("flush and close are no-ops", async () => {
    const store = createEphemeralSpace({ name: "memory" });
    await store.open({});
    store.put("todos", "todo-1", { done: false });

    await expect(store.flush?.()).resolves.toBeUndefined();
    await expect(store.close?.()).resolves.toBeUndefined();
    expect(store.snapshot("todos")).toEqual({ "todo-1": { done: false } });
  });
});
