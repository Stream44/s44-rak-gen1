import { MetaLevel } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";
import {
  ALGEBRA_OPERATOR_METAMODEL,
  type AlgebraOperatorM1,
} from "../../L02-metamodels/algebra-operator.ts";

export const COMPOSE_OPERATOR_M1: AlgebraOperatorM1 = {
  id: "operator://adk/algebra/compose/1.0",
  level: MetaLevel.Model,
  conformsTo: ALGEBRA_OPERATOR_METAMODEL.id,
  schema: { type: "object" },
  name: "compose",
  version: "1.0",
  arity: 2,
  inputKinds: ["Morphism", "Morphism"],
  outputKind: "Morphism",
  laws: ["assoc", "id-left", "id-right"],
};
registerBootstrapType(COMPOSE_OPERATOR_M1);
