import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MemoryStore } from "../../../L01-foundation/encoder.ts";
import { TypeRegistry } from "../../../L03-tower/registry.ts";
import type { ProjectionAsset } from "../../../L01-foundation/projection-types.ts";
import { AssetRegistry } from "../../../L11-projection/asset-registry.ts";
import { CONTENT_STORE_M1, validateContentStoreM1 } from "../../../L08-kinds/content-store/m1.ts";

describe("content-store kind", () => {
  test("M1 loads and validator accepts the shipped document", () => {
    expect(() => validateContentStoreM1(CONTENT_STORE_M1)).not.toThrow();
  });

  test("M1 rejects malformed documents", () => {
    const malformed = { ...CONTENT_STORE_M1, schema: { ...CONTENT_STORE_M1.schema } };
    delete (malformed.schema as { methods?: unknown }).methods;
    expect(() => validateContentStoreM1(malformed)).toThrow(
      `${CONTENT_STORE_M1.id}: missing methods`,
    );
  });

  test("M1 conformsTo the shared pluggable-interface M2", () => {
    expect(CONTENT_STORE_M1.conformsTo).toBe(
      "type://github.com/Stream44/s44-rak-gen1@1.0/pluggable-interface/1.0",
    );
  });

  test("MemoryContentStore default export implements ContentStore", async () => {
    const mod = await import("../../../L08-kinds/content-store/memory-content-store.ts");
    const store = new mod.default();
    const bytes = new Uint8Array([1, 2, 3]);

    store.put("asset-1", bytes);
    expect(store.has("asset-1")).toBe(true);
    expect(store.get("asset-1")).toEqual(bytes);
    expect(store.delete("asset-1")).toBe(true);
    expect(store.get("asset-1")).toBeNull();
  });

  test("TypeRegistry direct store path works", () => {
    const store = new MemoryStore();
    const registry = new TypeRegistry({ store });

    expect((registry as unknown as { store: MemoryStore }).store).toBe(store);
  });

  test("TypeRegistry storeRef async path works", async () => {
    const registry = new AssetRegistry();
    const asset = Bun.YAML.parse(
      readFileSync(
        new URL("../../../L08-kinds/content-store/MemoryContentStore.asset.yaml", import.meta.url),
        "utf-8",
      ),
    ) as ProjectionAsset;
    registry.register({ ...asset, cid: "bafycontent-store-memory" });

    const typeRegistry = await TypeRegistry.createFromRef({
      storeRef: { ref: "MemoryContentStore/1.0", registry },
    });
    const store = (
      typeRegistry as unknown as {
        store: {
          constructor: { name: string };
          put(id: string, bytes: Uint8Array): void;
          get(id: string): Uint8Array | null;
        };
      }
    ).store;
    const bytes = new Uint8Array([4, 5, 6]);

    expect(store.constructor.name).toBe("MemoryContentStore");
    store.put("asset-2", bytes);
    expect(store.get("asset-2")).toEqual(bytes);
  });

  test("passing both store and storeRef throws", () => {
    expect(
      () =>
        new TypeRegistry({
          store: new MemoryStore(),
          storeRef: { ref: "MemoryContentStore/1.0", registry: new AssetRegistry() },
        }),
    ).toThrow("TypeRegistry: pass either store OR storeRef, not both");
  });

  test("missing storeRef throws with a clear message", async () => {
    await expect(
      TypeRegistry.createFromRef({
        storeRef: { ref: "MissingStore/1.0", registry: new AssetRegistry() },
      }),
    ).rejects.toThrow(
      "TypeRegistry: content-store ref 'MissingStore/1.0' not found in asset registry",
    );
  });
});
