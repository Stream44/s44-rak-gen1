import { describe, expect, test } from "bun:test";
import { MetaLevel } from "../L01-foundation/types.ts";
import type { TypeDef } from "../L01-foundation/types.ts";
import { TypeRegistry } from "../L03-tower/registry.ts";
import { diff, diffByCid, diffToString } from "./diff.ts";

const typeDef = (id: string, schema: TypeDef["schema"]): TypeDef => ({
  id,
  schema,
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
  name: id.split("/").at(-2),
  version: "1.0",
});

describe("27D diff", () => {
  test("empty objects -> empty diff", () => expect(diff({}, {})).toEqual([]));
  test("identical objects -> empty diff", () =>
    expect(diff({ a: 1, b: "x" }, { b: "x", a: 1 })).toEqual([]));
  test("add field", () =>
    expect(diff({}, { foo: 1 })).toEqual([{ op: "add", path: "/foo", value: 1 }]));
  test("remove field", () =>
    expect(diff({ foo: 1 }, {})).toEqual([{ op: "remove", path: "/foo" }]));
  test("change scalar", () =>
    expect(diff({ foo: 1 }, { foo: 2 })).toEqual([{ op: "replace", path: "/foo", value: 2 }]));
  test("nested object change", () =>
    expect(diff({ foo: { bar: 1 } }, { foo: { bar: 2 } })).toEqual([
      { op: "replace", path: "/foo/bar", value: 2 },
    ]));
  test("array index difference", () =>
    expect(diff({ arr: [1, 2, 3] }, { arr: [1, 2, 4] })).toEqual([
      { op: "replace", path: "/arr/2", value: 4 },
    ]));
  test("type switch uses replace", () =>
    expect(diff({ foo: "1" }, { foo: 1 })).toEqual([{ op: "replace", path: "/foo", value: 1 }]));
  test("extra array elements add sequentially", () =>
    expect(diff({ arr: [1] }, { arr: [1, 2, 3] })).toEqual([
      { op: "add", path: "/arr/1", value: 2 },
      { op: "add", path: "/arr/2", value: 3 },
    ]));
  test("empty array to non-empty adds", () =>
    expect(diff({ arr: [] }, { arr: ["x"] })).toEqual([{ op: "add", path: "/arr/0", value: "x" }]));
  test("diffByCid with typedefs shows schema delta", () => {
    const registry = new TypeRegistry();
    const aCid = registry.defineType(
      typeDef("type://test.example/Thing/1.0", {
        type: "object",
        properties: { name: { type: "string" } },
      }),
    );
    const bCid = registry.defineType(
      typeDef("type://test.example/Thing/2.0", {
        type: "object",
        properties: { name: { type: "string" }, age: { type: "number" } },
      }),
    );
    expect(diffByCid(registry, aCid, bCid)).toContainEqual({
      op: "add",
      path: "/schema/properties/age",
      value: { type: "number" },
    });
  });
  test("diffByCid with missing CID throws cid", () => {
    const registry = new TypeRegistry();
    expect(() => diffByCid(registry, "cid:sha256:missing", "cid:sha256:also-missing")).toThrow(
      "cid:sha256:missing",
    );
  });
  test("diffToString formats multi-op output", () => {
    const text = diffToString([
      { op: "remove", path: "/a" },
      { op: "add", path: "/b", value: 2 },
      { op: "replace", path: "/c", value: "x" },
    ]);
    expect(text).toContain("# Index-based array diff");
    expect(text).toContain("- /a");
    expect(text).toContain("+ /b 2");
    expect(text).toContain('~ /c "x"');
  });
  test("diffToString truncates long values", () => {
    const text = diffToString([{ op: "replace", path: "/blob", value: "x".repeat(120) }]);
    expect(text).toContain("...");
    expect(text.split("\n")[1]!.length).toBeLessThanOrEqual(90);
  });
});
