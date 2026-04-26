import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AssetRegistry } from "../../../L11-projection/asset-registry.ts";
import type { ProjectionAsset } from "../../../L01-foundation/projection-types.ts";
import {
  createDefaultSession,
  createDefaultSessionAsync,
  type EphemeralStore,
} from "../../../L11-projection/session.ts";
import {
  EPHEMERAL_STORE_M1,
  validateEphemeralStoreM1,
} from "../../../L08-kinds/ephemeral-store/m1.ts";

describe("ephemeral-store kind", () => {
  test("M1 validator accepts the shipped M1", () => {
    expect(() => validateEphemeralStoreM1(EPHEMERAL_STORE_M1)).not.toThrow();
  });

  test("M1 conformsTo shared M2", () => {
    expect(EPHEMERAL_STORE_M1.conformsTo).toBe(
      "type://github.com/Stream44/s44-rak-gen1@1.0/pluggable-interface/1.0",
    );
  });

  test("M1 delete method has void output", () => {
    expect(
      EPHEMERAL_STORE_M1.schema.methods?.find((entry) => entry.name === "delete")?.outputShape,
    ).toEqual({ type: "void" });
  });

  test("MemoryEphemeralStore default export implements EphemeralStore", async () => {
    const { default: MemoryEphemeralStore } =
      await import("../../../L08-kinds/ephemeral-store/memory-ephemeral-store.ts");
    const store: EphemeralStore = new MemoryEphemeralStore();
    expect(store.has("k")).toBe(false);
    store.set("k", 1);
    expect(store.get("k")).toBe(1);
    expect(store.has("k")).toBe(true);
    store.delete("k");
    expect(store.has("k")).toBe(false);
    expect(store.get("k")).toBeUndefined();
  });

  test("legacy createDefaultSession() preserved", () => {
    const session = createDefaultSession();
    expect(session.ephemeral).toBeInstanceOf(Map);
    expect((session.ephemeral as Map<string, unknown>).size).toBe(0);
  });

  test("createDefaultSessionAsync resolves asset-registry ref", async () => {
    const registry = new AssetRegistry();
    const asset = Bun.YAML.parse(
      readFileSync(
        new URL(
          "../../../L08-kinds/ephemeral-store/MemoryEphemeralStore.asset.yaml",
          import.meta.url,
        ),
        "utf-8",
      ),
    ) as ProjectionAsset;
    registry.register({ ...asset, cid: "bafyephemeral-store-memory" });
    const session = await createDefaultSessionAsync({
      ephemeralRef: { ref: "MemoryEphemeralStore/1.0", registry },
    });
    expect((session.ephemeral as { constructor: { name: string } }).constructor.name).toBe(
      "MemoryEphemeralStore",
    );
    session.ephemeral.set("k", "v");
    expect(session.ephemeral.get("k")).toBe("v");
    expect(session.ephemeral.has("k")).toBe(true);
    session.ephemeral.delete("k");
    expect(session.ephemeral.has("k")).toBe(false);
  });

  test("unknown ref throws with clear message", async () => {
    await expect(
      createDefaultSessionAsync({
        ephemeralRef: { ref: "Missing/1.0", registry: new AssetRegistry() },
      }),
    ).rejects.toThrow(
      'EphemeralStore asset not found for ref "Missing/1.0" and kind "ephemeral-store"',
    );
  });

  test("sync path with pre-resolved instance", async () => {
    const { default: MemoryEphemeralStore } =
      await import("../../../L08-kinds/ephemeral-store/memory-ephemeral-store.ts");
    const instance = new MemoryEphemeralStore();
    const session = createDefaultSession({
      ephemeralRef: { ref: "X", registry: new AssetRegistry(), instance },
    });
    expect(session.ephemeral).toBe(instance);
  });
});
