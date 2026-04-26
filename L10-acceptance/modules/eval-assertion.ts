import type { Assertion, AssertionResult, StepContext } from "../acceptance.ts";
import { getSurfaceEvaluator } from "../acceptance.ts";
import { getSurfaceEvaluatorResult } from "../surface-evaluators.ts";
import {
  evalCount,
  evalErrorExpected,
  evalPredicate,
  evalStateExpression,
} from "./eval-assertion-kinds.ts";

export default async function evalAssertion(input: {
  assertion: Assertion;
  ctx: StepContext;
}): Promise<AssertionResult> {
  const { assertion, ctx } = input;
  switch (assertion.kind) {
    case "state-equals":
      return (await ctx.kernel.morphisms.evaluate("morphism://adk/evalAssertionStateEquals/1.0", {
        actual: ctx.getState(assertion.targetKey),
        expected: assertion.expected,
      })) as AssertionResult;
    case "state-field-match":
      return (await ctx.kernel.morphisms.evaluate(
        "morphism://adk/evalAssertionStateFieldMatch/1.0",
        {
          actual: ctx.getState(assertion.targetKey),
          fields: assertion.fields,
        },
      )) as AssertionResult;
    case "event-emitted":
      return (await ctx.kernel.morphisms.evaluate("morphism://adk/evalAssertionEventEmitted/1.0", {
        events: ctx.capturedEvents,
        targetKey: assertion.targetKey,
        newStateFields: assertion.newStateFields,
      })) as AssertionResult;
    case "error-expected":
      return evalErrorExpected(assertion, ctx);
    case "predicate":
      return evalPredicate(assertion, ctx);
    case "state":
      return evalStateExpression(assertion, ctx);
    case "count":
    case "countFiltered":
      return await evalCount(assertion, ctx);
    case "projector-node":
    case "api-response":
    case "cli-output":
      return await getSurfaceEvaluatorResult(assertion, ctx, getSurfaceEvaluator);
  }
}
