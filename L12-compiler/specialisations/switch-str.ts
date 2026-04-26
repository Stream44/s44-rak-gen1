import { MetaLevel } from "../../L01-foundation/types.ts";
import {
  SPECIALISATION_RULE_METAMODEL,
  defineSpecialisationRule,
} from "../../L02-metamodels/specialisation-rule.ts";

export const SWITCH_STR_RULE = defineSpecialisationRule(
  {
    id: "rule://adk/specialise/switch-str/1.0",
    level: MetaLevel.Model,
    conformsTo: SPECIALISATION_RULE_METAMODEL.id,
    schema: { type: "object" },
    name: "switch-str",
    version: "1.0",
    matchOp: "EQ_STR",
    produceOp: "SWITCH_STR",
    precondition:
      "consecutive EQ_STR/JUMP_IF_FALSE pairs compare one scrutinee against string cases",
  },
  ({ at, cir, constant, intern, rewrite }) => {
    const pairs = [];
    let i = at,
      scrutinee = -1;
    while (
      cir.instructions[i]?.op === "EQ_STR" &&
      cir.instructions[i + 1]?.op === "JUMP_IF_FALSE"
    ) {
      const eq = cir.instructions[i]!,
        jump = cir.instructions[i + 1]!;
      scrutinee = scrutinee < 0 ? (eq.operands[0] as number) : scrutinee;
      if (scrutinee !== eq.operands[0]) break;
      pairs.push({ value: constant(eq.operands[1] as number), target: jump.operands[1] });
      i += 2;
    }
    return pairs.length < 2
      ? null
      : {
          instructions: [rewrite({ operands: [scrutinee, intern(pairs)] })],
          skip: pairs.length * 2 - 1,
        };
  },
);
