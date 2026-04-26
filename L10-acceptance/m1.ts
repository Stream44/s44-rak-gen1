import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";
import { createLocalModuleResolver } from "../L11-projection/module-loader.ts";
import { AlgebraicKernel, type AlgebraicKernelOptions } from "../L13-facade/index.ts";
import { MORPHISM_DOCUMENT_ID } from "../L02-metamodels/morphism-document.ts";
import {
  registerMorphismDocument,
  type MorphismDocumentM1,
} from "../L02-metamodels/morphism-document-adapter.ts";

export const ACCEPTANCE_MORPHISMS_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/AcceptanceMorphisms/1.0",
  level: MetaLevel.Model,
  conformsTo: MORPHISM_DOCUMENT_ID,
  name: "AcceptanceMorphisms",
  version: "1.0",
  description: "Co-located M1 instance for the Acceptance slot of MorphismDocument.",
  schema: {
    type: "object",
    required: ["discriminator", "morphisms"],
    properties: {
      discriminator: { type: "string", const: "acceptance" },
      morphisms: {
        type: "object",
        required: ["runStep", "runTrace", "runScenario", "runUseCase", "runSuite"],
        properties: {
          runStep: { type: "object" },
          runTrace: { type: "object" },
          runScenario: { type: "object" },
          runUseCase: { type: "object" },
          runSuite: { type: "object" },
        },
      },
    },
  },
};

export function buildAcceptanceRuntimeDocument(): MorphismDocumentM1 {
  const doc = Bun.YAML.parse(
    readFileSync(new URL("./acceptance.model.yaml", import.meta.url), "utf-8"),
  ) as MorphismDocumentM1;
  return {
    ...doc,
    conformsTo: MORPHISM_DOCUMENT_ID,
  };
}

export function buildAcceptanceLiftDocuments(): MorphismDocumentM1[] {
  const dir = new URL("./morphisms/", import.meta.url);
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".yaml"))
    .sort()
    .map((entry) => {
      const doc = Bun.YAML.parse(
        readFileSync(new URL(`./morphisms/${entry}`, import.meta.url), "utf-8"),
      ) as MorphismDocumentM1 & { schema?: { morphisms?: MorphismDocumentM1["morphisms"] } };
      return {
        ...doc,
        morphisms: doc.morphisms ?? doc.schema?.morphisms ?? {},
      };
    });
}

function ensureScalar(
  kernel: AlgebraicKernel,
  typeRef: string,
  name: string,
  version: string,
  schema: Record<string, unknown>,
): void {
  try {
    kernel.resolveType(typeRef);
  } catch {
    kernel.defineType({
      id: typeRef,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0",
      schema,
      name,
      version,
    });
  }
}

function ensureAcceptanceLiftTypes(kernel: AlgebraicKernel): void {
  ensureScalar(kernel, "type://adk/StepContext/0.1.0", "StepContext", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/StepResult/0.1.0", "StepResult", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/Trace/0.1.0", "Trace", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/TraceResult/0.1.0", "TraceResult", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/Scenario/0.1.0", "Scenario", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/ScenarioResult/0.1.0", "ScenarioResult", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/UseCaseBoot/0.1.0", "UseCaseBoot", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/UseCaseResult/0.1.0", "UseCaseResult", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/SuiteBoot/0.1.0", "SuiteBoot", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(kernel, "type://adk/SuiteResult/0.1.0", "SuiteResult", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(
    kernel,
    "type://adk/AcceptancePredicateEvaluationInput/0.1.0",
    "AcceptancePredicateEvaluationInput",
    "0.1.0",
    {
      type: "object",
      required: ["expression", "context"],
      properties: {
        expression: { type: "string" },
        context: { type: "object", additionalProperties: true },
      },
      additionalProperties: false,
    },
  );
  ensureScalar(
    kernel,
    "type://adk/AcceptancePredicateEvaluationOutput/0.1.0",
    "AcceptancePredicateEvaluationOutput",
    "0.1.0",
    {
      type: "object",
      required: ["passed"],
      properties: {
        passed: { type: "boolean" },
      },
      additionalProperties: false,
    },
  );
  ensureScalar(
    kernel,
    "type://adk/AcceptanceTraceExtractionInput/0.1.0",
    "AcceptanceTraceExtractionInput",
    "0.1.0",
    {
      type: "object",
      required: ["rootStep"],
      properties: {
        rootStep: { type: "object", additionalProperties: true },
        budget: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  );
  ensureScalar(kernel, "type://adk/AcceptanceTraceArray/0.1.0", "AcceptanceTraceArray", "0.1.0", {
    type: "array",
    items: { type: "object", additionalProperties: true },
  });
  ensureScalar(
    kernel,
    "type://adk/AcceptanceMacroResolutionInput/0.1.0",
    "AcceptanceMacroResolutionInput",
    "0.1.0",
    {
      type: "object",
      required: ["step"],
      properties: {
        step: { type: "object", additionalProperties: true },
        lastCreatedKey: { type: ["string", "null"] },
      },
      additionalProperties: false,
    },
  );
  ensureScalar(kernel, "type://adk/AcceptanceStep/0.1.0", "AcceptanceStep", "0.1.0", {
    type: "object",
    additionalProperties: true,
  });
  ensureScalar(
    kernel,
    "type://adk/AcceptanceStateEqualsAssertionInput/0.1.0",
    "AcceptanceStateEqualsAssertionInput",
    "0.1.0",
    {
      type: "object",
      required: ["actual"],
      properties: {
        actual: {},
        expected: {},
      },
      additionalProperties: false,
    },
  );
  ensureScalar(
    kernel,
    "type://adk/AcceptanceStateFieldMatchAssertionInput/0.1.0",
    "AcceptanceStateFieldMatchAssertionInput",
    "0.1.0",
    {
      type: "object",
      required: ["actual", "fields"],
      properties: {
        actual: {},
        fields: { type: "object", additionalProperties: true },
      },
      additionalProperties: false,
    },
  );
  ensureScalar(
    kernel,
    "type://adk/AcceptanceEventEmittedAssertionInput/0.1.0",
    "AcceptanceEventEmittedAssertionInput",
    "0.1.0",
    {
      type: "object",
      required: ["events", "targetKey"],
      properties: {
        events: { type: "array", items: { type: "object", additionalProperties: true } },
        targetKey: { type: "string" },
        newStateFields: { type: "object", additionalProperties: true },
      },
      additionalProperties: false,
    },
  );
  ensureScalar(
    kernel,
    "type://adk/AcceptanceAssertionResult/0.1.0",
    "AcceptanceAssertionResult",
    "0.1.0",
    {
      type: "object",
      required: ["kind", "passed", "expected", "actual"],
      properties: {
        kind: { type: "string" },
        passed: { type: "boolean" },
        expected: { type: "string" },
        actual: { type: "string" },
      },
      additionalProperties: false,
    },
  );
}

export function registerAcceptanceMorphismDocument(kernel: AlgebraicKernel): void {
  ensureAcceptanceLiftTypes(kernel);
  registerMorphismDocument(buildAcceptanceRuntimeDocument(), kernel);
  for (const doc of buildAcceptanceLiftDocuments()) {
    registerMorphismDocument(doc, kernel);
  }
}

let acceptanceKernelSingleton: AlgebraicKernel | null = null;

export function getAcceptanceMorphismKernel(opts?: AlgebraicKernelOptions): AlgebraicKernel {
  if (acceptanceKernelSingleton) return acceptanceKernelSingleton;
  const kernel = AlgebraicKernel.create(opts);
  kernel.morphisms.registerModuleResolver(createLocalModuleResolver(resolve(import.meta.dir)));
  registerAcceptanceMorphismDocument(kernel);
  acceptanceKernelSingleton = kernel;
  return kernel;
}
