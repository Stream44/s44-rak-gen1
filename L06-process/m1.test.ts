import { describe, expect, test } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { BOOTSTRAP_INDEX } from "../L13-facade/index.ts";
import { StateMachineEngine } from "./engine.ts";
import { STATE_MACHINE_MORPHISMS_M1, StateMachineMorphismsSource } from "./m1.ts";

describe("State machine morphism registration", () => {
  test("loads state-machine.model.yaml and validates the document header", () => {
    expect(StateMachineMorphismsSource.document).toBe("StateMachineMorphisms");
    expect(StateMachineMorphismsSource.conformsTo).toBe("adk:MorphismDocument/1.0");
    expect(StateMachineMorphismsSource.morphisms.step.impl.kind).toBe("algebra");
    expect(StateMachineMorphismsSource.morphisms.verifyInvariants.impl.kind).toBe("algebra");
  });

  test("bootstrap registers STATE_MACHINE_MORPHISMS_M1", () => {
    expect(BOOTSTRAP_INDEX.get(STATE_MACHINE_MORPHISMS_M1.id)).toBe(STATE_MACHINE_MORPHISMS_M1);
  });

  test("constructor registers the four public morphisms into the registry", () => {
    const ak = AlgebraicKernel.create();
    new StateMachineEngine(ak);
    for (const id of [
      "morphism://adk/step/1.0",
      "morphism://adk/run/1.0",
      "morphism://adk/reachableStates/1.0",
      "morphism://adk/verifyInvariants/1.0",
    ]) {
      expect(ak.morphisms.resolve(id).id).toBe(id);
    }
  });

  test("trivial machine round-trips through the algebra facade", () => {
    const ak = AlgebraicKernel.create();
    const engine = new StateMachineEngine(ak);
    const stateType = ak.defineUnion("MiniState", "1.0", [
      { type: "object", properties: { status: { const: "idle" } }, required: ["status"] },
      { type: "object", properties: { status: { const: "done" } }, required: ["status"] },
    ]);
    const eventType = ak.defineUnion("MiniEvent", "1.0", [
      { type: "object", properties: { verb: { const: "finish" } }, required: ["verb"] },
    ]);
    engine.define({
      id: "mini",
      name: "Mini",
      stateType,
      eventType,
      initialState: { status: "idle" },
      transitions: [
        {
          from: { kind: "record", fields: { status: { kind: "const", value: "idle" } } },
          event: { kind: "record", fields: { verb: { kind: "const", value: "finish" } } },
          to: { op: "const", value: { status: "done" } },
          label: "finish",
        },
      ],
    });
    expect(engine.step("mini", { status: "idle" }, { verb: "finish" })).toMatchObject({
      success: true,
      newState: { status: "done" },
    });
  });
});
