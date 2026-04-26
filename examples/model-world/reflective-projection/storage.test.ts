import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { bootNode } from "../../../L14-hosts/projection-runtime/index.ts";

const SDS_PATH = resolve(import.meta.dir, "sds.yaml");

describe("reflective-projection storage migration", () => {
  test("boots with two explicit storage spaces and bindings", () => {
    const runtime = bootNode(SDS_PATH);
    expect(runtime.sds.storageSpaces?.map((space) => space.name)).toEqual([
      "categories-fs",
      "records-fs",
    ]);
    expect(runtime.sds.bindings?.map((binding) => binding.name)).toEqual([
      "category-records",
      "record-records",
    ]);
    runtime.dispose();
  });
});
