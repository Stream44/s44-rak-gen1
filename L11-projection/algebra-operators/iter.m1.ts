import { MetaLevel } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";
import {
  ALGEBRA_OPERATOR_METAMODEL,
  type AlgebraOperatorM1,
} from "../../L02-metamodels/algebra-operator.ts";

/**
 * YAML author surface:
 * iter:
 *   for: { op: get, path: "$bind.runtime.morphisms" }
 *   as: morphism
 *   body: { kind: Card, children: [...] }
 *   emptyFallback: { kind: EmptyState, message: "No morphisms registered." }
 *
 * `emptyFallback` is an optional named slot. Runtime AST keeps the existing
 * positional inputs (`for`, `template`) for backward-compat; `body` is
 * accepted by the compiler as an author-facing alias for `template`.
 */
export const ITER_OPERATOR_M1: AlgebraOperatorM1 = {
  id: "operator://adk/algebra/iter/1.0",
  level: MetaLevel.Model,
  conformsTo: ALGEBRA_OPERATOR_METAMODEL.id,
  schema: {
    type: "object",
    properties: {
      emptyFallback: {
        description: "Optional named node rendered when `for` resolves to an empty array.",
      },
    },
  },
  name: "iter",
  version: "1.0",
  arity: 2,
  inputKinds: ["Binding", "Morphism"],
  outputKind: "Array",
};
registerBootstrapType(ITER_OPERATOR_M1);
