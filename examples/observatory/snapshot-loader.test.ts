import { describe, expect, test } from "bun:test";
import { resolveSnapshotCtx } from "./snapshot-loader.ts";
import type { SnapshotManifestEntry } from "../../L02-metamodels/snapshot-manifest.ts";
import type { WorldState } from "./protocol.ts";

const worldState: WorldState = {
  model: { name: "Demo", version: "1.0.0", origin: "adk.example" },
  types: [
    { id: "type://a", name: "A", level: 1, conformsTo: "meta://type", properties: {} },
    { id: "type://b", name: "B", level: 1, conformsTo: "meta://type", properties: {} },
  ],
  enums: [],
  edges: [],
  machines: [],
  actions: [],
  contracts: [],
  instances: [{ key: "ord-1", state: { status: "draft" } }],
  recentEvents: [],
};

const entry = (ctx: SnapshotManifestEntry["ctx"]): SnapshotManifestEntry => ({
  name: "snapshot",
  page: "observatory",
  ctx,
  scope: "*",
});

describe("resolveSnapshotCtx", () => {
  test("passes literal values through unchanged", () => {
    expect(
      resolveSnapshotCtx(
        entry({ activeTab: "kernel", nested: { selected: null, enabled: true } }),
        worldState,
      ),
    ).toEqual({
      ctx: { activeTab: "kernel", nested: { selected: null, enabled: true } },
      errors: [],
    });
  });

  test("resolves op:first via the existing evaluator context", () => {
    expect(
      resolveSnapshotCtx(
        entry({
          selectedTypeId: { op: "first", of: { op: "get", path: "$bind.types" }, field: "id" },
        }),
        worldState,
      ).ctx.selectedTypeId,
    ).toBe("type://a");
  });

  test("resolves op:at against array-valued selectors", () => {
    expect(
      resolveSnapshotCtx(
        entry({
          selectedTypeId: {
            op: "at",
            of: { op: "get", path: "$bind.types" },
            index: 1,
            field: "id",
          },
        }),
        worldState,
      ).ctx.selectedTypeId,
    ).toBe("type://b");
  });

  test("supports [N] path syntax in get selectors", () => {
    expect(
      resolveSnapshotCtx(
        entry({ selectedTypeId: { op: "get", path: "$bind.types[1].id" } }),
        worldState,
      ).ctx.selectedTypeId,
    ).toBe("type://b");
  });

  test("supports $bind and $ctx references together", () => {
    const resolved = resolveSnapshotCtx(
      entry({
        firstType: { op: "get", path: "$bind.types[0].id" },
        mirror: { op: "get", path: "$ctx.firstType" },
      }),
      worldState,
    );
    expect(resolved.ctx).toEqual({ firstType: "type://a", mirror: "type://a" });
    expect(resolved.errors).toEqual([]);
  });

  test("returns an error sentinel for empty selector results", () => {
    const resolved = resolveSnapshotCtx(
      entry({ selectedTypeId: { op: "first", of: { op: "get", path: "$bind.actions" } } }),
      worldState,
    );
    expect(resolved.errors).toEqual([
      { path: "ctx.selectedTypeId", reason: "selector resolved empty array" },
    ]);
    expect(resolved.ctx.selectedTypeId).toEqual({
      __snapshotError: true,
      path: "ctx.selectedTypeId",
      reason: "selector resolved empty array",
    });
  });

  test("resolves nested selectors inside nested objects", () => {
    expect(
      resolveSnapshotCtx(
        entry({
          selectedTypeId: { op: "get", path: "$bind.types[0].id" },
          detail: { echoedTypeId: { op: "get", path: "$ctx.selectedTypeId" } },
        }),
        worldState,
      ).ctx,
    ).toEqual({
      selectedTypeId: "type://a",
      detail: { echoedTypeId: "type://a" },
    });
  });

  test("aggregates multiple selector errors instead of throwing", () => {
    const resolved = resolveSnapshotCtx(
      entry({
        a: { op: "get", path: "$bind.types[9].id" },
        b: { op: "first", of: { op: "get", path: "$bind.actions" } },
      }),
      worldState,
    );
    expect(resolved.errors).toEqual([
      { path: "ctx.a", reason: "selector resolved undefined" },
      { path: "ctx.b", reason: "selector resolved empty array" },
    ]);
    expect((resolved.ctx.a as Record<string, unknown>).__snapshotError).toBe(true);
    expect((resolved.ctx.b as Record<string, unknown>).__snapshotError).toBe(true);
  });
});
