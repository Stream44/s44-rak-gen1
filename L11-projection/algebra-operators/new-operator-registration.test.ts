import { describe, expect, test } from "bun:test";
import { MetaLevel } from "../../L01-foundation/types.ts";
import { TypeRegistry } from "../../L03-tower/registry.ts";
import {
  type AlgebraOperatorM1,
  ALGEBRA_OPERATOR_METAMODEL,
} from "../../L02-metamodels/algebra-operator.ts";
import { evaluateMorphism, registerOperatorImpl, type InterpreterContext } from "../algebra.ts";

const TEST_OPERATOR_M1: AlgebraOperatorM1 = {
  id: "operator://adk/algebra/__test_alt__/1.0",
  level: MetaLevel.Model,
  conformsTo: ALGEBRA_OPERATOR_METAMODEL.id,
  schema: { type: "object" },
  name: "__test_alt__",
  version: "1.0",
  arity: 2,
  inputKinds: ["Morphism", "Morphism"],
  outputKind: "Morphism",
};
const withOperator = () => {
  const registry = new TypeRegistry();
  registry.defineType(TEST_OPERATOR_M1);
  return registry;
};
const ctx = (operatorRegistry: TypeRegistry): InterpreterContext => ({
  bindings: new Map(),
  props: {},
  route: { path: "/", params: {}, query: {} },
  currentUser: { id: "u", capabilities: {} },
  operatorRegistry,
});
const node = (args: unknown[]) => ({ op: "__test_alt__", args });

describe("new operator registration", () => {
  test("registers the synthetic M1 in listAlgebraOperators", () => {
    expect(
      withOperator()
        .listAlgebraOperators()
        .some((entry) => entry.name === TEST_OPERATOR_M1.name),
    ).toBe(true);
  });

  test("registered operator without implementation raises a clear error", () => {
    expect(() => evaluateMorphism(node([1, 2]) as never, ctx(withOperator()))).toThrow(
      "operator `__test_alt__` registered but has no implementation",
    );
  });

  test("registered M1 plus implementation dispatches successfully", () => {
    const restore = registerOperatorImpl("__test_alt__", (_ctx, current) => ({
      ok: true,
      args: (current as { args: unknown[] }).args.length,
    }));
    try {
      expect(evaluateMorphism(node(["a", "b"]) as never, ctx(withOperator()))).toEqual({
        ok: true,
        args: 2,
      });
    } finally {
      restore();
    }
  });

  test("removing the M1 registration makes dispatch fail again", () => {
    expect(() => evaluateMorphism(node([1, 2]) as never, ctx(new TypeRegistry()))).toThrow(
      /unknown operator `__test_alt__`/,
    );
  });

  test("arity mismatch names the expected arity", () => {
    const restore = registerOperatorImpl("__test_alt__", () => "unused");
    try {
      expect(() => evaluateMorphism(node([1, 2, 3]) as never, ctx(withOperator()))).toThrow(
        /expected arity 2 but received 3/,
      );
    } finally {
      restore();
    }
  });
});
