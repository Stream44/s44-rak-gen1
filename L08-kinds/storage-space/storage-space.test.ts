import { describe, expect, test } from "bun:test";
import type { AppendOnlyJournal } from "./append-only-journal.ts";
import type { KeyedValueStore } from "./keyed-value.ts";

interface KeyedValueHarness {
  store: KeyedValueStore;
}

interface AppendOnlyJournalHarness {
  store: AppendOnlyJournal;
}

async function collectEntries(
  journal: AppendOnlyJournal,
  bindingName: string,
  cursor?: string,
): Promise<Record<string, unknown>[]> {
  const entries: Record<string, unknown>[] = [];
  for await (const entry of journal.scanFrom(bindingName, cursor)) entries.push(entry);
  return entries;
}

export function keyedValueStoreContract(
  label: string,
  createHarness: () => Promise<KeyedValueHarness> | KeyedValueHarness,
): void {
  describe(`${label} keyedValueStoreContract`, () => {
    test("open with no file yields empty state", async () => {
      const { store } = await createHarness();

      expect(store.snapshot("default")).toEqual({});
      expect(store.get("default", "missing")).toBeUndefined();
      expect(store.has("default", "missing")).toBe(false);
    });

    test("put then get round-trips", async () => {
      const { store } = await createHarness();

      store.put("default", "todo-1", { done: false });

      expect(store.get("default", "todo-1")).toEqual({ done: false });
      expect(store.has("default", "todo-1")).toBe(true);
    });

    test("snapshot is binding scoped", async () => {
      const { store } = await createHarness();

      store.put("alpha", "one", { done: false });
      store.put("beta", "two", { done: true });

      expect(store.snapshot("alpha")).toEqual({ one: { done: false } });
      expect(store.snapshot("beta")).toEqual({ two: { done: true } });
    });

    test("hydrate replaces one binding without touching others", async () => {
      const { store } = await createHarness();

      store.put("alpha", "old", { keep: false });
      store.put("beta", "keep", { done: true });
      store.hydrate("alpha", { fresh: { done: false } });

      expect(store.snapshot("alpha")).toEqual({ fresh: { done: false } });
      expect(store.snapshot("beta")).toEqual({ keep: { done: true } });
    });

    test("delete clears membership", async () => {
      const { store } = await createHarness();

      store.put("default", "todo-1", { done: false });
      store.delete("default", "todo-1");

      expect(store.has("default", "todo-1")).toBe(false);
      expect(store.get("default", "todo-1")).toBeUndefined();
    });
  });
}

export function appendOnlyJournalContract(
  label: string,
  createHarness: () => Promise<AppendOnlyJournalHarness> | AppendOnlyJournalHarness,
): void {
  describe(`${label} appendOnlyJournalContract`, () => {
    test("open with no file yields empty scan", async () => {
      const { store } = await createHarness();

      expect(await collectEntries(store, "orders")).toEqual([]);
      expect(store.latestCursor("orders")).toBeUndefined();
    });

    test("append then scanFrom(undefined) yields entries in order", async () => {
      const { store } = await createHarness();

      store.append("orders", { verb: "submit", aggregateKey: "ord-1" });
      await store.flush?.();
      store.append("orders", { verb: "pay", aggregateKey: "ord-1" });
      await store.flush?.();

      expect(await collectEntries(store, "orders")).toEqual([
        { "@binding": "orders", "verb": "submit", "aggregateKey": "ord-1" },
        { "@binding": "orders", "verb": "pay", "aggregateKey": "ord-1" },
      ]);
    });

    test("scanFrom(cursor) resumes after the cursor line", async () => {
      const { store } = await createHarness();

      store.append("orders", { verb: "submit", aggregateKey: "ord-1" });
      await store.flush?.();
      const cursor = store.latestCursor("orders");
      store.append("orders", { verb: "pay", aggregateKey: "ord-1" });
      await store.flush?.();

      expect(cursor).toEqual(expect.any(String));
      expect(await collectEntries(store, "orders", cursor)).toEqual([
        { "@binding": "orders", "verb": "pay", "aggregateKey": "ord-1" },
      ]);
    });

    test("mixed bindings filter correctly", async () => {
      const { store } = await createHarness();

      store.append("orders", { verb: "submit", aggregateKey: "ord-1" });
      store.append("audit", { verb: "audit", aggregateKey: "ord-1" });
      store.append("orders", { verb: "pay", aggregateKey: "ord-1" });
      await store.flush?.();

      expect(await collectEntries(store, "orders")).toEqual([
        { "@binding": "orders", "verb": "submit", "aggregateKey": "ord-1" },
        { "@binding": "orders", "verb": "pay", "aggregateKey": "ord-1" },
      ]);
    });
  });
}
