import type { ModelBoot } from "../../../../L09-demand/model-loader.ts";
import {
  extractTraces,
  type AcceptanceSuite,
  type AssertionResult,
  type Persona,
  type Scenario,
} from "../../../../L10-acceptance/acceptance.ts";
import runStep from "../../../../L10-acceptance/modules/run-step.ts";

type CapturedEvent = {
  id: string;
  action: string;
  targetKey: string;
  previousState: unknown;
  newState: unknown;
};

type SnapshotState = Record<string, unknown>;

function isModelBoot(value: unknown): value is ModelBoot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ModelBoot>;
  return (
    typeof candidate.submit === "function" &&
    typeof candidate.getState === "function" &&
    typeof candidate.onEvent === "function"
  );
}

function findPersona(suite: AcceptanceSuite, personaId: string): Persona | undefined {
  return suite.personas.find((persona) => persona.id === personaId);
}

function snapshotState(app: ModelBoot, inputState: unknown, targetKey: string): SnapshotState {
  if (!inputState || typeof inputState !== "object" || isModelBoot(inputState)) {
    return { [targetKey]: app.getState(targetKey) };
  }

  const snapshot = { ...(inputState as Record<string, unknown>) };
  for (const key of Object.keys(snapshot)) {
    snapshot[key] = app.getState(key);
  }
  if (!(targetKey in snapshot)) {
    snapshot[targetKey] = app.getState(targetKey);
  }
  return snapshot;
}

export default async function executePlaybackStep(input: {
  suite: AcceptanceSuite;
  scenario: Scenario;
  traceIndex: number;
  stepIndex: number;
  appActions: Record<string, string>;
  appState: unknown;
  app?: ModelBoot;
}): Promise<{
  passed: boolean;
  assertionResults: AssertionResult[];
  capturedEvents: CapturedEvent[];
  resultingAppState: SnapshotState;
}> {
  const traces = extractTraces(input.scenario.root);
  const trace = traces[input.traceIndex];

  if (!trace) {
    throw new Error(
      `Trace index ${input.traceIndex} out of range for scenario "${input.scenario.id}"`,
    );
  }

  const step = trace.steps[input.stepIndex];
  if (!step) {
    throw new Error(`Step index ${input.stepIndex} out of range for trace ${input.traceIndex}`);
  }

  const app = input.app ?? (isModelBoot(input.appState) ? input.appState : undefined);
  if (!app) {
    throw new Error(
      "playback-execute-step requires a live ModelBoot via input.app or input.appState",
    );
  }

  if (!(step.verb in input.appActions)) {
    throw new Error(`Unknown app action for verb "${step.verb}"`);
  }

  const persona = findPersona(input.suite, step.personaId);
  if (!persona) {
    throw new Error(`Unknown persona: "${step.personaId}"`);
  }

  const capturedEvents: CapturedEvent[] = [];
  const unsubscribe = app.onEvent((event) => {
    if (event.kind === "transactionCommitted") {
      capturedEvents.push(...event.events);
      return;
    }
    capturedEvents.push({
      id: event.id,
      action: event.action,
      targetKey: event.targetKey,
      previousState: event.previousState,
      newState: event.newState,
    });
  });

  try {
    const result = await runStep({
      step,
      persona,
      app,
      capturedEvents,
    });

    return {
      passed: result.passed,
      assertionResults: result.assertions,
      capturedEvents,
      resultingAppState: snapshotState(app, input.appState, step.targetKey),
    };
  } finally {
    unsubscribe();
  }
}
