import { MetaLevel } from "../../L01-foundation/types.ts";
import {
  SPECIALISATION_RULE_METAMODEL,
  defineSpecialisationRule,
} from "../../L02-metamodels/specialisation-rule.ts";

export const LT_INT_RULE = defineSpecialisationRule(
  {
    id: "rule://adk/specialise/lt-int/1.0",
    level: MetaLevel.Model,
    conformsTo: SPECIALISATION_RULE_METAMODEL.id,
    schema: { type: "object" },
    name: "lt-int",
    version: "1.0",
    matchOp: "LT",
    produceOp: "LT_INT",
    precondition: "both operands have type: Int",
  },
  ({ instruction, isKind, rewrite }) =>
    isKind(instruction.operands[0] as number, "Int") &&
    isKind(instruction.operands[1] as number, "Int")
      ? { instructions: [rewrite()] }
      : null,
);
