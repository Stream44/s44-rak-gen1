import type {
  AssertionResult,
  CountAssertion,
  ErrorExpected,
  EventEmitted,
  PredicateAssertion,
  StateEquals,
  StateExpressionAssertion,
  StateFieldMatch,
  StepContext,
} from "../acceptance.ts";
import { deepEqual } from "../acceptance.ts";

const normalizeExpression = (expression: string): string =>
  expression.replaceAll("&&", " and ").replaceAll("||", " or ");

export const evalStateEquals = (assertion: StateEquals, ctx: StepContext): AssertionResult => ({
  kind: assertion.kind,
  passed: deepEqual(ctx.getState(assertion.targetKey), assertion.expected),
  expected: JSON.stringify(assertion.expected),
  actual: JSON.stringify(ctx.getState(assertion.targetKey)),
});
export const evalStateFieldMatch = (
  assertion: StateFieldMatch,
  ctx: StepContext,
): AssertionResult => {
  const state = ctx.getState(assertion.targetKey) as Record<string, unknown> | undefined;
  const actual = !state
    ? "undefined"
    : Object.entries(assertion.fields)
        .filter(([k, v]) => !deepEqual(state[k], v))
        .map(([k, v]) => `${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(state[k])}`)
        .join("; ");
  return {
    kind: assertion.kind,
    passed: !!state && actual.length === 0,
    expected: JSON.stringify(assertion.fields),
    actual: actual || "matched",
  };
};
export const evalEventEmitted = (assertion: EventEmitted, ctx: StepContext): AssertionResult => {
  const matching = ctx.capturedEvents.filter((e) => e.targetKey === assertion.targetKey);
  const passed =
    matching.length > 0 &&
    (!assertion.newStateFields ||
      matching.some((e) =>
        Object.entries(assertion.newStateFields ?? {}).every(([k, v]) =>
          deepEqual((e.newState as Record<string, unknown>)?.[k], v),
        ),
      ));
  return {
    kind: assertion.kind,
    passed,
    expected: assertion.newStateFields
      ? JSON.stringify(assertion.newStateFields)
      : `event for ${assertion.targetKey}`,
    actual: matching.length ? JSON.stringify(matching.map((e) => e.newState)) : "no events",
  };
};
export const evalErrorExpected = (assertion: ErrorExpected, ctx: StepContext): AssertionResult => {
  const error = ctx.result.error ?? "";
  const passed = assertion.messageContains
    ? error.includes(assertion.messageContains)
    : assertion.messageMatches
      ? new RegExp(assertion.messageMatches).test(error)
      : error.length > 0;
  return {
    kind: assertion.kind,
    passed,
    expected: assertion.messageContains ?? assertion.messageMatches ?? "any error",
    actual: error || "(no error)",
  };
};
export const evalPredicate = async (
  assertion: PredicateAssertion,
  ctx: StepContext,
): Promise<AssertionResult> => {
  const instanceState = ctx.getState(ctx.step.targetKey);
  const predicateContext =
    assertion.context === "global"
      ? {
          state: ctx.result.newState ?? instanceState,
          instance: { key: ctx.step.targetKey, state: instanceState },
          step: ctx.step,
          persona: ctx.persona,
          result: ctx.result,
          events: ctx.capturedEvents,
        }
      : assertion.context === "suite"
        ? {
            state: ctx.result.newState ?? instanceState,
            instance: { key: ctx.step.targetKey, state: instanceState },
            step: ctx.step,
            persona: ctx.persona,
            result: ctx.result,
          }
        : {
            state: ctx.result.newState ?? instanceState,
            instance: { key: ctx.step.targetKey, state: instanceState },
          };
  try {
    const passed = (await ctx.kernel.morphisms.evaluate("morphism://adk/evaluatePredicate/1.0", {
      expression: assertion.expression,
      context: predicateContext,
    })) as { passed: boolean };
    return {
      kind: assertion.kind,
      passed: passed.passed,
      expected: assertion.label ?? assertion.expression,
      actual: passed.passed ? "true" : "false",
    };
  } catch (error) {
    return {
      kind: assertion.kind,
      passed: false,
      expected: assertion.label ?? assertion.expression,
      actual: error instanceof Error ? error.message : String(error),
    };
  }
};

export const evalStateExpression = (
  assertion: StateExpressionAssertion,
  ctx: StepContext,
): Promise<AssertionResult> => {
  const state = ctx.getState(assertion.key);
  return ctx.kernel.morphisms
    .evaluate("morphism://adk/evaluatePredicate/1.0", {
      expression: normalizeExpression(assertion.expression),
      context: { state },
    })
    .then((value) => {
      const passed = (value as { passed: boolean }).passed;
      return {
        kind: assertion.kind,
        passed,
        expected: assertion.expression,
        actual: passed ? "true" : "false",
      };
    })
    .catch((error) => {
      return {
        kind: assertion.kind,
        passed: false,
        expected: assertion.expression,
        actual: error instanceof Error ? error.message : String(error),
      };
    });
};

export const evalCount = async (
  assertion: CountAssertion,
  ctx: StepContext,
): Promise<AssertionResult> => {
  const instances = ctx.listInstances();
  const matching = assertion.whereExpression
    ? (
        await Promise.all(
          instances.map(async (instance) => {
            try {
              return (
                (await ctx.kernel.morphisms.evaluate("morphism://adk/evaluatePredicate/1.0", {
                  expression: normalizeExpression(assertion.whereExpression!),
                  context: {
                    state: instance.state,
                    key: instance.key,
                  },
                })) as { passed: boolean }
              ).passed
                ? instance
                : null;
            } catch {
              return null;
            }
          }),
        )
      ).filter((instance): instance is (typeof instances)[number] => instance !== null)
    : instances;
  const actual = matching.length;
  return {
    kind: assertion.kind,
    passed: actual === assertion.equals,
    expected: String(assertion.equals),
    actual: String(actual),
  };
};
