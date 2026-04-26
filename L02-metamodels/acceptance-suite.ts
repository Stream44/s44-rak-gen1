import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";

export const ACCEPTANCE_SUITE_DOCUMENT_ID =
  "type://github.com/Stream44/s44-rak-gen1@1.0/adk/AcceptanceSuiteDocument/1.0" as const;

export const ACCEPTANCE_SUITE_DOCUMENT_M2: TypeDef = {
  id: ACCEPTANCE_SUITE_DOCUMENT_ID,
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "AcceptanceSuiteDocument",
  version: "1.0",
  description: "Acceptance suite YAML: personas, seeds, use cases, scenarios with step trees.",
  schema: {
    type: "object",
    required: ["useCases"],
    properties: {
      id: { type: "string", minLength: 1 },
      suite: { type: "string", minLength: 1 },
      name: { type: "string" },
      model: { type: "string" },
      version: { type: "string" },
      personas: { oneOf: [{ type: "string" }, { type: "array", items: { type: "object" } }] },
      seeds: { oneOf: [{ type: "string" }, { type: "array", items: { type: "object" } }] },
      useCases: { type: "array", items: { type: "object" } },
    },
  },
};

export interface AcceptanceSuiteDocumentM1 {
  id?: string;
  suite?: string;
  name?: string;
  model?: string;
  version?: string;
  personas?: string | object[];
  seeds?: string | object[];
  useCases: object[];
}

export function validateAcceptanceSuiteDocument(doc: AcceptanceSuiteDocumentM1): void {
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    throw new Error("AcceptanceSuiteDocument must be an object");
  if (!doc.id && !doc.suite)
    throw new Error('AcceptanceSuiteDocument: either "id" or "suite" must be set');
  if (doc.model !== undefined && typeof doc.model !== "string")
    throw new Error('AcceptanceSuiteDocument: "model" must be a string');
  if (doc.version !== undefined && typeof doc.version !== "string")
    throw new Error('AcceptanceSuiteDocument: "version" must be a string');
  if (
    doc.personas !== undefined &&
    typeof doc.personas !== "string" &&
    !Array.isArray(doc.personas)
  )
    throw new Error('AcceptanceSuiteDocument: "personas" must be a string or array');
  if (doc.seeds !== undefined && typeof doc.seeds !== "string" && !Array.isArray(doc.seeds))
    throw new Error('AcceptanceSuiteDocument: "seeds" must be a string or array');
  if (!Array.isArray(doc.useCases) || doc.useCases.length === 0)
    throw new Error("AcceptanceSuiteDocument: useCases must be a non-empty array");
}
