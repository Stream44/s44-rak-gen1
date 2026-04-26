import { describe, expect, test } from "bun:test";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import { M3_META } from "../L03-tower/bootstrap.ts";
import { ALGEBRA_OPERATOR_METAMODEL } from "./algebra-operator.ts";

describe("AlgebraOperator metamodel", () => {
  test("ALGEBRA_OPERATOR_METAMODEL conforms to M3", () => {
    expect(ALGEBRA_OPERATOR_METAMODEL.conformsTo).toBe(M3_META.id);
  });

  test("metamodel CID is deterministic", () => {
    const encoder = new JsonEncoder();
    expect(encoder.encodeAndHash(ALGEBRA_OPERATOR_METAMODEL).cid).toBe(
      encoder.encodeAndHash(ALGEBRA_OPERATOR_METAMODEL).cid,
    );
  });
});
