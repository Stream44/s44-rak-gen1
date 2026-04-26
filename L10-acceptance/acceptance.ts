import { deepEqual } from "../L01-foundation/equality.ts";

export type {
  AcceptanceMorphismKernel,
  AcceptanceSuite,
  Assertion,
  AssertionResult,
  Branch,
  CountAssertion,
  ErrorExpected,
  EventEmitted,
  Persona,
  PredicateAssertion,
  ProjectionSurfaceAssertion,
  Scenario,
  ScenarioResult,
  Seed,
  StateEquals,
  StateExpressionAssertion,
  StateFieldMatch,
  Step,
  StepContext,
  StepResult,
  SuiteResult,
  SuiteStats,
  Trace,
  TraceResult,
  UseCase,
  UseCaseResult,
} from "./acceptance-types.ts";
export { AcceptanceEngine } from "./acceptance-engine.ts";
export { deepEqual };
export { evaluatePredicate } from "./predicate-eval.ts";
export { ProjectorSession, type ProjectorSessionOptions } from "./projector-session.ts";
export { buildStepRegistry, extractTraces } from "./trace-extract.ts";
export {
  getSurfaceEvaluator,
  getSurfaceHandlerSet,
  hasSurfaceEvaluator,
  registerSurfaceEvaluator,
  registerSurfaceHandlerSet,
  type SurfaceEvaluator,
  type SurfaceHandlerSet,
} from "./surface-evaluators.ts";

export function matchesShape(expected: unknown, actual: unknown): boolean {
  if (expected === undefined) return true;
  if (expected === null || typeof expected !== "object") return deepEqual(expected, actual);
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((entry, index) => matchesShape(entry, actual[index]))
    );
  }
  return (
    !!actual &&
    typeof actual === "object" &&
    !Array.isArray(actual) &&
    Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
      matchesShape(value, (actual as Record<string, unknown>)[key]),
    )
  );
}

import {
  registerDefaultSurfaceEvaluators,
  registerSurfaceEvaluator,
} from "./surface-evaluators.ts";

registerDefaultSurfaceEvaluators(registerSurfaceEvaluator);
