import { AcceptanceEngine } from "../../L10-acceptance/acceptance.ts";
import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import type { ProjectionKernel } from "../../L11-projection/projection-kernel.ts";
import { selectModelWorldModel } from "./custom-handler.ts";
import type { NodeRuntime } from "../../L14-hosts/projection-runtime/index.ts";
import { buildPlaybackSuiteBinding } from "./playback-actions.ts";

type AcceptanceNode = {
  stepId: string;
  persona: string;
  verb: string;
  targetKey: string;
  hasChildren: boolean;
};
type PlaybackStep = {
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
};
type PlaybackSession = {
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
};

// Keep the idle shell local for now.
const IDLE_SESSION: PlaybackSession = {
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

export type ObservatoryBindings = {
  initialActiveTab: string;
  runtime: unknown;
  ws: unknown;
  selection: {
    modelId: string | null;
    typeId: string | null;
    actionId: string | null;
    instanceId: string | null;
    morphismId: string | null;
    contractId: string | null;
  };
  playback: {
    suite: {
      name: string;
      model: string;
      version: string;
      personas: unknown[];
      useCases: Array<{ scenarios: Array<{ tree: unknown }> }>;
      nodes: AcceptanceNode[];
    };
    suites: Array<{ id: string; name: string; path: string; active: boolean }>;
    session: PlaybackSession;
    appStateAfter: Record<string, unknown>;
  };
  models: unknown[];
  selectedModelId: string | null;
  selectedModelView: unknown;
};

export async function buildInitialBindings(
  runtime: NodeRuntime,
  ws: unknown,
): Promise<ObservatoryBindings> {
  const { loader, app } = runtime;
  const acceptanceEngine = new AcceptanceEngine(app);
  const defaultSuite =
    runtime.suiteRegistry.find((entry) => entry.default) ?? runtime.suiteRegistry[0];
  if (defaultSuite) acceptanceEngine.loadSuite(defaultSuite.path);
  const acceptanceSuite = acceptanceEngine.getSuite();
  const currentSuiteId =
    runtime.suiteRegistry.find((entry) => entry.default)?.id ?? runtime.suiteRegistry[0]?.id ?? "";
  const suite = acceptanceSuite
    ? buildPlaybackSuiteBinding(acceptanceSuite)
    : { name: "", model: "", version: "", personas: [], useCases: [], nodes: [] };
  const models = await loader.listLoadedModels();
  const selectedModelId = models[0]?.modelId ?? null;
  const selectedModel = selectedModelId
    ? await selectModelWorldModel(loader, selectedModelId)
    : undefined;
  const playback = {
    get suite() {
      return suite;
    },
    get suites() {
      return runtime.suiteRegistry.map((entry) => ({
        ...entry,
        active: entry.id === currentSuiteId,
      }));
    },
    session: IDLE_SESSION,
    appStateAfter: {},
  };
  const state = ws as {
    models?: Array<{ name: string }>;
    modelTypes?: Array<{ id: string }>;
    actions?: Array<{ id: string }>;
    instances?: Array<{ key: string }>;
    morphisms?: Array<{ id: string }>;
    contracts?: Array<{ name: string }>;
  };
  return {
    initialActiveTab: "structure",
    runtime: ws,
    ws,
    selection: {
      modelId: state.models?.[0]?.name ?? null,
      typeId: state.modelTypes?.[0]?.id ?? null,
      actionId: state.actions?.[0]?.id ?? null,
      instanceId: state.instances?.[0]?.key ?? null,
      morphismId: state.morphisms?.[0]?.id ?? null,
      contractId: state.contracts?.[0]?.name ?? null,
    },
    playback,
    models,
    selectedModelId: selectedModelId,
    selectedModelView: selectedModel?.view ?? null,
  };
}

export function syncBindings(projector: ProjectionKernel, bindings: ObservatoryBindings): void {
  projector.setBinding("initialActiveTab", bindings.initialActiveTab);
  projector.setBinding("runtime", bindings.runtime);
  projector.setBinding("ws", bindings.ws);
  projector.setBinding("selection", bindings.selection);
  projector.setBinding("playback", bindings.playback);
  projector.setBinding("models", bindings.models);
  projector.setBinding("selectedModelId", bindings.selectedModelId);
  projector.setBinding("selectedModelView", bindings.selectedModelView);
}
