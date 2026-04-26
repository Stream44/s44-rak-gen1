import { readFileSync } from "fs";
import { MetaLevel, type JsonSchema, type TypeDef } from "../L01-foundation/types.ts";
import { registerBootstrapType } from "../L03-tower/bootstrap.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import type { MorphismDocumentM1 } from "../L02-metamodels/morphism-document-adapter.ts";
import { MORPHISM_DOCUMENT_ID } from "../L02-metamodels/morphism-document.ts";

type RawStateMachineMorphisms = {
  document: string;
  version: string | number;
  conformsTo: string;
  discriminator: string;
  origin: string;
  morphisms: Record<string, { id: string; input: string; output: string; impl: { kind: string } }>;
};

const RECORD_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";
const COLLECTION_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/collection/1.0";

export const STATE_MACHINE_MORPHISMS_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/StateMachineMorphisms/1.0",
  level: MetaLevel.Model,
  conformsTo: MORPHISM_DOCUMENT_ID,
  name: "StateMachineMorphisms",
  version: "1.0",
  description: "Co-located M1 instance for the state-machine morphism document.",
  schema: {
    type: "object",
    required: ["document", "version", "conformsTo", "discriminator", "origin", "morphisms"],
    properties: {
      document: { type: "string", const: "StateMachineMorphisms" },
      version: { type: "string", const: "1.0" },
      conformsTo: { type: "string", const: "adk:MorphismDocument/1.0" },
      discriminator: { type: "string", const: "state-machine" },
      origin: { type: "string", const: "adk" },
      morphisms: {
        type: "object",
        required: ["step", "run", "reachableStates", "verifyInvariants"],
        properties: {
          step: { type: "object" },
          run: { type: "object" },
          reachableStates: { type: "object" },
          verifyInvariants: { type: "object" },
        },
      },
    },
  },
};

registerBootstrapType(STATE_MACHINE_MORPHISMS_M1);

export const StateMachineMorphismsSource = Bun.YAML.parse(
  readFileSync(new URL("./state-machine.model.yaml", import.meta.url), "utf-8"),
) as RawStateMachineMorphisms;

validateStateMachineSource(StateMachineMorphismsSource);

export function buildStateMachineRegistryDoc(): MorphismDocumentM1 {
  const origin = StateMachineMorphismsSource.origin;
  return {
    id: STATE_MACHINE_MORPHISMS_M1.id,
    level: MetaLevel.Model,
    conformsTo: MORPHISM_DOCUMENT_ID,
    schema: STATE_MACHINE_MORPHISMS_M1.schema,
    discriminator: StateMachineMorphismsSource.discriminator,
    name: "StateMachineMorphisms",
    version: "1.0",
    morphisms: Object.fromEntries(
      Object.entries(StateMachineMorphismsSource.morphisms).map(([name, entry]) => [
        name,
        {
          ...entry,
          id: `morphism://${origin}/${name}/1.0`,
          impl: entry.impl as MorphismDocumentM1["morphisms"][string]["impl"],
        },
      ]),
    ),
  };
}

const RUNTIME_TYPES: TypeDef[] = [
  recordType(
    "type://adk/StepInput/1.0",
    "StepInput",
    {
      machine: { type: "object" },
      currentState: {},
      event: {},
    },
    ["machine", "currentState", "event"],
  ),
  recordType(
    "type://adk/StepResult/1.0",
    "StepResult",
    {
      success: { type: "boolean" },
      newState: {},
      matchedTransitionLabel: { type: "string" },
      error: { type: "string" },
    },
    ["success"],
  ),
  recordType(
    "type://adk/RunInput/1.0",
    "RunInput",
    {
      machine: { type: "object" },
      initialState: {},
      events: { type: "array", items: {} },
    },
    ["machine", "initialState", "events"],
  ),
  recordType(
    "type://adk/RunResult/1.0",
    "RunResult",
    {
      finalState: {},
      trace: { type: "array", items: {} },
      steps: { type: "integer" },
      halted: { type: "boolean" },
    },
    ["finalState", "trace", "steps", "halted"],
  ),
  recordType(
    "type://adk/ReachableStatesInput/1.0",
    "ReachableStatesInput",
    {
      machine: { type: "object" },
      iterationRange: { type: "array", items: {} },
    },
    ["machine", "iterationRange"],
  ),
  collectionType("type://adk/StateArray/1.0", "StateArray"),
  recordType(
    "type://adk/VerifyInput/1.0",
    "VerifyInput",
    {
      machine: { type: "object" },
      iterationRange: { type: "array", items: {} },
    },
    ["machine", "iterationRange"],
  ),
  recordType(
    "type://adk/VerifyResult/1.0",
    "VerifyResult",
    {
      allHold: { type: "boolean" },
      violations: { type: "array", items: {} },
    },
    ["allHold", "violations"],
  ),
];

export function ensureStateMachineMorphismTypes(kernel: AlgebraicKernel): void {
  for (const typeDef of RUNTIME_TYPES) {
    try {
      kernel.resolveType(typeDef.id);
    } catch {
      kernel.defineType(typeDef);
    }
  }
}

function recordType(
  id: string,
  name: string,
  properties: Record<string, JsonSchema>,
  required: string[],
): TypeDef {
  return {
    id,
    level: MetaLevel.Model,
    conformsTo: RECORD_M2,
    name,
    version: "1.0",
    schema: { type: "object", properties, required, additionalProperties: true },
  };
}

function collectionType(id: string, name: string): TypeDef {
  return {
    id,
    level: MetaLevel.Model,
    conformsTo: COLLECTION_M2,
    name,
    version: "1.0",
    schema: { type: "array", items: {} },
  };
}

function validateStateMachineSource(doc: RawStateMachineMorphisms): void {
  if (doc.document !== "StateMachineMorphisms") {
    throw new Error(`StateMachine morphism document mismatch: ${String(doc.document)}`);
  }
  if (Number(doc.version) !== 1) {
    throw new Error(`StateMachine morphism version mismatch: ${String(doc.version)}`);
  }
  if (doc.conformsTo !== "adk:MorphismDocument/1.0") {
    throw new Error(`StateMachine morphism conformsTo mismatch: ${String(doc.conformsTo)}`);
  }
  if (doc.discriminator !== "state-machine") {
    throw new Error(`StateMachine morphism discriminator mismatch: ${String(doc.discriminator)}`);
  }
  if (doc.origin !== "adk") {
    throw new Error(`StateMachine morphism origin mismatch: ${String(doc.origin)}`);
  }
  for (const key of ["step", "run", "reachableStates", "verifyInvariants"]) {
    if (doc.morphisms?.[key]?.impl?.kind !== "algebra") {
      throw new Error(`StateMachine morphism ${key} must be algebra`);
    }
  }
}
