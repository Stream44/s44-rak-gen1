import type { ProjectorSession } from "./projector-session.ts";

export interface AcceptanceMorphismKernel {
  morphisms: {
    evaluate(
      morphismId: string,
      input: unknown,
      context?: Record<string, unknown>,
    ): Promise<unknown>;
  };
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  capabilities: Record<string, string>;
  verbs?: string[];
  capabilityUris?: string[];
  caveats?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Seed {
  targetKey: string;
  state: unknown;
  label?: string;
}

export type Assertion =
  | StateEquals
  | StateFieldMatch
  | EventEmitted
  | ErrorExpected
  | PredicateAssertion
  | StateExpressionAssertion
  | CountAssertion
  | ProjectionSurfaceAssertion;

export interface StateEquals {
  kind: "state-equals";
  targetKey: string;
  expected: unknown;
}

export interface StateFieldMatch {
  kind: "state-field-match";
  targetKey: string;
  fields: Record<string, unknown>;
}

export interface EventEmitted {
  kind: "event-emitted";
  targetKey: string;
  newStateFields?: Record<string, unknown>;
}

export interface ErrorExpected {
  kind: "error-expected";
  messageContains?: string;
  messageMatches?: string;
}

export interface PredicateAssertion {
  kind: "predicate";
  label?: string;
  expression: string;
  context?: "instance" | "suite" | "global";
}

export interface StateExpressionAssertion {
  kind: "state";
  key: string;
  expression: string;
}

export interface CountAssertion {
  kind: "count" | "countFiltered";
  entity: string;
  equals: number;
  whereExpression?: string;
}

export type ProjectionSurfaceAssertion =
  | {
      kind: "projector-node";
      surface: "ui.html.ws";
      selector: string;
      present: boolean;
      attrs?: Record<string, string>;
    }
  | {
      kind: "api-response";
      surface: "api.rest";
      method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      path: string;
      expected: { status: number; bodyShape?: unknown; headers?: Record<string, string> };
    }
  | {
      kind: "cli-output";
      surface: "cli.stdout";
      match: string | RegExp;
      exitCode?: number;
    };

export interface Step {
  id: string;
  description?: string;
  personaId: string;
  verb: string;
  targetKey: string;
  payload?: Record<string, unknown>;
  expectSuccess?: boolean;
  assertions: Assertion[];
  branches?: Branch[];
  useActionDispatch?: boolean;
}

export interface Branch {
  label: string;
  step?: Step;
  ref?: string;
  resetBeforeCycle?: boolean;
}
export interface Scenario {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  personaIds?: string[];
  seedKeys?: string[];
  inlineSeeds?: Seed[];
  restartAfter?: number[];
  root: Step;
}
export interface UseCase {
  id: string;
  name: string;
  description?: string;
  scenarios: Scenario[];
}
export interface AcceptanceSuite {
  id: string;
  name: string;
  modelId: string;
  modelVersion: string;
  personas: Persona[];
  seeds: Seed[];
  useCases: UseCase[];
}

export interface StepContext {
  kernel: AcceptanceMorphismKernel;
  step: Step;
  persona: Persona;
  result: {
    success: boolean;
    newState?: unknown;
    error?: string;
    events: Array<{ id: string; previousState: unknown; newState: unknown }>;
  };
  getState(targetKey: string): unknown | undefined;
  listInstances(): Array<{ key: string; state: unknown }>;
  capturedEvents: Array<{
    id: string;
    action: string;
    targetKey: string;
    previousState: unknown;
    newState: unknown;
  }>;
  projectorSession?: ProjectorSession;
}

export interface AssertionResult {
  kind: string;
  passed: boolean;
  expected: string;
  actual: string;
}
export interface StepResult {
  stepId: string;
  passed: boolean;
  error?: string;
  submitResult?: { success: boolean; newState?: unknown; error?: string };
  assertions: AssertionResult[];
}
export interface TraceResult {
  traceLabel: string;
  passed: boolean;
  steps: StepResult[];
  cyclic?: boolean;
  cycleTo?: string;
}
export interface ScenarioResult {
  scenarioId: string;
  name: string;
  passed: boolean;
  traceCount: number;
  traces: TraceResult[];
}
export interface UseCaseResult {
  useCaseId: string;
  name: string;
  passed: boolean;
  scenarios: ScenarioResult[];
}
export interface SuiteStats {
  totalScenarios: number;
  passedScenarios: number;
  totalTraces: number;
  passedTraces: number;
  totalSteps: number;
  passedSteps: number;
}
export interface SuiteResult {
  suiteId: string;
  modelId: string;
  modelVersion: string;
  passed: boolean;
  useCases: UseCaseResult[];
  timestamp: string;
  stats: SuiteStats;
}
export interface Trace {
  steps: Step[];
  edges: Branch[];
  cycle?: { toStepId: string; via: Branch };
}
