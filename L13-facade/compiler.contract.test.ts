import { expect, test } from "bun:test";

import * as facade from "./compiler.ts";
import type {
  CompilerOptions,
  OpcodeKernelVmOptions,
  PassName,
  Pipeline,
  ResolvedCompilerOptions,
} from "./compiler.ts";

void (0 as
  | CompilerOptions
  | OpcodeKernelVmOptions
  | PassName
  | Pipeline
  | ResolvedCompilerOptions
  | undefined);

const EXPECTED_EXPORTS = [
  "BundleCache",
  "DEFAULT_COMPILER_OPTIONS",
  "DEFAULT_PASSES",
  "OpcodeKernelVm",
  "compileAllAlgebraMorphisms",
  "createPipeline",
  "resolveCompilerOptions",
];

test("compiler facade - runtime exports match the contract", () => {
  const actual = Object.keys(facade)
    .filter((key) => key !== "default")
    .sort();
  expect(actual).toEqual(EXPECTED_EXPORTS);
});

test("compiler facade - SLOC cap (DC7)", async () => {
  const text = await Bun.file(import.meta.dir + "/compiler.ts").text();
  expect(text.split("\n").length).toBeLessThanOrEqual(100);
});

test("compiler facade - no implementation logic", async () => {
  const text = await Bun.file(import.meta.dir + "/compiler.ts").text();
  expect(text).not.toMatch(/^\s*(export\s+)?function\s+/m);
  expect(text).not.toMatch(/^\s*(export\s+)?class\s+/m);
});
