import { describe, expect, test } from "bun:test";
import { TypeRegistry } from "../../L03-tower/registry.ts";
import { ALGEBRA_OPERATOR_METAMODEL } from "../../L02-metamodels/algebra-operator.ts";
import { COMPOSE_OPERATOR_M1 } from "./compose.m1.ts";
import { COND_OPERATOR_M1 } from "./cond.m1.ts";
import { EXTEND_OPERATOR_M1 } from "./extend.m1.ts";
import { FMAP_OPERATOR_M1 } from "./fmap.m1.ts";
import { GUARD_OPERATOR_M1 } from "./guard.m1.ts";
import { ITER_OPERATOR_M1 } from "./iter.m1.ts";
import { LITERAL_OPERATOR_M1 } from "./literal.m1.ts";
import { PRODUCT_OPERATOR_M1 } from "./product.m1.ts";
import { REF_OPERATOR_M1 } from "./ref.m1.ts";
import { RESTRICT_OPERATOR_M1 } from "./restrict.m1.ts";
import { SUM_OPERATOR_M1 } from "./sum.m1.ts";

const OPERATORS = [
  [COMPOSE_OPERATOR_M1, 2],
  [PRODUCT_OPERATOR_M1, 2],
  [SUM_OPERATOR_M1, 3],
  [FMAP_OPERATOR_M1, 2],
  [ITER_OPERATOR_M1, 2],
  [COND_OPERATOR_M1, 2],
  [RESTRICT_OPERATOR_M1, 2],
  [EXTEND_OPERATOR_M1, 2],
  [GUARD_OPERATOR_M1, 2],
  [REF_OPERATOR_M1, 1],
  [LITERAL_OPERATOR_M1, 1],
] as const;

describe("AlgebraOperator M1 regressions", () => {
  for (const [operator, arity] of OPERATORS) {
    test(`${operator.name} M1 is registered with expected arity`, () => {
      expect(operator.id).toContain(`/algebra/${operator.name}/1.0`);
      expect(operator.conformsTo).toBe(ALGEBRA_OPERATOR_METAMODEL.id);
      expect(operator.arity).toBe(arity);
      expect(operator.inputKinds).toHaveLength(arity);
    });
  }

  test("registry lists exactly the registered algebra operators", () => {
    const registry = new TypeRegistry();
    expect(registry.listAlgebraOperators()).toHaveLength(OPERATORS.length);
  });
});
