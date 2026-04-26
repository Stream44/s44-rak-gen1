import { describe, expect, test } from "bun:test";
import { runParityHarness } from "./parity/harness";
import { ParityMode } from "./parity/parity-mode";

describe("27C compiler parity stubs", () => {
  test("ParityMode exposes source, compiled, and parity", () => {
    expect(Object.values(ParityMode)).toEqual(["source", "compiled", "parity"]);
  });

  test("parity harness throws NOT_IMPLEMENTED", () => {
    expect(() => runParityHarness(ParityMode.Parity, "morphism://test", {})).toThrow(
      "NOT_IMPLEMENTED: runParityHarness",
    );
  });
});
