import { describe, expect, test } from "bun:test";
import { loadSnapshotManifest } from "../examples/observatory/snapshot-loader.ts";

const projection = (overrides: Record<string, unknown> = {}) => ({
  projector: "observatory",
  version: "0.1.0",
  bindsModel: "demo@1.0.0",
  session: { scope: "observatory" },
  exportWithDebug: true,
  pages: { observatory: { children: [] }, detail: { children: [] } },
  snapshots: [],
  ...overrides,
});

describe("snapshot manifest validator", () => {
  test("accepts a happy-path manifest", () => {
    const manifest = loadSnapshotManifest(
      projection({
        snapshots: [
          {
            name: "kernel/types",
            page: "observatory",
            path: "/kernel/types",
            ctx: { activeTab: "kernel" },
          },
        ],
      }) as never,
    );
    expect(manifest).toEqual({
      exportWithDebug: true,
      snapshots: [
        {
          name: "kernel/types",
          page: "observatory",
          path: "/kernel/types",
          ctx: { activeTab: "kernel" },
          scope: "*",
          debug: undefined,
        },
      ],
    });
  });

  test("rejects a missing page reference", () => {
    expect(() =>
      loadSnapshotManifest(
        projection({
          snapshots: [{ name: "bad", page: "missing", ctx: { activeTab: "kernel" } }],
        }) as never,
      ),
    ).toThrow(/known pages: key/);
  });

  test("rejects duplicate snapshot names", () => {
    expect(() =>
      loadSnapshotManifest(
        projection({
          snapshots: [
            { name: "dup", page: "observatory", ctx: { a: 1 } },
            { name: "dup", page: "detail", ctx: { b: 2 } },
          ],
        }) as never,
      ),
    ).toThrow(/duplicates "dup"/);
  });

  test("rejects an unknown selector op", () => {
    expect(() =>
      loadSnapshotManifest(
        projection({
          snapshots: [
            { name: "bad-op", page: "observatory", ctx: { selected: { op: "mystery" } } },
          ],
        }) as never,
      ),
    ).toThrow(/supported op/);
  });

  test("rejects a selector schema error", () => {
    expect(() =>
      loadSnapshotManifest(
        projection({
          snapshots: [{ name: "bad-shape", page: "observatory", ctx: { selected: { op: "get" } } }],
        }) as never,
      ),
    ).toThrow(/missing required selector fields/);
  });

  test("rejects a bad ctx type", () => {
    expect(() =>
      loadSnapshotManifest(
        projection({
          snapshots: [{ name: "bad-ctx", page: "observatory", ctx: [] }],
        }) as never,
      ),
    ).toThrow(/ctx must be an object/);
  });
});
