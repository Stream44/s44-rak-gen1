import { MetaLevel, type TypeDef } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";

export const UNFOLD_RULES_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/unfold-rules/1.0",
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/rules-document/1.0",
  name: "UnfoldRules",
  version: "1.0",
  description:
    "M1 instance of adk:RulesDocument/1.0 with discriminator 'unfold'. The runtime shape validated by UnfoldRulesDocument.",
  schema: {
    type: "object",
    required: ["conformsTo", "discriminator", "id", "version", "heuristics"],
    properties: {
      conformsTo: { type: "string", const: "adk:RulesDocument/1.0" },
      discriminator: { type: "string", const: "unfold" },
      id: { type: "string" },
      version: { type: "string" },
      heuristics: { type: "array", minItems: 3, maxItems: 3 },
    },
  },
};

registerBootstrapType(UNFOLD_RULES_M1);
