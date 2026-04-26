import { MetaLevel } from "../../L01-foundation/types.ts";
import {
  SPECIALISATION_RULE_METAMODEL,
  defineSpecialisationRule,
} from "../../L02-metamodels/specialisation-rule.ts";

export const MATCH_KNOWN_RULE = defineSpecialisationRule(
  {
    id: "rule://adk/specialise/match-known/1.0",
    level: MetaLevel.Model,
    conformsTo: SPECIALISATION_RULE_METAMODEL.id,
    schema: { type: "object" },
    name: "match-known",
    version: "1.0",
    matchOp: "MATCH",
    produceOp: "MATCH_KNOWN",
    precondition: "scrutinee has enum type and case values are known",
  },
  ({ instruction, regType, intern, rewrite }) =>
    regType(instruction.operands[0] as number)?.kind === "Enum" &&
    Array.isArray(instruction.operands[1])
      ? {
          instructions: [
            rewrite({
              operands: [instruction.operands[0] as number, intern(instruction.operands[1])],
            }),
          ],
        }
      : null,
);
