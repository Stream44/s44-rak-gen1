import { expect, test } from "bun:test";

import * as facade from "./kernel.ts";
import type { AlgebraicKernelOptions } from "./kernel.ts";

void (0 as AlgebraicKernelOptions | undefined);

const EXPECTED_EXPORTS = ["AlgebraicKernel"];

test("kernel facade - runtime exports match the contract", () => {
  const actual = Object.keys(facade)
    .filter((key) => key !== "default")
    .sort();
  expect(actual).toEqual(EXPECTED_EXPORTS);
});

test("kernel facade - SLOC cap (DC7)", async () => {
  const text = await Bun.file(import.meta.dir + "/kernel.ts").text();
  expect(text.split("\n").length).toBeLessThanOrEqual(400);
});
