import { MetaLevel } from "../../L01-foundation/types.ts";
import {
  SPECIALISATION_RULE_METAMODEL,
  defineSpecialisationRule,
} from "../../L02-metamodels/specialisation-rule.ts";

export const GET_FIELD_KNOWN_RULE = defineSpecialisationRule(
  {
    id: "rule://adk/specialise/get-field-known/1.0",
    level: MetaLevel.Model,
    conformsTo: SPECIALISATION_RULE_METAMODEL.id,
    schema: { type: "object" },
    name: "get-field-known",
    version: "1.0",
    matchOp: "GET_FIELD",
    produceOp: "GET_FIELD_KNOWN",
    precondition: "record type exposes a known field offset",
  },
  ({ instruction, constant, fieldOffset, rewrite }) => {
    const field = constant(instruction.operands[1] as number);
    const offset =
      typeof field === "string" ? fieldOffset(instruction.operands[0] as number, field) : null;
    return offset === null || offset < 0
      ? null
      : {
          instructions: [
            rewrite({ operands: [instruction.operands[0] as number, offset] }, { field }),
          ],
        };
  },
);
