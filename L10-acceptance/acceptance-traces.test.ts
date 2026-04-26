import { describe, expect, test } from "bun:test";
import { extractTraces, type Step } from "./acceptance.ts";
import { makeStep } from "./test-support.ts";

describe("extractTraces", () => {
  test("linear chain produces 1 trace", () => {
    const leaf = makeStep("c", { verb: "pay", targetKey: "ord-001" });
    const mid: Step = {
      ...makeStep("b", { targetKey: "ord-001" }),
      branches: [{ label: "next", step: leaf }],
    };
    const root: Step = {
      ...makeStep("a", { targetKey: "ord-001" }),
      branches: [{ label: "next", step: mid }],
    };
    const traces = extractTraces(root);
    expect(traces).toHaveLength(1);
    expect(traces[0].steps).toHaveLength(3);
  });

  test("single branch with 2 children produces 2 traces", () => {
    const a = makeStep("leaf-a", { verb: "pay" });
    const b = makeStep("leaf-b", { verb: "cancel" });
    const root: Step = {
      ...makeStep("root"),
      branches: [
        { label: "pay", step: a },
        { label: "cancel", step: b },
      ],
    };
    const traces = extractTraces(root);
    expect(traces).toHaveLength(2);
    expect(traces[0].steps.map((s) => s.id)).toEqual(["root", "leaf-a"]);
    expect(traces[1].steps.map((s) => s.id)).toEqual(["root", "leaf-b"]);
  });

  test("nested branches: 2 x 2 = 4 traces", () => {
    const aa = makeStep("aa");
    const ab = makeStep("ab");
    const ba = makeStep("ba");
    const bb = makeStep("bb");
    const a: Step = {
      ...makeStep("a"),
      branches: [
        { label: "1", step: aa },
        { label: "2", step: ab },
      ],
    };
    const b: Step = {
      ...makeStep("b"),
      branches: [
        { label: "1", step: ba },
        { label: "2", step: bb },
      ],
    };
    const root: Step = {
      ...makeStep("root"),
      branches: [
        { label: "a", step: a },
        { label: "b", step: b },
      ],
    };
    expect(extractTraces(root)).toHaveLength(4);
  });
});

describe("extractTraces — cycles via ref branches", () => {
  test("ref branch produces a cyclic trace with cycleTo marker", () => {
    const root: Step = makeStep("root");
    root.branches = [{ label: "retry", ref: "root" }];

    const traces = extractTraces(root);
    expect(traces).toHaveLength(1);
    expect(traces[0].cycle?.toStepId).toBe("root");
    expect(traces[0].steps.map((s) => s.id)).toEqual(["root", "root"]);
  });

  test("maxCycleDepth=1 terminates at cycle marker without repeating", () => {
    const root: Step = makeStep("root");
    root.branches = [{ label: "retry", ref: "root" }];

    const traces = extractTraces(root, { maxCycleDepth: 1 });
    expect(traces).toHaveLength(1);
    expect(traces[0].steps.map((s) => s.id)).toEqual(["root"]);
    expect(traces[0].cycle?.toStepId).toBe("root");
  });

  test("maxCycleDepth=3 allows two cycle iterations", () => {
    const root: Step = makeStep("root");
    root.branches = [{ label: "retry", ref: "root" }];

    const traces = extractTraces(root, { maxCycleDepth: 3 });
    expect(traces).toHaveLength(1);
    expect(traces[0].cycle?.toStepId).toBe("root");
    expect(traces[0].steps.map((s) => s.id)).toEqual(["root", "root"]);
  });

  test("ref to non-existent step id throws", () => {
    const root: Step = {
      ...makeStep("root"),
      branches: [{ label: "broken", ref: "does-not-exist" }],
    };
    expect(() => extractTraces(root)).toThrow(/does not resolve/);
  });

  test("mixed step + ref branches produce separate traces", () => {
    const leaf = makeStep("leaf", { verb: "cancel" });
    const root: Step = {
      ...makeStep("root"),
      branches: [
        { label: "continue", step: leaf },
        { label: "retry", ref: "root" },
      ],
    };

    const traces = extractTraces(root);
    expect(traces).toHaveLength(2);
    const linear = traces.find((t) => !t.cycle)!;
    expect(linear.steps.map((s) => s.id)).toEqual(["root", "leaf"]);
    const cyclic = traces.find((t) => t.cycle)!;
    expect(cyclic.cycle?.toStepId).toBe("root");
  });
});
