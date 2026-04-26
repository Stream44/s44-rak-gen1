import { MetaLevel } from "../../L01-foundation/types.ts";
import {
  SPECIALISATION_RULE_METAMODEL,
  defineSpecialisationRule,
} from "../../L02-metamodels/specialisation-rule.ts";

export const FILTER_RECORD_KNOWN_FIELD_RULE = defineSpecialisationRule(
  {
    id: "rule://adk/specialise/filter-record-known-field/1.0",
    level: MetaLevel.Model,
    conformsTo: SPECIALISATION_RULE_METAMODEL.id,
    schema: { type: "object" },
    name: "filter-record-known-field",
    version: "1.0",
    matchOp: "FILTER",
    produceOp: "FILTER_RECORD_KNOWN_FIELD",
    precondition: "array item type is Record and predicate field is known",
  },
  ({ instruction, isKind, intern, rewrite }) =>
    isKind(instruction.operands[0] as number, "Array") &&
    typeof instruction.predicateField === "string"
      ? {
          instructions: [
            rewrite({
              operands: [instruction.operands[0] as number, intern(instruction.predicateField)],
            }),
          ],
        }
      : null,
);
