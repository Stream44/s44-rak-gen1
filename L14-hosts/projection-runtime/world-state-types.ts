export interface ModelInfo {
  name: string;
  version: string;
  origin: string;
}

export interface MetamodelInfo {
  id: string;
  name: string;
  conformsTo: string;
  level: number;
}

export interface ModelTypeInfo {
  id: string;
  name?: string;
  modelName: string;
  level: number;
  conformsTo: string;
  properties: Record<string, { type: string; required?: boolean; enum?: string[] }>;
}

export interface MorphismInfo {
  id: string;
  name: string;
  conformsTo: string;
  inputKinds: string[];
  outputKind: string;
  impl?: string;
}

export interface AlgebraOperatorInfo {
  id: string;
  name: string;
  version: string;
  arity: number;
  inputKinds: string[];
  outputKind: string;
}

export interface SpecialisationRuleInfo {
  id: string;
  name: string;
  from: string;
  to: string;
  when?: string;
}

export interface CapabilityInfo {
  id: string;
  name: string;
  description?: string;
  verbs: string[];
}

export interface PluggableInterfaceInfo {
  id: string;
  name: string;
  kind: string;
  impls: string[];
}

export interface IntentTypeInfo {
  id: string;
  name: string;
  action: string;
  payloadSchema: Record<string, unknown>;
}

export interface PolicyInfo {
  id: string;
  name: string;
  applies: string;
  rule: string;
}

export interface ProjectionInfo {
  id: string;
  name: string;
  targetKind: string;
  pages: string[];
}

export interface BundleInfo {
  id: string;
  morphism: string;
  byteLength: number;
  createdAt: number;
}

export interface AuditEventInfo {
  ts: number;
  op: string;
  cid: string;
  name?: string;
  oldCid?: string | null;
}

export interface TypeInfo {
  id: string;
  name?: string;
  modelName?: string;
  level: number;
  conformsTo: string;
  properties: Record<string, { type: string; required?: boolean; enum?: string[] }>;
}

export interface EnumInfo {
  id: string;
  name: string;
  modelName?: string;
  values: string[];
}

export interface EdgeInfo {
  from: string;
  to: string;
  rel: string;
}

export interface MachineInfo {
  id: string;
  name: string;
  modelName?: string;
  states: string[];
  transitions: Array<{ from: string; to: string; verb: string }>;
  currentStates: Record<string, unknown>;
}

export interface ActionInfo {
  id: string;
  name: string;
  modelName?: string;
  verb: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ContractInfo {
  name: string;
  modelName?: string;
  claim: string;
}

export interface InstanceInfo {
  key: string;
  modelName?: string;
  state: unknown;
}

export interface EventData {
  id: string;
  action: string;
  targetKey: string;
  previousState: unknown;
  newState: unknown;
  timestamp: string;
}

export interface WorldState {
  model: ModelInfo;
  types: TypeInfo[];
  enums: EnumInfo[];
  edges: EdgeInfo[];
  machines: MachineInfo[];
  actions: ActionInfo[];
  contracts: ContractInfo[];
  instances: InstanceInfo[];
  recentEvents: EventData[];
  metamodels: MetamodelInfo[];
  modelTypes: ModelTypeInfo[];
  morphisms: MorphismInfo[];
  algebraOperators: AlgebraOperatorInfo[];
  specialisationRules: SpecialisationRuleInfo[];
  capabilities: CapabilityInfo[];
  pluggableInterfaces: PluggableInterfaceInfo[];
  intents: IntentTypeInfo[];
  policies: PolicyInfo[];
  projections: ProjectionInfo[];
  bundles: BundleInfo[];
  auditLog: AuditEventInfo[];
  models: ModelInfo[];
}
