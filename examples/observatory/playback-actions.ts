import type { ModelBoot, ModelLoader } from "../../L09-demand/model-loader.ts";
import {
  AcceptanceEngine,
  extractTraces,
  type AcceptanceSuite,
  type AssertionResult,
  type Scenario,
  type Step,
  type UseCase,
} from "../../L10-acceptance/acceptance.ts";
import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import buildPlaybackView, { flattenTree } from "./morphisms/playback/playback-build-view.ts";
import executePlaybackStep from "./morphisms/playback/playback-execute-step.ts";
import reseedScenario from "./morphisms/playback/playback-reseed-scenario.ts";

export interface PlaybackStep {
  stepId: string;
  status: "pending" | "passed" | "failed" | "error";
  executed: boolean;
  persona: { id: string; name: string; role: string };
  verb: string;
  targetKey: string;
  payload?: Record<string, unknown>;
  payloadJson: string;
  description?: string;
  assertionResults?: Array<{ kind: string; passed: boolean; expected?: string; actual?: string }>;
  appStateAfter?: Record<string, unknown>;
  error?: string;
}
export interface PlaybackSession {
  status: "idle" | "playing" | "paused" | "stepPassed" | "stepFailed" | "stepError" | "ended";
  playing: boolean;
  scenarioId: string;
  scenarioName: string;
  useCaseId: string;
  useCaseName: string;
  traceIndex: number;
  currentStepIndex: number;
  totalSteps: number;
  sessionPassed: boolean;
  startedAt: string;
  lastChangedKey: string;
  steps: PlaybackStep[];
}
export interface PlaybackActions {
  getSession(): PlaybackSession;
  getSuite(): PlaybackSuiteBinding;
  getSuites(): PlaybackSuiteRegistryEntry[];
  loadSuite(suiteId: string): boolean;
  handle(ref: string, payload: Record<string, unknown> | undefined): Promise<boolean>;
  clearRecentEvents(): void;
}
export type PlaybackSuiteBinding = ReturnType<typeof buildPlaybackSuiteBinding>;
export type PlaybackSuiteRegistryEntry = {
  id: string;
  name: string;
  path: string;
  active: boolean;
};
type PlaybackScenarioContext = {
  useCase: UseCase;
  scenario: Scenario;
  steps: Step[];
  traceIndex: number;
};
type TimerHandle = ReturnType<typeof setTimeout>;

export const IDLE_SESSION: PlaybackSession = {
  status: "idle",
  playing: false,
  scenarioId: "",
  scenarioName: "",
  useCaseId: "",
  useCaseName: "",
  traceIndex: 0,
  currentStepIndex: 0,
  totalSteps: 0,
  sessionPassed: true,
  startedAt: "",
  lastChangedKey: "",
  steps: [],
};
const cloneAssertionResult = (result: {
  kind: string;
  passed: boolean;
  expected?: string;
  actual?: string;
}) => ({ ...result });
const cloneStep = (step: PlaybackStep): PlaybackStep => ({
  ...step,
  payload: step.payload ? { ...step.payload } : undefined,
  assertionResults: step.assertionResults?.map(cloneAssertionResult),
  appStateAfter: step.appStateAfter ? { ...step.appStateAfter } : undefined,
});
const cloneSession = (session: PlaybackSession): PlaybackSession => ({
  ...session,
  steps: session.steps.map(cloneStep),
});
const findStepIndex = (session: PlaybackSession, stepId: string): number =>
  session.steps.findIndex((step) => step.stepId === stepId);
const mapAssertionResults = (
  assertionResults: AssertionResult[],
): PlaybackStep["assertionResults"] =>
  assertionResults.map((result) => ({
    kind: result.kind,
    passed: result.passed,
    expected: result.expected,
    actual: result.actual,
  }));
const deriveReplayStatus = (
  steps: PlaybackStep[],
  currentStepIndex: number,
): PlaybackSession["status"] =>
  currentStepIndex <= 0
    ? "paused"
    : steps[currentStepIndex - 1]?.status === "error"
      ? "stepError"
      : steps[currentStepIndex - 1]?.status === "failed"
        ? "stepFailed"
        : "stepPassed";
const findPersona = (suite: AcceptanceSuite, personaId: string): PlaybackStep["persona"] => {
  const persona = suite.personas.find((entry) => entry.id === personaId);
  return persona
    ? { id: persona.id, name: persona.name, role: persona.role }
    : { id: personaId, name: personaId, role: "unknown" };
};
const toPlaybackSteps = (suite: AcceptanceSuite, trace: Step[]): PlaybackStep[] =>
  trace.map((step) => ({
    stepId: step.id,
    status: "pending",
    executed: false,
    persona: findPersona(suite, step.personaId),
    verb: step.verb,
    targetKey: step.targetKey,
    payload: step.payload,
    payloadJson:
      step.payload && Object.keys(step.payload).length > 0 ? JSON.stringify(step.payload) : "",
    description: step.description,
  }));

function requireScenarioContext(
  suite: AcceptanceSuite,
  scenarioId: string,
  traceIndex = 0,
): PlaybackScenarioContext {
  for (const useCase of suite.useCases)
    for (const scenario of useCase.scenarios)
      if (scenario.id === scenarioId) {
        const trace = extractTraces(scenario.root)[traceIndex];
        if (!trace)
          throw new Error(`Trace index ${traceIndex} out of range for scenario "${scenarioId}"`);
        return { useCase, scenario, steps: trace.steps, traceIndex };
      }
  throw new Error(`Unknown scenario: "${scenarioId}"`);
}

export function buildPlaybackSuiteBinding(suite: AcceptanceSuite) {
  const view = buildPlaybackView({ suite });
  return {
    ...view,
    nodes: view.useCases.flatMap((useCase) =>
      useCase.scenarios.flatMap((scenario) => flattenTree(scenario.tree)),
    ),
  };
}

export function createPlaybackActions(args: {
  kernel: AlgebraicKernel;
  loader: ModelLoader;
  app: ModelBoot;
  suite: AcceptanceSuite;
  suites: Array<{ id: string; name: string; path: string; default?: boolean }>;
  initialSuiteId?: string;
  onSessionChange: (session: PlaybackSession) => void;
  resetSeeds: () => void;
  clearEventBuffer: () => void;
  autoPlayDelayMs?: number;
}): PlaybackActions {
  const {
    app,
    suites,
    onSessionChange,
    resetSeeds,
    clearEventBuffer,
    autoPlayDelayMs = 400,
  } = args;
  let suite = args.suite,
    suiteView = buildPlaybackSuiteBinding(args.suite),
    session = cloneSession(IDLE_SESSION),
    timerHandle: TimerHandle | null = null,
    autoPlayEnabled = false;
  let currentSuiteId =
    args.initialSuiteId ?? suites.find((entry) => entry.default)?.id ?? suites[0]?.id ?? "";
  const emit = (): void => onSessionChange(cloneSession(session));
  const setSession = (next: PlaybackSession): void => {
    session = cloneSession(next);
    emit();
  };
  const mutateSession = (mutator: (draft: PlaybackSession) => void): void => {
    const draft = cloneSession(session);
    mutator(draft);
    setSession(draft);
  };
  const withActiveContext = (): PlaybackScenarioContext | null =>
    session.scenarioId
      ? requireScenarioContext(suite, session.scenarioId, session.traceIndex)
      : null;
  const getSuites = (): PlaybackSuiteRegistryEntry[] =>
    suites.map((entry) => ({
      id: entry.id,
      name: entry.name,
      path: entry.path,
      active: entry.id === currentSuiteId,
    }));
  const stopAutoPlay = (notify = false): void => {
    autoPlayEnabled = false;
    if (timerHandle) clearTimeout(timerHandle);
    timerHandle = null;
    if (notify && session.playing)
      mutateSession((draft) => {
        draft.playing = false;
      });
  };
  const markStepError = (stepIndex: number, traceStep: Step, message: string): void =>
    mutateSession((draft) => {
      const step = draft.steps[stepIndex];
      if (!step) return;
      step.executed = true;
      step.status = "error";
      step.error = message;
      draft.currentStepIndex = stepIndex + 1;
      draft.sessionPassed = false;
      draft.status = "stepError";
      draft.playing = false;
      draft.lastChangedKey = traceStep.targetKey;
    });
  const reseedForScenario = (context: PlaybackScenarioContext): void => {
    resetSeeds();
    reseedScenario({ suite, scenario: context.scenario, app });
  };
  const prepareSession = (
    context: PlaybackScenarioContext,
    nextStatus: PlaybackSession["status"],
    playing: boolean,
    startedAt: string,
  ): void => {
    reseedForScenario(context);
    setSession({
      status: nextStatus,
      playing,
      scenarioId: context.scenario.id,
      scenarioName: context.scenario.name,
      useCaseId: context.useCase.id,
      useCaseName: context.useCase.name,
      traceIndex: context.traceIndex,
      currentStepIndex: 0,
      totalSteps: context.steps.length,
      sessionPassed: true,
      startedAt,
      lastChangedKey: "",
      steps: toPlaybackSteps(suite, context.steps),
    });
  };
  const replayStep = async (step: PlaybackStep): Promise<void> => {
    const persona = suite.personas.find((entry) => entry.id === step.persona.id),
      capabilityId = persona?.capabilities[step.verb];
    if (!persona || !(step.verb in app.actions) || !capabilityId) return;
    await app.submit(step.verb, step.targetKey, step.payload, capabilityId);
  };
  const scheduleNextTick = (): void => {
    stopAutoPlay(false);
    autoPlayEnabled = true;
    if (!session.playing)
      mutateSession((draft) => {
        draft.playing = true;
      });
    timerHandle = setTimeout(async () => {
      timerHandle = null;
      await handle("acceptance.stepForward", {});
      if (
        autoPlayEnabled &&
        session.status === "stepPassed" &&
        session.currentStepIndex < session.totalSteps
      )
        return void scheduleNextTick();
      autoPlayEnabled = false;
      if (session.playing)
        mutateSession((draft) => {
          draft.playing = false;
        });
    }, autoPlayDelayMs);
  };
  const executeCurrentStep = async (context: PlaybackScenarioContext): Promise<void> => {
    const stepIndex = session.currentStepIndex,
      traceStep = context.steps[stepIndex];
    if (!traceStep) {
      mutateSession((draft) => {
        draft.status = "ended";
        draft.playing = false;
      });
      autoPlayEnabled = false;
      return;
    }
    const persona = suite.personas.find((entry) => entry.id === traceStep.personaId);
    if (!persona)
      return void ((autoPlayEnabled = false),
      markStepError(stepIndex, traceStep, `Unknown persona: "${traceStep.personaId}"`));
    if (!(traceStep.verb in app.actions))
      return void ((autoPlayEnabled = false),
      markStepError(stepIndex, traceStep, `Unknown app action for verb "${traceStep.verb}"`));
    if (!persona.capabilities[traceStep.verb])
      return void ((autoPlayEnabled = false),
      markStepError(
        stepIndex,
        traceStep,
        `Authorization denied: persona "${persona.name}" (${persona.role}) has no capability for verb "${traceStep.verb}"`,
      ));
    try {
      const result = await executePlaybackStep({
        suite,
        scenario: context.scenario,
        traceIndex: context.traceIndex,
        stepIndex,
        appActions: app.actions,
        appState: { [traceStep.targetKey]: app.getState(traceStep.targetKey) },
        app,
      });
      mutateSession((draft) => {
        const playbackStep = draft.steps[stepIndex];
        if (!playbackStep) return;
        const stepPassed = result.passed,
          isLastStep = stepIndex + 1 >= draft.totalSteps;
        playbackStep.executed = true;
        playbackStep.status = stepPassed ? "passed" : "failed";
        playbackStep.assertionResults = mapAssertionResults(result.assertionResults);
        playbackStep.appStateAfter = result.resultingAppState;
        playbackStep.error = undefined;
        draft.currentStepIndex = stepIndex + 1;
        draft.sessionPassed = draft.sessionPassed && stepPassed;
        draft.status = stepPassed ? (isLastStep ? "ended" : "stepPassed") : "stepFailed";
        draft.lastChangedKey = traceStep.targetKey;
        if (!stepPassed || isLastStep) draft.playing = false;
      });
      if (!result.passed || stepIndex + 1 >= session.totalSteps) autoPlayEnabled = false;
    } catch (error) {
      autoPlayEnabled = false;
      markStepError(stepIndex, traceStep, error instanceof Error ? error.message : String(error));
    }
  };
  const silentReplayTo = async (currentStepIndex: number): Promise<void> => {
    const context = withActiveContext();
    if (!context) return;
    reseedForScenario(context);
    for (let index = 0; index < currentStepIndex; index += 1)
      if (session.steps[index]?.executed) await replayStep(session.steps[index]!);
    mutateSession((draft) => {
      draft.currentStepIndex = currentStepIndex;
      draft.playing = false;
      draft.status = deriveReplayStatus(draft.steps, currentStepIndex);
      draft.sessionPassed = draft.steps
        .slice(0, currentStepIndex)
        .every((step) => step.status === "passed");
      draft.lastChangedKey =
        currentStepIndex > 0 ? (draft.steps[currentStepIndex - 1]?.targetKey ?? "") : "";
      for (let index = currentStepIndex; index < draft.steps.length; index += 1) {
        const step = draft.steps[index];
        step.executed = false;
        step.status = "pending";
        step.assertionResults = undefined;
        step.appStateAfter = undefined;
        step.error = undefined;
      }
    });
  };
  const loadSuite = (suiteId: string): boolean => {
    const entry = suites.find((candidate) => candidate.id === suiteId);
    if (!entry) return false;
    if (entry.id === currentSuiteId) return true;
    stopAutoPlay(false);
    resetSeeds();
    clearEventBuffer();
    suite = new AcceptanceEngine(app).loadSuite(entry.path);
    suiteView = buildPlaybackSuiteBinding(suite);
    currentSuiteId = entry.id;
    setSession(IDLE_SESSION);
    return true;
  };
  async function handle(
    ref: string,
    payload: Record<string, unknown> | undefined,
  ): Promise<boolean> {
    if (!ref.startsWith("acceptance.")) return false;
    if (ref === "acceptance.play") {
      stopAutoPlay(false);
      const context = requireScenarioContext(
        suite,
        typeof payload?.scenarioId === "string" ? payload.scenarioId : "",
        typeof payload?.traceIndex === "number" ? payload.traceIndex : 0,
      );
      clearEventBuffer();
      prepareSession(context, "playing", true, new Date().toISOString());
      scheduleNextTick();
      return true;
    }
    if (ref === "acceptance.pause") return (stopAutoPlay(true), true);
    if (ref === "acceptance.resume")
      return session.status === "stepPassed" && session.currentStepIndex < session.totalSteps
        ? (scheduleNextTick(), true)
        : true;
    if (ref === "acceptance.stepForward")
      return session.status === "idle" ||
        session.status === "ended" ||
        session.status === "stepFailed" ||
        session.status === "stepError"
        ? true
        : (await executeCurrentStep(
            withActiveContext() ??
              requireScenarioContext(suite, session.scenarioId, session.traceIndex),
          ),
          true);
    if (ref === "acceptance.stepBack")
      return (
        stopAutoPlay(false),
        await silentReplayTo(Math.max(0, session.currentStepIndex - 1)),
        true
      );
    if (ref === "acceptance.seek") {
      stopAutoPlay(false);
      const scenarioId =
          typeof payload?.scenarioId === "string" ? payload.scenarioId : session.scenarioId,
        traceIndex =
          typeof payload?.traceIndex === "number" ? payload.traceIndex : session.traceIndex,
        stepId = typeof payload?.stepId === "string" ? payload.stepId : "";
      if (!stepId) return true;
      if (session.scenarioId !== scenarioId || session.traceIndex !== traceIndex) {
        clearEventBuffer();
        prepareSession(
          requireScenarioContext(suite, scenarioId, traceIndex),
          "paused",
          false,
          new Date().toISOString(),
        );
      }
      const index = findStepIndex(session, stepId);
      if (index >= 0) await silentReplayTo(index);
      return true;
    }
    if (ref === "acceptance.reset")
      return (
        stopAutoPlay(false),
        resetSeeds(),
        clearEventBuffer(),
        setSession(IDLE_SESSION),
        true
      );
    if (ref === "acceptance.loadSuite")
      return loadSuite(typeof payload?.suiteId === "string" ? payload.suiteId : "");
    return true;
  }
  return {
    getSession(): PlaybackSession {
      return cloneSession(session);
    },
    getSuite(): PlaybackSuiteBinding {
      return structuredClone(suiteView);
    },
    getSuites,
    loadSuite,
    handle,
    clearRecentEvents(): void {
      clearEventBuffer();
    },
  };
}
