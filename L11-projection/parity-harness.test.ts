import { expect, test } from "bun:test";
import { runParity } from "./parity-harness.ts";

test("identical stubs produce zero failures", async () => {
  const kernelA = {
    dispatch(input: number) {
      return input + 1;
    },
  };
  const kernelB = {
    dispatch(input: number) {
      return Promise.resolve(input + 1);
    },
  };
  const report = await runParity(kernelA, kernelB, [
    { name: "increments", input: 5, assert: (a, b) => expect(a).toBe(b) },
  ]);

  expect(report.passed).toBe(1);
  expect(report.failed.length).toBe(0);
});

test("divergent stubs fail with a useful diff", async () => {
  const report = await runParity(
    {
      dispatch(input: number) {
        return input + 1;
      },
    },
    {
      dispatch(input: number) {
        return input + 2;
      },
    },
    [{ name: "off-by-one", input: 5, assert: (a, b) => expect(a).toBe(b) }],
  );

  expect(report.failed.length).toBe(1);
  expect(report.details.length).toBeGreaterThanOrEqual(1);
  expect(report.details[0]).toContain("off-by-one");
  expect(report.details[0]).toMatch(/6|7/);
});

test("throw mismatch is reported without crashing the harness", async () => {
  const report = await runParity(
    {
      dispatch() {
        throw new Error("boom");
      },
    },
    {
      dispatch(input: number) {
        return input;
      },
    },
    [{ name: "throw-mismatch", input: 5, assert: (a, b) => expect(a).toBe(b) }],
  );

  expect(report.failed.length).toBe(1);
  expect(report.details[0]).toMatch(/throw mismatch/);
});
