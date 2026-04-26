import { MetaLevel } from "../../L01-foundation/types.ts";
import {
  SPECIALISATION_RULE_METAMODEL,
  defineSpecialisationRule,
} from "../../L02-metamodels/specialisation-rule.ts";

export const LEN_ARR_RULE = defineSpecialisationRule(
  {
    id: "rule://adk/specialise/len-arr/1.0",
    level: MetaLevel.Model,
    conformsTo: SPECIALISATION_RULE_METAMODEL.id,
    schema: { type: "object" },
    name: "len-arr",
    version: "1.0",
    matchOp: "LEN",
    produceOp: "LEN_ARR",
    precondition: "operand has type: Array",
  },
  ({ instruction, isKind, rewrite }) =>
    isKind(instruction.operands[0] as number, "Array") ? { instructions: [rewrite()] } : null,
);
