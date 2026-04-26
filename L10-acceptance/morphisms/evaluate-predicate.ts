import { evaluatePredicate } from "../predicate-eval.ts";

export default function evaluatePredicateMorphism(input: {
  expression: string;
  context: Record<string, unknown>;
}): { passed: boolean } {
  return { passed: evaluatePredicate(input.expression, input.context) };
}
