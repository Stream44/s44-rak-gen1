import { evaluatePredicate, type AcceptanceSuite } from "../../L10-acceptance/acceptance.ts";
import type { ContractDef, ModelLoadResult } from "../../L09-demand/model-loader.ts";
import { buildWorldState, type NodeRuntime } from "../../L14-hosts/projection-runtime/index.ts";
import type {
  InspectorSectionSpec,
  ObservatoryInspectorSpec,
} from "../../L14-hosts/projection-runtime/sds-schema.ts";
import { selectModelWorldModel } from "./custom-handler.ts";
import type { EventData, WorldState } from "./protocol.ts";

export type ProjectorBindings = {
  defaultPageName(): string | null;
  renderHtml(
    pageName: string,
    props?: Record<string, unknown>,
  ): { html: string; handlersJs: string };
  setBinding(name: string, value: unknown): void;
};

export type SelectionBinding = {
  modelId: string | null;
  typeId: string | null;
  actionId: string | null;
  instanceId: string | null;
  morphismId: string | null;
  contractId: string | null;
  operatorId: string | null;
  machineId: string | null;
  capabilityId: string | null;
  bundleId: string | null;
  auditId: string | null;
  pluggableId: string | null;
  projectionId: string | null;
  stepId: string | null;
};

type RuntimeSelectionBinding = {
  typeId: string | null;
  effectiveTypeId: string | null;
  actionId: string | null;
  effectiveActionId: string | null;
  instanceId: string | null;
  effectiveInstanceId: string | null;
  morphismId: string | null;
  effectiveMorphismId: string | null;
  contractId: string | null;
  effectiveContractId: string | null;
  operatorId: string | null;
  effectiveOperatorId: string | null;
  machineId: string | null;
  effectiveMachineId: string | null;
  capabilityId: string | null;
  effectiveCapabilityId: string | null;
  bundleId: string | null;
  effectiveBundleId: string | null;
  auditId: string | null;
  effectiveAuditId: string | null;
  pluggableId: string | null;
  effectivePluggableId: string | null;
  projectionId: string | null;
  effectiveProjectionId: string | null;
};

type BreadcrumbSegment = {
  label: string;
  current?: boolean;
  onClick?: {
    action: string;
    payload: { path?: string; value?: string; values?: Record<string, string> };
  };
};
type PersonaBinding = { id: string; name: string; role: string; verbs: string[] };
type TransitionBinding = { from: string; to: string; verb: string };
type TimelineEntry = { ts: string; label: string; detail?: string };
type KeyValueBinding = Array<{ label: string; value: string }>;
type ResolvedInspectorSection = Omit<InspectorSectionSpec, "items" | "rows" | "text"> & {
  items?: unknown[];
  rows?: unknown[];
  text?: unknown;
};
type ResolvedInspector = Omit<ObservatoryInspectorSpec, "tabs" | "sections"> & {
  tabs?: string[];
  selected: Record<string, unknown> | null;
  sections: ResolvedInspectorSection[];
};
type AcceptanceStepBinding = {
  kind: "step";
  id: string;
  verb: string;
  persona: string;
  payload: string;
  assertionResults: Array<{ kind: string; passed: boolean; expected?: string; actual?: string }>;
};
type AcceptanceInstanceBinding = {
  kind: "instance";
  id: string;
  recentEvents: TimelineEntry[];
  stateJson: string;
  machines: string[];
};
type RuntimePanelData = WorldState & {
  sds: NodeRuntime["sds"];
  selection: RuntimeSelectionBinding;
  breadcrumb: BreadcrumbSegment[];
  personas: PersonaBinding[];
  verbs: string[];
  inspectors: ResolvedInspector[];
  panels: {
    selectedType: null | {
      id: string;
      name?: string;
      summary: Array<{ label: string; value: string }>;
      conformsTo: string;
      properties: Array<{ name: string; type: string; required: boolean }>;
      conformsToChain: string[];
      referencedBy: string[];
      actionsTargeting: string[];
      morphismsProducing: string[];
    };
    selectedMorphism: null | {
      id: string;
      name: string;
      identity: Array<{ label: string; value: string }>;
      signature: Array<{ label: string; value: string }>;
      usedIn: string[];
    };
    selectedOperator: null | {
      id: string;
      name: string;
      arity: number;
      inputKinds: string[];
      outputKind: string;
      summary: Array<{ label: string; value: string }>;
    };
    selectedAction: null | {
      id: string;
      name: string;
      verb: string;
      summary: KeyValueBinding;
      inputSchema: string;
      preconditions: string[];
      targetMachine: string;
      authorizingPersonas: string[];
      machine: null | {
        states: string[];
        transitions: TransitionBinding[];
        currentStates: Record<string, unknown>;
        name: string;
      };
    };
    selectedMachine: null | {
      id: string;
      name: string;
      states: string[];
      transitions: TransitionBinding[];
      currentStates: Record<string, unknown>;
      summary: KeyValueBinding;
    };
    selectedCapability: null | {
      id: string;
      name: string;
      verbs: string[];
      summary: Array<{ label: string; value: string }>;
    };
    selectedInstance: null | {
      id: string;
      key: string;
      name: string;
      modelName: string;
      stateJson: string;
      recentEvents: TimelineEntry[];
      timeline: TimelineEntry[];
      machines: string[];
      bookMetadata: KeyValueBinding;
      authorName: string;
    };
    selectedContract: null | {
      id: string;
      name: string;
      claim: string;
      expression?: string;
      evaluations: Array<{
        instanceKey: string;
        passed: boolean;
        expected: string;
        actual: string;
      }>;
    };
    selectedBundle: null | {
      id: string;
      name: string;
      morphism: string;
      byteLength: number;
      createdAt: string;
      summary: Array<{ label: string; value: string }>;
    };
    selectedAudit: null | { ts: string; op: string; cid: string; name?: string };
    selectedPluggable: null | { id: string; name: string; kind: string; impls: string[] };
    selectedProjection: null | { id: string; name: string; targetKind: string; pages: string[] };
    selectedAcceptance: AcceptanceStepBinding | AcceptanceInstanceBinding | null;
    selectedInstanceTimeline: TimelineEntry[];
    metamodelTree: Array<{
      label: string;
      children?: Array<{ label: string; children?: Array<{ label: string }> }>;
    }>;
    modelDiff: null | {
      leftModel: string;
      rightModel: string;
      shared: string[];
      leftOnly: string[];
      rightOnly: string[];
    };
  };
};

export type Bindings = {
  initialActiveTab: string;
  view: { activeTab: string; activeNestedTab: string };
  runtime: RuntimePanelData;
  ws: RuntimePanelData;
  selection: SelectionBinding;
  playback: {
    suite: unknown;
    suites: unknown;
    session: unknown;
    appStateAfter: Record<string, unknown>;
  };
  models: unknown[];
  selectedModelId: string | null;
  selectedModelView: unknown;
};

type PlaybackStep = {
  stepId: string;
  persona?: { id?: string; name?: string };
  verb?: string;
  payload?: Record<string, unknown>;
  assertionResults?: Array<{ kind: string; passed: boolean; expected?: string; actual?: string }>;
};

const loadResults = (runtime: NodeRuntime): ModelLoadResult[] =>
  Array.from(
    (
      runtime.loader as unknown as { loadedModels?: Map<string, ModelLoadResult> }
    ).loadedModels?.values() ?? [],
  );

const initialModelId = (runtime: NodeRuntime) =>
  [...runtime.apps.entries()].find(([, app]) => app === runtime.app)?.[0] ?? null;

const defaultSelection = (ws: WorldState): SelectionBinding => ({
  modelId: ws.models[0]?.name ?? null,
  typeId: ws.modelTypes[0]?.id ?? null,
  actionId: ws.actions[0]?.id ?? null,
  instanceId: ws.instances[0]?.key ?? null,
  morphismId: ws.morphisms[0]?.id ?? null,
  contractId: ws.contracts[0]?.name ?? null,
  operatorId: ws.algebraOperators[0]?.id ?? null,
  machineId: ws.machines[0]?.id ?? null,
  capabilityId: ws.capabilities[0]?.id ?? null,
  bundleId: ws.bundles[0]?.id ?? null,
  auditId: ws.auditLog[0]?.cid ?? null,
  pluggableId: ws.pluggableInterfaces[0]?.id ?? null,
  projectionId: ws.projections[0]?.id ?? null,
  stepId: null,
});

const modelContracts = (runtime: NodeRuntime): Map<string, ContractDef> =>
  new Map(
    loadResults(runtime).flatMap((result) =>
      Object.entries(result.document.contracts ?? {}).map(
        ([name, contract]) => [`${result.modelId}:${name}`, contract as ContractDef] as const,
      ),
    ),
  );

const modelActions = (
  runtime: NodeRuntime,
): Map<string, { preconditions?: string[]; targetMachine?: string | null }> =>
  new Map(
    loadResults(runtime).flatMap((result) =>
      Object.entries(result.document.actions ?? {}).map(
        ([name, action]) => [`${result.modelId}:${name}`, action] as const,
      ),
    ),
  );

const metamodelTree = (ws: WorldState) =>
  [3, 2, 1, 0].map((level) => ({
    label: `M${level}`,
    children: ws.metamodels
      .filter((item) => item.level === level)
      .map((item) => ({ label: item.name, children: [{ label: item.conformsTo }] })),
  }));

const stringify = (value: unknown) => JSON.stringify(value ?? null, null, 2);
const toKeyValue = (value: Record<string, unknown>): KeyValueBinding =>
  Object.entries(value).map(([label, entry]) => ({
    label,
    value: typeof entry === "string" ? entry : stringify(entry),
  }));
const resolveSelectedPath = (selected: Record<string, unknown> | null, binding?: string) =>
  binding?.startsWith("$selected")
    ? binding
        .replace(/^\$selected\.?/, "")
        .split(".")
        .filter(Boolean)
        .reduce<unknown>(
          (current, part) =>
            current && typeof current === "object"
              ? (current as Record<string, unknown>)[part]
              : undefined,
          selected ?? undefined,
        )
    : binding;
const normalizeInspectorTabs = (tabs?: string[]) =>
  tabs
    ?.flatMap((tab) =>
      tab.includes("/")
        ? [tab]
        : [
            tab,
            `${tab}/${({ acceptance: "actions", dynamics: "machines" } as Record<string, string>)[tab] ?? ""}`.replace(
              /\/$/,
              "",
            ),
          ],
    )
    .filter(Boolean);
const resolveInspectorSections = (
  sections: InspectorSectionSpec[],
  selected: Record<string, unknown> | null,
): ResolvedInspectorSection[] =>
  sections.map((section) => {
    const items = resolveSelectedPath(selected, section.items);
    const rows = resolveSelectedPath(selected, section.rows);
    return {
      ...section,
      items: Array.isArray(items)
        ? items
        : items && typeof items === "object"
          ? toKeyValue(items as Record<string, unknown>)
          : undefined,
      rows: Array.isArray(rows) ? rows : undefined,
      text:
        typeof section.text === "string" && section.text.startsWith("$selected")
          ? resolveSelectedPath(selected, section.text)
          : section.text,
    };
  });
const resolveSelectedBinding = (
  panels: RuntimePanelData["panels"],
  binding: string,
): Record<string, unknown> | null => {
  const key = binding.split(".").pop();
  return key && key in panels
    ? ((panels as Record<string, unknown>)[key] as Record<string, unknown> | null)
    : null;
};
const resolveInspectors = (
  inspectors: ObservatoryInspectorSpec[],
  panels: RuntimePanelData["panels"],
): ResolvedInspector[] =>
  inspectors.map((spec) => {
    const selected = resolveSelectedBinding(panels, spec.selectedBinding);
    return {
      ...spec,
      tabs: normalizeInspectorTabs(spec.tabs),
      selected,
      sections: resolveInspectorSections(spec.sections, selected),
    };
  });

const instanceTimeline = (ws: WorldState, instanceKey: string | null): TimelineEntry[] =>
  [
    ...ws.auditLog.slice(-12).map((event) => ({
      ts: new Date(event.ts).toISOString(),
      label: `${event.op} ${event.name ?? event.cid}`,
      detail: event.cid,
    })),
    ...ws.recentEvents
      .filter((event) => event.targetKey === instanceKey)
      .map((event) => ({
        ts: event.timestamp,
        label: `${event.action} ${event.targetKey}`,
        detail: stringify(event.newState),
      })),
  ].sort((left, right) => left.ts.localeCompare(right.ts));

const machinesForInstance = (ws: WorldState, instanceKey: string | null): string[] =>
  !instanceKey
    ? []
    : ws.machines
        .filter(
          (machine) =>
            Object.keys(machine.currentStates ?? {}).includes(instanceKey) ||
            stringify(machine.currentStates).includes(instanceKey),
        )
        .map((machine) => machine.name);

const selectionKeys = [
  "typeId",
  "actionId",
  "instanceId",
  "morphismId",
  "contractId",
  "operatorId",
  "machineId",
  "capabilityId",
  "bundleId",
  "auditId",
  "pluggableId",
  "projectionId",
] as const satisfies ReadonlyArray<keyof SelectionBinding>;

const capitalizeTab = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "Observatory";
const clearDeeperSelection = (level: "tab" | "nestedTab"): Record<string, string> => ({
  ...(level === "tab" ? { activeNestedTab: "" } : {}),
  ...Object.fromEntries(selectionKeys.map((key) => [`selection.${key}`, ""])),
});

function augmentRuntime(
  runtime: NodeRuntime,
  ws: WorldState,
  suite: AcceptanceSuite,
  view: Bindings["view"],
  selection: SelectionBinding,
  playbackSession: unknown,
): RuntimePanelData {
  const contractsByKey = modelContracts(runtime);
  const actionsByKey = modelActions(runtime);
  const personas = suite.personas.map((persona) => ({
    id: persona.id,
    name: persona.name,
    role: persona.role,
    verbs: persona.verbs ?? [],
  }));
  const verbs = Array.from(new Set(ws.actions.map((action) => action.verb)));
  const selectedType =
    ws.modelTypes.find((item) => item.id === selection.typeId) ?? ws.modelTypes[0] ?? null;
  const selectedMorphism =
    ws.morphisms.find((item) => item.id === selection.morphismId) ?? ws.morphisms[0] ?? null;
  const selectedOperator =
    ws.algebraOperators.find((item) => item.id === selection.operatorId) ??
    ws.algebraOperators[0] ??
    null;
  const selectedAction =
    ws.actions.find((item) => item.id === selection.actionId) ?? ws.actions[0] ?? null;
  const selectedCapability =
    ws.capabilities.find((item) => item.id === selection.capabilityId) ??
    ws.capabilities[0] ??
    null;
  const selectedInstance =
    ws.instances.find((item) => item.key === selection.instanceId) ?? ws.instances[0] ?? null;
  const selectedContract =
    ws.contracts.find((item) => item.name === selection.contractId) ?? ws.contracts[0] ?? null;
  const selectedBundle =
    ws.bundles.find((item) => item.id === selection.bundleId) ?? ws.bundles[0] ?? null;
  const selectedAudit =
    ws.auditLog.find((item) => item.cid === selection.auditId) ?? ws.auditLog[0] ?? null;
  const selectedPluggable =
    ws.pluggableInterfaces.find((item) => item.id === selection.pluggableId) ??
    ws.pluggableInterfaces[0] ??
    null;
  const selectedProjection =
    ws.projections.find((item) => item.id === selection.projectionId) ?? ws.projections[0] ?? null;
  const selectedMachine =
    ws.machines.find((machine) => machine.id === selection.machineId) ??
    ws.machines.find(
      (machine) =>
        machine.name === (selectedAction as { targetMachine?: string } | null)?.targetMachine,
    ) ??
    ws.machines[0] ??
    null;
  const models = ws.models.map((item) => item.name);
  const leftModel = models[0] ?? "";
  const rightModel = models[1] ?? "";
  const leftTypes = new Set(
    ws.modelTypes
      .filter((item) => item.modelName === leftModel)
      .map((item) => item.name ?? item.id),
  );
  const rightTypes = new Set(
    ws.modelTypes
      .filter((item) => item.modelName === rightModel)
      .map((item) => item.name ?? item.id),
  );
  const playbackSteps = ((playbackSession as { steps?: PlaybackStep[] } | null)?.steps ??
    []) as PlaybackStep[];
  const selectedStep = playbackSteps.find((step) => step.stepId === selection.stepId) ?? null;
  const selectedInstanceEvents = instanceTimeline(ws, selectedInstance?.key ?? null);
  const actions = ws.actions.map((action) => {
    const key = `${action.modelName ?? selection.modelId ?? ""}:${action.name}`;
    const modelAction = actionsByKey.get(key);
    return {
      ...action,
      preconditions: modelAction?.preconditions ?? [],
      targetMachine:
        modelAction?.targetMachine ??
        ws.machines.find((machine) => machine.modelName === action.modelName)?.name ??
        "",
      authorizingPersonas: personas
        .filter((persona) => persona.verbs.includes(action.verb))
        .map((persona) => persona.name),
    };
  });
  const contracts = ws.contracts.map((contract) => {
    const modelContract = contractsByKey.get(
      `${contract.modelName ?? selection.modelId ?? ""}:${contract.name}`,
    );
    const expression = modelContract?.expression;
    const evaluations = ws.instances
      .filter((instance) => !contract.modelName || instance.modelName === contract.modelName)
      .map((instance) => {
        if (!expression)
          return {
            instanceKey: instance.key,
            passed: false,
            expected: contract.claim,
            actual: "No expression configured",
          };
        try {
          const passed = evaluatePredicate(expression, { state: instance.state, instance });
          return {
            instanceKey: instance.key,
            passed,
            expected: expression,
            actual: passed ? "true" : "false",
          };
        } catch (error) {
          return {
            instanceKey: instance.key,
            passed: false,
            expected: expression,
            actual: error instanceof Error ? error.message : String(error),
          };
        }
      });
    return { ...contract, expression, evaluations };
  });
  const selectedContractDetails = contracts.find(
    (contract) => contract.name === (selectedContract?.name ?? ""),
  );
  const selectedAcceptance =
    selectedStep != null
      ? {
          kind: "step" as const,
          id: selectedStep.stepId,
          verb: selectedStep.verb ?? "",
          persona: selectedStep.persona?.name ?? selectedStep.persona?.id ?? "",
          payload: stringify(selectedStep.payload ?? {}),
          assertionResults: selectedStep.assertionResults ?? [],
        }
      : selectedInstance != null
        ? {
            kind: "instance" as const,
            id: selectedInstance.key,
            recentEvents: selectedInstanceEvents,
            stateJson: stringify(selectedInstance.state),
            machines: machinesForInstance(ws, selectedInstance.key),
          }
        : null;
  const effectiveSelection: RuntimeSelectionBinding = {
    typeId: selection.typeId,
    effectiveTypeId: selectedType?.id ?? null,
    actionId: selection.actionId,
    effectiveActionId: selectedAction?.id ?? null,
    instanceId: selection.instanceId,
    effectiveInstanceId: selectedInstance?.key ?? null,
    morphismId: selection.morphismId,
    effectiveMorphismId: selectedMorphism?.id ?? null,
    contractId: selection.contractId,
    effectiveContractId: selectedContract?.name ?? null,
    operatorId: selection.operatorId,
    effectiveOperatorId: selectedOperator?.id ?? null,
    machineId: selection.machineId,
    effectiveMachineId: selectedMachine?.id ?? null,
    capabilityId: selection.capabilityId,
    effectiveCapabilityId: selectedCapability?.id ?? null,
    bundleId: selection.bundleId,
    effectiveBundleId: selectedBundle?.id ?? null,
    auditId: selection.auditId,
    effectiveAuditId: selectedAudit?.cid ?? null,
    pluggableId: selection.pluggableId,
    effectivePluggableId: selectedPluggable?.id ?? null,
    projectionId: selection.projectionId,
    effectiveProjectionId: selectedProjection?.id ?? null,
  };
  const activeTab = view.activeTab;
  const activeNestedTab = view.activeNestedTab;
  const selectionLabel =
    activeTab === "kernel" && activeNestedTab === "types"
      ? (selectedType?.name ?? selectedType?.id ?? "Selected")
      : activeTab === "kernel" && activeNestedTab === "morphisms"
        ? (selectedMorphism?.name ?? selectedMorphism?.id ?? "Selected")
        : activeTab === "kernel" && activeNestedTab === "operators"
          ? (selectedOperator?.name ?? selectedOperator?.id ?? "Selected")
          : activeTab === "runtime" && activeNestedTab === "actions"
            ? (selectedAction?.name ?? selectedAction?.id ?? "Selected")
            : activeTab === "runtime" && activeNestedTab === "capabilities"
              ? (selectedCapability?.name ?? selectedCapability?.id ?? "Selected")
              : activeTab === "runtime" && activeNestedTab === "instances"
                ? (selectedInstance?.key ?? "Selected")
                : activeTab === "runtime" && activeNestedTab === "machines"
                  ? (selectedMachine?.name ?? selectedMachine?.id ?? "Selected")
                  : activeTab === "meta" && activeNestedTab === "bundles"
                    ? (selectedBundle?.id ?? "Selected")
                    : activeTab === "meta" && activeNestedTab === "audit"
                      ? (selectedAudit?.cid ?? "Selected")
                      : activeTab === "meta" && activeNestedTab === "pluggables"
                        ? (selectedPluggable?.name ?? selectedPluggable?.id ?? "Selected")
                        : activeTab === "meta" && activeNestedTab === "projections"
                          ? (selectedProjection?.name ?? selectedProjection?.id ?? "Selected")
                          : activeTab === "dynamics"
                            ? (selectedMachine?.name ?? selectedMachine?.id ?? "Selected")
                            : activeTab === "acceptance"
                              ? (selectedStep?.stepId ?? selectedInstance?.key ?? "Selected")
                              : "Selected";

  return {
    ...ws,
    sds: runtime.sds,
    selection: effectiveSelection,
    breadcrumb: [
      { label: "Observatory", current: activeTab === "" },
      {
        label: capitalizeTab(activeTab),
        onClick: { action: "ui.set", payload: { values: clearDeeperSelection("tab") } },
        current: activeNestedTab === "",
      },
      {
        label: capitalizeTab(activeNestedTab || activeTab),
        onClick: { action: "ui.set", payload: { values: clearDeeperSelection("nestedTab") } },
        current: false,
      },
      { label: selectionLabel, current: true },
    ],
    personas,
    verbs,
    inspectors: [],
    actions,
    contracts,
    panels: {
      selectedType: selectedType
        ? {
            id: selectedType.id,
            name: selectedType.name,
            summary: [
              { label: "id", value: selectedType.id },
              { label: "conformsTo", value: selectedType.conformsTo },
              { label: "level", value: String(selectedType.level) },
            ],
            conformsTo: selectedType.conformsTo,
            properties: Object.entries(selectedType.properties).map(([name, property]) => ({
              name,
              type: property.type,
              required: Boolean(property.required),
            })),
            conformsToChain: [selectedType.conformsTo],
            referencedBy: ws.edges
              .filter((edge) => edge.from === selectedType.id || edge.to === selectedType.id)
              .map((edge) => `${edge.from} ${edge.rel} ${edge.to}`),
            actionsTargeting: ws.actions
              .filter(
                (action) =>
                  selectedType.name === "Order" || action.modelName === selectedType.modelName,
              )
              .map((action) => action.name),
            morphismsProducing: ws.morphisms
              .filter(
                (morphism) =>
                  morphism.outputKind === selectedType.id ||
                  morphism.conformsTo === selectedType.conformsTo,
              )
              .map((morphism) => morphism.name),
          }
        : null,
      selectedMorphism: selectedMorphism
        ? {
            id: selectedMorphism.id,
            name: selectedMorphism.name,
            identity: [
              { label: "id", value: selectedMorphism.id },
              { label: "conformsTo", value: selectedMorphism.conformsTo },
            ],
            signature: [
              { label: "inputKinds", value: selectedMorphism.inputKinds.join(", ") },
              { label: "outputKind", value: selectedMorphism.outputKind },
              { label: "impl", value: selectedMorphism.impl ?? "" },
            ],
            usedIn: ws.actions
              .filter(
                (action) =>
                  selectedMorphism.inputKinds.includes(action.id) ||
                  action.name.includes(selectedMorphism.name),
              )
              .map((action) => action.name),
          }
        : null,
      selectedOperator: selectedOperator
        ? {
            id: selectedOperator.id,
            name: selectedOperator.name,
            arity: selectedOperator.arity,
            inputKinds: selectedOperator.inputKinds,
            outputKind: selectedOperator.outputKind,
            summary: [
              { label: "id", value: selectedOperator.id },
              { label: "arity", value: String(selectedOperator.arity) },
              { label: "outputKind", value: selectedOperator.outputKind },
            ],
          }
        : null,
      selectedAction: selectedAction
        ? {
            id: selectedAction.id,
            name: selectedAction.name,
            verb: selectedAction.verb,
            summary: [
              { label: "id", value: selectedAction.id },
              { label: "verb", value: selectedAction.verb },
              {
                label: "targetMachine",
                value:
                  (
                    ws.actions.find((action) => action.id === selectedAction.id) as
                      | { targetMachine?: string }
                      | undefined
                  )?.targetMachine ??
                  selectedMachine?.name ??
                  "",
              },
            ],
            inputSchema: stringify(selectedAction.inputSchema),
            preconditions:
              (
                ws.actions.find((action) => action.id === selectedAction.id) as
                  | { preconditions?: string[] }
                  | undefined
              )?.preconditions ?? [],
            targetMachine:
              (
                ws.actions.find((action) => action.id === selectedAction.id) as
                  | { targetMachine?: string }
                  | undefined
              )?.targetMachine ??
              selectedMachine?.name ??
              "",
            authorizingPersonas:
              (
                ws.actions.find((action) => action.id === selectedAction.id) as
                  | { authorizingPersonas?: string[] }
                  | undefined
              )?.authorizingPersonas ??
              personas
                .filter((persona) => persona.verbs.includes(selectedAction.verb))
                .map((persona) => persona.name),
            machine: selectedMachine
              ? {
                  name: selectedMachine.name,
                  states: selectedMachine.states,
                  transitions: selectedMachine.transitions,
                  currentStates: selectedMachine.currentStates,
                }
              : null,
          }
        : null,
      selectedMachine: selectedMachine
        ? {
            id: selectedMachine.id,
            name: selectedMachine.name,
            states: selectedMachine.states,
            transitions: selectedMachine.transitions,
            currentStates: selectedMachine.currentStates,
            summary: [
              { label: "id", value: selectedMachine.id },
              { label: "states", value: String(selectedMachine.states.length) },
              { label: "transitions", value: String(selectedMachine.transitions.length) },
            ],
          }
        : null,
      selectedCapability: selectedCapability
        ? {
            id: selectedCapability.id,
            name: selectedCapability.name,
            verbs: selectedCapability.verbs,
            summary: [
              { label: "id", value: selectedCapability.id },
              { label: "name", value: selectedCapability.name },
              { label: "verbs", value: selectedCapability.verbs.join(", ") },
            ],
          }
        : null,
      selectedInstance: selectedInstance
        ? {
            id: selectedInstance.key,
            key: selectedInstance.key,
            name: selectedInstance.key,
            modelName: selectedInstance.modelName ?? "",
            stateJson: stringify(selectedInstance.state),
            recentEvents: selectedInstanceEvents,
            timeline: selectedInstanceEvents,
            machines: machinesForInstance(ws, selectedInstance.key),
            bookMetadata: toKeyValue((selectedInstance.state ?? {}) as Record<string, unknown>),
            authorName: String(
              ((selectedInstance.state as Record<string, unknown> | null)?.authorName ??
                (selectedInstance.state as Record<string, unknown> | null)?.author ??
                (selectedInstance.state as Record<string, unknown> | null)?.authorId ??
                "") as string,
            ),
          }
        : null,
      selectedContract: selectedContractDetails
        ? {
            id: selectedContractDetails.name,
            name: selectedContractDetails.name,
            claim: selectedContractDetails.claim,
            expression: selectedContractDetails.expression,
            evaluations: selectedContractDetails.evaluations,
          }
        : null,
      selectedBundle: selectedBundle
        ? {
            id: selectedBundle.id,
            name: selectedBundle.id,
            morphism: selectedBundle.morphism,
            byteLength: selectedBundle.byteLength,
            createdAt: new Date(selectedBundle.createdAt).toISOString(),
            summary: [
              { label: "id", value: selectedBundle.id },
              { label: "morphism", value: selectedBundle.morphism },
              { label: "bytes", value: String(selectedBundle.byteLength) },
            ],
          }
        : null,
      selectedAudit: selectedAudit
        ? {
            ts: new Date(selectedAudit.ts).toISOString(),
            op: selectedAudit.op,
            cid: selectedAudit.cid,
            name: selectedAudit.name,
          }
        : null,
      selectedPluggable: selectedPluggable
        ? {
            id: selectedPluggable.id,
            name: selectedPluggable.name,
            kind: selectedPluggable.kind,
            impls: selectedPluggable.impls,
          }
        : null,
      selectedProjection: selectedProjection
        ? {
            id: selectedProjection.id,
            name: selectedProjection.name,
            targetKind: selectedProjection.targetKind,
            pages: selectedProjection.pages,
          }
        : null,
      selectedAcceptance,
      selectedInstanceTimeline: selectedInstanceEvents,
      metamodelTree: metamodelTree(ws),
      modelDiff:
        leftModel && rightModel
          ? {
              leftModel,
              rightModel,
              shared: [...leftTypes].filter((item) => rightTypes.has(item)),
              leftOnly: [...leftTypes].filter((item) => !rightTypes.has(item)),
              rightOnly: [...rightTypes].filter((item) => !leftTypes.has(item)),
            }
          : null,
    },
  };
}

export async function createBindings(
  runtime: NodeRuntime,
  suite: AcceptanceSuite,
): Promise<Bindings> {
  const initialWorldState = buildWorldState(runtime);
  const selection = defaultSelection(initialWorldState);
  const selectedModelId = initialModelId(runtime);
  const selectedModel = selectedModelId
    ? await selectModelWorldModel(runtime.loader, selectedModelId)
    : undefined;
  const playback = { suite: {}, suites: [], session: {}, appStateAfter: {} };
  const view = { activeTab: "kernel", activeNestedTab: "types" };
  const augmented = augmentRuntime(
    runtime,
    initialWorldState,
    suite,
    view,
    selection,
    playback.session,
  );
  augmented.inspectors = resolveInspectors(runtime.inspectors, augmented.panels);
  (augmented as unknown as Record<string, unknown>).inspectorByKind = Object.fromEntries(
    augmented.inspectors.map((i) => [i.kind, i]),
  );
  return {
    initialActiveTab: "kernel",
    view,
    selection,
    runtime: augmented,
    ws: augmented,
    playback,
    models: await runtime.loader.listLoadedModels(),
    selectedModelId,
    selectedModelView: selectedModel?.view ?? null,
  };
}

export function syncBindings(projector: ProjectorBindings, bindings: Bindings): void {
  projector.setBinding("initialActiveTab", bindings.initialActiveTab);
  projector.setBinding("runtime", bindings.runtime);
  projector.setBinding("selection", bindings.selection);
  projector.setBinding("ws", bindings.ws);
  projector.setBinding("playback", bindings.playback);
  projector.setBinding("models", bindings.models);
  projector.setBinding("selectedModelId", bindings.selectedModelId);
  projector.setBinding("selectedModelView", bindings.selectedModelView);
}

export function refreshBindings(
  runtime: NodeRuntime,
  suite: AcceptanceSuite,
  recentEvents: EventData[],
  bindings: Bindings,
  projector: ProjectorBindings,
  playback: { getSuite(): unknown; getSuites(): unknown; getSession(): unknown },
): void {
  const worldState = buildWorldState(runtime, { recentEvents });
  bindings.playback = {
    ...bindings.playback,
    suite: playback.getSuite(),
    suites: playback.getSuites(),
    session: playback.getSession(),
  };
  bindings.runtime = augmentRuntime(
    runtime,
    worldState,
    suite,
    bindings.view,
    bindings.selection,
    bindings.playback.session,
  );
  bindings.runtime.inspectors = resolveInspectors(runtime.inspectors, bindings.runtime.panels);
  (bindings.runtime as unknown as Record<string, unknown>).inspectorByKind = Object.fromEntries(
    bindings.runtime.inspectors.map((i) => [i.kind, i]),
  );
  bindings.ws = bindings.runtime;
  syncBindings(projector, bindings);
}
