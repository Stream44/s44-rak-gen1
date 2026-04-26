import { registerBootstrapType } from "../L03-tower/bootstrap.ts";
import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";

export const M2_URI_ALIAS: Record<string, string> = {
  "adk:RulesDocument/1.0": "type://github.com/Stream44/s44-rak-gen1@1.0/rules-document/1.0",
};

export const RULES_DOCUMENT_M2: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/rules-document/1.0",
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "RulesDocument",
  version: "1.0",
  description:
    "Shared M2 for extension-shaped rule-sets (UnfoldRules, ConformanceRules, CompatibilityRules).",
  schema: {
    type: "object",
    required: ["conformsTo", "discriminator", "id", "version", "heuristics"],
    properties: {
      conformsTo: { type: "string", const: "adk:RulesDocument/1.0" },
      discriminator: {
        type: "string",
        enum: ["unfold", "conformance", "compatibility"],
      },
      id: { type: "string" },
      version: { type: "string" },
      heuristics: { type: "array" },
    },
  },
};

export const M2_RULES_DOCUMENT = RULES_DOCUMENT_M2;

registerBootstrapType(RULES_DOCUMENT_M2);
