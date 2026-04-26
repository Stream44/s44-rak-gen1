import type {
  EventData,
  WorldState,
} from "../../L14-hosts/projection-runtime/world-state-types.ts";

export type {
  ActionInfo,
  AlgebraOperatorInfo,
  AuditEventInfo,
  BundleInfo,
  CapabilityInfo,
  ContractInfo,
  EdgeInfo,
  EnumInfo,
  EventData,
  InstanceInfo,
  IntentTypeInfo,
  MachineInfo,
  MetamodelInfo,
  ModelInfo,
  ModelTypeInfo,
  MorphismInfo,
  PluggableInterfaceInfo,
  PolicyInfo,
  ProjectionInfo,
  SpecialisationRuleInfo,
  TypeInfo,
  WorldState,
} from "../../L14-hosts/projection-runtime/world-state-types.ts";

export type ServerMessage =
  | { type: "state"; data: WorldState }
  | { type: "event"; data: EventData }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "subscribe" }
  | { type: "intent"; action: string; payload: Record<string, unknown> };

// ── Acceptance view types ────────────────────────────────────────────────

export interface AcceptanceSuiteView {
  name: string;
  model: string;
  version: string;
  personas: Array<{ id: string; name: string; role: string; verbs: string[] }>;
  useCases: Array<{
    id: string;
    name: string;
    description?: string;
    scenarios: Array<{
      id: string;
      name: string;
      description?: string;
      traceCount: number;
      traceIndices: number[];
      traceButtons: Array<{ scenarioId: string; traceIndex: number; label: string }>;
      traces: Array<{ stepIds: string[]; cyclic?: boolean; cycleTo?: string }>;
      tree: StepTreeNode;
    }>;
  }>;
}

export interface StepTreeNode {
  stepId: string;
  persona: string;
  verb: string;
  targetKey: string;
  description?: string;
  status: "pending" | "active" | "passed" | "failed" | "skipped";
  branches: Array<{ label: string; node: StepTreeNode }>;
}

export interface StepExecutedData {
  stepId: string;
  stepIndex: number;
  totalSteps: number;
  persona: { id: string; name: string; role: string };
  verb: string;
  targetKey: string;
  payload?: Record<string, unknown>;
  result: { success: boolean; newState?: unknown; error?: string };
  assertionResults: Array<{ kind: string; passed: boolean; expected?: string; actual?: string }>;
  passed: boolean;
  worldState: { instances: Array<{ key: string; state: unknown }> };
}
