import { MetaLevel } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";
import {
  ALGEBRA_OPERATOR_METAMODEL,
  type AlgebraOperatorM1,
} from "../../L02-metamodels/algebra-operator.ts";

export const LITERAL_OPERATOR_M1: AlgebraOperatorM1 = {
  id: "operator://adk/algebra/literal/1.0",
  level: MetaLevel.Model,
  conformsTo: ALGEBRA_OPERATOR_METAMODEL.id,
  schema: { type: "object" },
  name: "literal",
  version: "1.0",
  arity: 1,
  inputKinds: ["Value"],
  outputKind: "Literal",
};
registerBootstrapType(LITERAL_OPERATOR_M1);
