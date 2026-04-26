import type {
  AcceptanceSuite,
  Assertion,
  Branch,
  Persona,
  Scenario,
  Seed,
  Step,
  UseCase,
} from "./acceptance-types.ts";
import {
  type AcceptanceSuiteDocumentM1,
  validateAcceptanceSuiteDocument,
} from "../L02-metamodels/acceptance-suite.ts";

export interface AcceptancePersonaSpec extends Omit<Persona, "capabilities"> {
  verbs: string[];
}

export interface AcceptanceSuiteSource {
  id?: string;
  suite?: string;
  name?: string;
  model: string;
  version: string;
  personas: string | AcceptancePersonaSpec[];
  seeds?: string | Seed[];
  useCases: UseCase[];
}

interface RawUseCase {
  id: string;
  name: string;
  description?: string;
  scenarios: RawScenario[];
}
interface RawScenario {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  personas?: string[];
  seeds?: string[];
  inlineSeeds?: Seed[];
  steps?: RawStep[];
  trace?: RawTraceStep[];
  restartAfter?: number[];
}
interface RawTraceStep {
  persona: string;
  verb?: string;
  target?: string;
  payload?: Record<string, unknown>;
  assertions?: Assertion[];
}
interface RawStep {
  id: string;
  description?: string;
  persona: string;
  verb: string;
  targetKey: string;
  payload?: Record<string, unknown>;
  expectSuccess?: boolean;
  assertions?: Assertion[];
  branches?: RawBranch[];
}
interface RawBranch {
  label: string;
  step?: RawStep;
  ref?: string;
  resetBeforeCycle?: boolean;
}

export function parseAcceptanceSuiteDocument(raw: unknown): AcceptanceSuiteSource {
  validateAcceptanceSuiteDocument(raw as AcceptanceSuiteDocumentM1);
  const doc = raw as AcceptanceSuiteDocumentM1 & {
    model: string;
    version: string;
    personas: string | AcceptancePersonaSpec[];
    seeds?: string | Seed[];
    useCases: RawUseCase[];
  };
  return {
    id: doc.id,
    suite: doc.suite,
    name: doc.name,
    model: doc.model,
    version: doc.version,
    personas:
      typeof doc.personas === "string"
        ? doc.personas
        : doc.personas.map((persona: AcceptancePersonaSpec) => ({
            ...persona,
            verbs: persona.verbs ?? [],
          })),
    seeds: doc.seeds,
    useCases: doc.useCases.map((useCase: RawUseCase) => ({
      id: useCase.id,
      name: useCase.name,
      description: useCase.description,
      scenarios: useCase.scenarios.map(parseScenario),
    })),
  };
}

function parseStep(raw: RawStep): Step {
  return {
    id: raw.id,
    description: raw.description,
    personaId: raw.persona,
    verb: raw.verb,
    targetKey: raw.targetKey,
    payload: raw.payload,
    expectSuccess: raw.expectSuccess,
    assertions: (raw.assertions ?? []).map(parseAssertion),
    branches: raw.branches?.map(parseBranch),
  };
}

function parseBranch(raw: RawBranch): Branch {
  if (raw.ref) return { label: raw.label, ref: raw.ref, resetBeforeCycle: raw.resetBeforeCycle };
  if (!raw.step) throw new Error(`Branch "${raw.label}" must have either step or ref`);
  return { label: raw.label, step: parseStep(raw.step), resetBeforeCycle: raw.resetBeforeCycle };
}

function parseAssertion(raw: Assertion): Assertion {
  return raw;
}

function parseScenario(raw: RawScenario): Scenario {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    tags: raw.tags,
    personaIds: raw.personas,
    seedKeys: raw.seeds,
    inlineSeeds: raw.inlineSeeds,
    restartAfter: raw.restartAfter,
    root: raw.trace ? parseTraceTree(raw.id, raw.trace) : parseStepTreeFromSteps(raw.steps ?? []),
  };
}

function parseTraceTree(scenarioId: string, trace: RawTraceStep[]): Step {
  if (!trace.length) throw new Error(`Scenario "${scenarioId}" has no trace steps`);
  const steps: Step[] = trace.map((step, index) => ({
    id: `${scenarioId}-step-${index}`,
    personaId: step.persona,
    verb: step.verb ?? "__assertion_only__",
    targetKey:
      step.target ??
      String(step.payload?.id ?? `__${scenarioId}_${index}_${step.verb ?? "assertions"}`),
    payload: step.payload,
    assertions: (step.assertions ?? []).map(parseAssertion),
    useActionDispatch: true,
  }));
  for (const [index, step] of trace.entries()) {
    if (!step.verb && (step.assertions?.length ?? 0) === 0)
      throw new Error(
        `Scenario "${scenarioId}" trace step ${index + 1} must declare either "verb" or "assertions".`,
      );
  }
  for (let index = 0; index < steps.length - 1; index += 1)
    steps[index]!.branches = [{ label: "next", step: steps[index + 1]! }];
  return steps[0]!;
}

function parseStepTreeFromSteps(steps: RawStep[]): Step {
  if (!steps.length) throw new Error("Scenario has no steps");
  if (steps.length === 1) return parseStep(steps[0]!);
  const root = parseStep(steps[0]!);
  let cursor = root;
  for (let index = 1; index < steps.length; index += 1) {
    const child = parseStep(steps[index]!);
    cursor.branches = [...(cursor.branches ?? []), { label: "next", step: child }];
    cursor = child;
  }
  return root;
}

export function buildAcceptanceSuite(input: {
  doc: AcceptanceSuiteSource;
  personas: Persona[];
  seeds: Seed[];
}): AcceptanceSuite {
  const suiteId = input.doc.id ?? input.doc.suite;
  if (!suiteId) throw new Error(`Acceptance suite must declare either "id" or "suite".`);
  return {
    id: suiteId,
    name: input.doc.name ?? suiteId,
    modelId: input.doc.model,
    modelVersion: input.doc.version,
    personas: input.personas,
    seeds: input.seeds,
    useCases: input.doc.useCases,
  };
}
