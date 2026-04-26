import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { MetaLevel } from "../L01-foundation/types.ts";
import { BOOTSTRAP_INDEX } from "../L03-tower/bootstrap.ts";
import { MORPHISM_DOCUMENT_ID } from "../L02-metamodels/morphism-document.ts";
import { ACCEPTANCE_MORPHISMS_M1, buildAcceptanceLiftDocuments } from "./m1.ts";

const doc = Bun.YAML.parse(
  readFileSync(new URL("./acceptance.model.yaml", import.meta.url), "utf-8"),
) as {
  conformsTo: string;
  discriminator: string;
  morphisms: Record<string, { impl: { kind: string; uri?: string } }>;
};

const liftDocs = buildAcceptanceLiftDocuments();

async function evaluateViaRegistry(
  ak: { morphisms: { evaluate: (id: string, input: Record<string, unknown>) => Promise<unknown> } },
  input: Record<string, unknown>,
): Promise<unknown> {
  return await ak.morphisms.evaluate("morphism://adk/runStep/1.0", input);
}

describe("Acceptance morphism registration", () => {
  test("M2 registered", () => {
    const typeDef = BOOTSTRAP_INDEX.get(MORPHISM_DOCUMENT_ID);
    expect(BOOTSTRAP_INDEX.has(MORPHISM_DOCUMENT_ID)).toBe(true);
    expect(typeDef?.level).toBe(MetaLevel.Metamodel);
    expect(typeDef?.name).toBe("MorphismDocument");
    expect(typeDef?.schema.required).toContain("morphisms");
  });

  test("M1 conforms to M2", () => {
    expect(ACCEPTANCE_MORPHISMS_M1.conformsTo).toBe(MORPHISM_DOCUMENT_ID);
    expect(ACCEPTANCE_MORPHISMS_M1.level).toBe(MetaLevel.Model);
  });

  test("YAML parses and declares five morphisms", () => {
    expect(doc.conformsTo).toBe("adk:MorphismDocument/1.0");
    expect(doc.discriminator).toBe("acceptance");
    expect(Object.keys(doc.morphisms).sort()).toEqual([
      "runScenario",
      "runStep",
      "runSuite",
      "runTrace",
      "runUseCase",
    ]);
  });

  test("Impl kinds per spec", () => {
    expect(doc.morphisms.runStep.impl.kind).toBe("module");
    expect(doc.morphisms.runTrace.impl.kind).toBe("algebra");
    expect(doc.morphisms.runScenario.impl.kind).toBe("algebra");
    expect(doc.morphisms.runUseCase.impl.kind).toBe("module");
    expect(doc.morphisms.runSuite.impl.kind).toBe("module");
    for (const name of ["runStep", "runUseCase", "runSuite"] as const) {
      expect(doc.morphisms[name].impl.uri?.startsWith("module://./modules/")).toBe(true);
    }
  });

  test("Module leaves importable", async () => {
    expect(typeof (await import("./modules/run-step.ts")).default).toBe("function");
    expect(typeof (await import("./modules/apply-seed.ts")).default).toBe("function");
    expect(typeof (await import("./modules/eval-assertion.ts")).default).toBe("function");
  });

  test("Registry dispatch contract stays awaitable", async () => {
    const result = await evaluateViaRegistry(
      {
        morphisms: {
          evaluate: async (_id, input) => input.stepId ?? null,
        },
      },
      { stepId: "step-confirm" },
    );
    expect(result).toBe("step-confirm");
  });

  test("Acceptance lift YAMLs are present and module-backed", () => {
    expect(liftDocs).toHaveLength(6);
    expect(liftDocs.every((entry) => entry.discriminator === "acceptance")).toBe(true);
    expect(
      liftDocs
        .flatMap((entry) => Object.values(entry.morphisms).map((morphism) => morphism.id))
        .sort(),
    ).toEqual(
      [
        "morphism://adk/evalAssertionEventEmitted/1.0",
        "morphism://adk/evalAssertionStateEquals/1.0",
        "morphism://adk/evalAssertionStateFieldMatch/1.0",
        "morphism://adk/evaluatePredicate/1.0",
        "morphism://adk/extractTraces/1.0",
        "morphism://adk/resolveMacrosInStep/1.0",
      ].sort(),
    );
    for (const morphism of liftDocs.flatMap((entry) => Object.values(entry.morphisms))) {
      expect(morphism.impl.kind).toBe("module");
      expect(morphism.impl.uri?.startsWith("module://adk/L10-acceptance/morphisms/")).toBe(true);
    }
  });
});
