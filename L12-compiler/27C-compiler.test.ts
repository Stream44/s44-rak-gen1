import { describe, expect, test } from "bun:test";
import { createPipeline } from "./pipeline";
import { DEFAULT_COMPILER_OPTIONS, DEFAULT_PASSES, resolveCompilerOptions } from "./options";

describe("27C compiler pipeline", () => {
  test("identity pipeline round-trips a sample AST", () => {
    const ast = { op: "const", value: { ok: true } };
    expect(createPipeline().run(ast)).toEqual(ast);
  });

  test("identity pipeline preserves object identity", () => {
    const ast = { op: "var", name: "$input" };
    expect(createPipeline().run(ast)).toBe(ast);
  });

  test("compiler defaults expose the spec pass order", () => {
    expect(DEFAULT_PASSES).toEqual([
      "normalize",
      "inline",
      "fold",
      "specialise",
      "allocate",
      "lower",
      "emit",
    ]);
  });

  test("compiler defaults are strict by default", () => {
    expect(DEFAULT_COMPILER_OPTIONS.strict).toBe(true);
  });

  test("resolveCompilerOptions fills defaults", () => {
    expect(resolveCompilerOptions()).toEqual(DEFAULT_COMPILER_OPTIONS);
  });

  test("pipeline is pure for repeated runs on the same input", () => {
    const ast = { op: "record", fields: [{ name: "x", value: 1 }] };
    const pipeline = createPipeline();
    expect(pipeline.run(ast)).toEqual(pipeline.run(ast));
  });
});
