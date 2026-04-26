import { describe, expect, test } from "bun:test";
import { AlgebraicKernel } from "../../L13-facade/index.ts";
import type { ActionType } from "../../L07-agency/intent.ts";
import { DemandEngine, MemoryDataProvider } from "../demand.ts";
import { DemandMorphisms } from "./m1.ts";

function makeAction(overrides?: Partial<ActionType>): ActionType {
  return {
    id: "action://test/LoadCustomer/1.0",
    name: "LoadCustomer",
    version: "1.0",
    verb: "load",
    targetMachine: "customer-lifecycle",
    inputSchema: {
      type: "object",
      properties: { customer: { type: "string", $typeRef: "type://Customer/1.0" } },
      required: ["customer"],
    },
    preconditions: [],
    ...overrides,
  };
}

describe("Demand morphism registration", () => {
  test("loads demand.model.yaml and validates the demand document", () => {
    expect(DemandMorphisms.conformsTo).toBe("adk:MorphismDocument/1.0");
    expect(DemandMorphisms.morphisms.survey.impl.kind).toBe("algebra");
  });

  test("survey algebra delegates to the precondition collector module leaf", () => {
    expect(DemandMorphisms.morphisms.collectPreconditionRequirements.impl.kind).toBe("module");
    expect(
      DemandMorphisms.morphisms.collectPreconditionRequirements.impl.uri?.endsWith(
        "collect-precondition-requirements.ts",
      ),
    ).toBe(true);
  });

  test("facade survey matches the $typeRef requirement shape", async () => {
    const plan = await new DemandEngine(AlgebraicKernel.create(), new MemoryDataProvider()).survey(
      makeAction(),
      { customer: "cust-001" },
    );
    expect(plan.requirements[0]).toEqual({
      typeRef: "type://Customer/1.0",
      key: "cust-001",
      optional: false,
    });
  });

  test("facade survey stays empty when the action has no $typeRef fields", async () => {
    const action = makeAction({
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    });
    const plan = await new DemandEngine(AlgebraicKernel.create(), new MemoryDataProvider()).survey(
      action,
      { name: "hello" },
    );
    expect(plan.requirements.length).toBe(0);
    expect(plan.estimatedCount).toBe(0);
  });
});
