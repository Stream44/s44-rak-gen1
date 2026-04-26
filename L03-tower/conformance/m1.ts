import { MetaLevel, type TypeDef } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../bootstrap.ts";

export const CONFORMANCE_RULES_M1: TypeDef = {
  id: "adk:ConformanceRules/1.0",
  level: MetaLevel.Model,
  conformsTo: "adk:RulesDocument/1.0",
  name: "ConformanceRules",
  version: "1.0",
  description: "M1 instance of adk:RulesDocument/1.0 with discriminator 'conformance'.",
  schema: {
    type: "object",
    required: ["conformsTo", "discriminator", "rules"],
    properties: {
      conformsTo: { type: "string", const: "adk:RulesDocument/1.0" },
      discriminator: { type: "string", const: "conformance" },
      sealed: { type: "boolean" },
      rules: { type: "array" },
    },
  },
};

registerBootstrapType(CONFORMANCE_RULES_M1);
