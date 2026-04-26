import { describe, expect, test } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { StateMachineEngine, type StateMachineDef, type Transition } from "./engine.ts";

function machine(
  id: string,
  tag = id,
  invariants?: StateMachineDef["invariants"],
  transitions?: Transition[],
): [StateMachineEngine, StateMachineDef] {
  const ak = AlgebraicKernel.create();
  const stateType = ak.kernel.defineUnion(`State${tag}`, "1.0", [
    { type: "object", properties: { s: { const: "idle" } }, required: ["s"] },
    { type: "object", properties: { s: { const: "done" } }, required: ["s"] },
  ]);
  const eventType = ak.kernel.defineUnion(`Event${tag}`, "1.0", [
    { type: "object", properties: { e: { const: "go" } }, required: ["e"] },
    { type: "object", properties: { e: { const: "stop" } }, required: ["e"] },
  ]);
  return [
    new StateMachineEngine(ak),
    {
      id,
      name: id,
      stateType,
      eventType,
      initialState: { s: "idle" },
      transitions: transitions ?? [
        {
          from: { kind: "record", fields: { s: { kind: "const", value: "idle" } } },
          event: { kind: "record", fields: { e: { kind: "const", value: "go" } } },
          to: { op: "const", value: { s: "done" } },
          label: "go",
        },
      ],
      invariants,
    },
  ];
}

describe("state machine cid", () => {
  test("registered machine gets cid", () => {
    const [engine, def] = machine("m1");
    engine.define(def);
    expect(engine.getMachineCid("m1")).toMatch(/^cid:sha256:[a-f0-9]{64}$/);
  });
  test("same id-less shape still differs across ids", () => {
    const [e1, a] = machine("m2", "same");
    const [e2, b] = machine("m3", "same");
    e1.define(a);
    e2.define(b);
    expect(e1.getMachineCid("m2")).not.toBe(e2.getMachineCid("m3"));
  });
  test("different id with identical rest changes cid", () => {
    const [e1, a] = machine("left", "pair");
    const [e2, b] = machine("right", "pair");
    e1.define(a);
    e2.define(b);
    expect(e1.getMachineCid("left")).not.toBe(e2.getMachineCid("right"));
  });
  test("re-registering same machine is deterministic", () => {
    const [engine, def] = machine("m4");
    const a = engine.define(def).cid;
    const b = engine.define(def).cid;
    expect(a).toBe(b);
  });
  test("cid lookup is cached", () => {
    const [engine, def] = machine("m5");
    engine.define(def);
    expect(engine.getMachineCid("m5")).toBe(engine.getMachineCid("m5"));
  });
  test("unknown id returns null", () => {
    const [engine] = machine("m6");
    expect(engine.getMachineCid("missing")).toBeNull();
  });
  test("adding invariant changes cid", () => {
    const inv = [{ op: "const", value: true }] as StateMachineDef["invariants"];
    const [e1, a] = machine("m7", "inv-a");
    const [e2, b] = machine("m8", "inv-b", inv);
    e1.define(a);
    e2.define(b);
    expect(e1.getMachineCid("m7")).not.toBe(e2.getMachineCid("m8"));
  });
  test("reordering transitions changes cid", () => {
    const ts: Transition[] = [
      {
        from: { kind: "record", fields: { s: { kind: "const", value: "idle" } } },
        event: { kind: "record", fields: { e: { kind: "const", value: "go" } } },
        to: { op: "const", value: { s: "done" } },
        label: "go",
      },
      {
        from: { kind: "record", fields: { s: { kind: "const", value: "done" } } },
        event: { kind: "record", fields: { e: { kind: "const", value: "stop" } } },
        to: { op: "const", value: { s: "idle" } },
        label: "stop",
      },
    ];
    const [e1, a] = machine("m9", "order-a", undefined, ts);
    const [e2, b] = machine("m10", "order-b", undefined, [...ts].reverse());
    e1.define(a);
    e2.define(b);
    expect(e1.getMachineCid("m9")).not.toBe(e2.getMachineCid("m10"));
  });
});
