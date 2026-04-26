import { MetaLevel } from "../../L01-foundation/types.ts";
import {
  SPECIALISATION_RULE_METAMODEL,
  defineSpecialisationRule,
} from "../../L02-metamodels/specialisation-rule.ts";

export const MAP_INT_INT_RULE = defineSpecialisationRule(
  {
    id: "rule://adk/specialise/map-int-int/1.0",
    level: MetaLevel.Model,
    conformsTo: SPECIALISATION_RULE_METAMODEL.id,
    schema: { type: "object" },
    name: "map-int-int",
    version: "1.0",
    matchOp: "MAP",
    produceOp: "MAP_INT_INT",
    precondition: "callee is Int -> Int",
  },
  ({ instruction, isKind, rewrite }) =>
    isKind(instruction.operands[0] as number, "Array") &&
    (instruction.calleeType as { input?: string; output?: string } | undefined)?.input === "Int" &&
    (instruction.calleeType as { input?: string; output?: string } | undefined)?.output === "Int"
      ? { instructions: [rewrite()] }
      : null,
);
