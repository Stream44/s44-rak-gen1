import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { bootNode } from "../../../L14-hosts/projection-runtime/index.ts";

const SDS_PATH = resolve(import.meta.dir, "sds.yaml");

describe("projection-engine storage migration", () => {
  test("boots with explicit storage declarations", () => {
    const runtime = bootNode(SDS_PATH);
    expect(runtime.sds.storageSpaces?.map((space) => space.name)).toEqual(["orders-fs"]);
    expect(runtime.sds.bindings?.map((binding) => binding.name)).toEqual(["order-records"]);
    runtime.dispose();
  });
});
