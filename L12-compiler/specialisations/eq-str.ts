import { MetaLevel } from "../../L01-foundation/types.ts";
import {
  SPECIALISATION_RULE_METAMODEL,
  defineSpecialisationRule,
} from "../../L02-metamodels/specialisation-rule.ts";

export const EQ_STR_RULE = defineSpecialisationRule(
  {
    id: "rule://adk/specialise/eq-str/1.0",
    level: MetaLevel.Model,
    conformsTo: SPECIALISATION_RULE_METAMODEL.id,
    schema: { type: "object" },
    name: "eq-str",
    version: "1.0",
    matchOp: "EQ",
    produceOp: "EQ_STR",
    precondition: "both operands have type: String",
  },
  ({ instruction, isKind, rewrite }) =>
    isKind(instruction.operands[0] as number, "Str") &&
    isKind(instruction.operands[1] as number, "Str")
      ? { instructions: [rewrite()] }
      : null,
);
