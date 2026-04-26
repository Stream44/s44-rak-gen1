import type { JsonSchema, TypeRef } from "../L01-foundation/types.ts";
import type { AlgebraicKernel } from "../L13-facade/kernel.export.ts";

export type ActionKind = "mutate" | "create" | "remove" | "batch" | "custom";
export type KeyStrategy = "uuid" | "nanoid" | "timestamp" | "explicit";

export interface BatchSubmitDef {
  verb: string;
  target: string;
  payload?: Record<string, unknown>;
}

export interface ActionDef {
  verb: string;
  kind?: ActionKind;
  description?: string;
  inputSchema?: JsonSchema;
  preconditions?: string[];
  targetField?: string;
  keyField?: string;
  keyStrategy?: KeyStrategy;
  defaults?: Record<string, unknown>;
  selector?: unknown;
  submit?: BatchSubmitDef;
  targetMachine?: string | null;
}

export interface ModelInspectorSectionOverride {
  heading: string;
  kind: "table" | "keyvalue" | "chain" | "list" | "text" | "code" | "empty";
  items?: string;
  rows?: string;
  columns?: string[];
  text?: string;
  emptyMessage?: string;
  hidden?: boolean;
}

export interface ModelInspectorOverride {
  kind: string;
  selectionKey?: string;
  selectedBinding?: string;
  tabs?: string[];
  autoSelectFirst?: boolean;
  sections: ModelInspectorSectionOverride[];
}

export interface ModelDocument {
  model: string;
  version: string;
  origin?: string;
  conformsTo?: string;
  entities?: Record<string, EntityDef>;
  enums?: Record<string, EnumDef>;
  relations?: Record<string, RelationDef>;
  lifecycle?: LifecycleDef;
  contracts?: Record<string, ContractDef>;
  actions?: Record<string, ActionDef>;
  morphisms?: Record<string, { impl?: { kind?: string; uri?: string; ast?: unknown } }>;
  surface?: {
    labels?: Record<string, string>;
    inspectors?: ModelInspectorOverride[];
  };
}

export interface EntityDef {
  description?: string;
  attributes: Record<string, AttributeDef>;
  required?: string[];
}

export interface AttributeDef {
  type: string;
  required?: boolean;
  optional?: boolean;
  enum?: string[];
  default?: unknown;
  items?: { type: string };
  pattern?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface EnumDef {
  values: string[];
  description?: string;
}

export interface RelationDef {
  description?: string;
  roles: Record<string, string>;
}

export interface ContractDef {
  claim: string;
  expression?: string;
  forall?: string[];
}

export interface LifecycleDef {
  states: string[];
  initial: string;
  terminal: string[];
  transitions: Array<{ from: string; to: string; verb: string }>;
}

export interface ModelLoadResult {
  cid: string;
  modelId: string;
  origin: string;
  version: string;
  conformsTo?: string;
  document: ModelDocument;
  typesRegistered: TypeRef[];
  statemachineId?: string;
  propositionIds: string[];
  actionDefs: Array<{ name: string; def: ActionDef }>;
  errors: string[];
}

export interface ModelSummary {
  modelId: string;
  origin: string;
  version: string;
  conformsTo?: string;
  typeCount: number;
  enumCount: number;
  relationCount: number;
  actionCount: number;
  hasLifecycle: boolean;
}

export interface CrossRefIndex {
  typeToRelations: Record<string, string[]>;
  actionToTargetMachine: Record<string, string>;
  morphismToAssets: Record<string, string[]>;
}

export interface ModelBoot {
  origin: string;
  kernel?: AlgebraicKernel;
  types: TypeRef[];
  stateMachineId: string | undefined;
  actions: Record<string, string>;
  getActionDef(ref: string): ActionDef | undefined;
  submit(
    verb: string,
    targetKey: string,
    payload?: Record<string, unknown>,
    capabilityId?: string,
  ): Promise<{
    success: boolean;
    newState?: unknown;
    error?: string;
    events: Array<{ id: string; previousState: unknown; newState: unknown }>;
  }>;
  batch(
    calls: Array<{ verb: string; target: string; payload?: Record<string, unknown> }>,
  ): Promise<void>;
  setState(targetKey: string, state: unknown): void;
  getState(targetKey: string): unknown | undefined;
  readStoreForBinding(bindingName: string, targetKey: string): unknown | undefined;
  listStoreForBinding(bindingName: string): Array<[string, unknown]>;
  currentStateForMachine(machineId: string, aggregateKey: string): unknown | undefined;
  removeInstance(targetKey: string): void;
  listStateKeys(): string[];
  listInstances(): Array<{ key: string; state: unknown }>;
  onEvent(
    handler: (event: {
      id: string;
      kind?: "submitted" | "removed" | "transactionCommitted";
      action: string;
      targetKey: string;
      previousState: unknown;
      newState: unknown;
      events: Array<{
        id: string;
        kind?: "submitted" | "removed";
        action: string;
        targetKey: string;
        previousState: unknown;
        newState: unknown;
      }>;
      timestamp?: string;
    }) => void,
  ): () => void;
  issueCapability(verb: string, issuerId: string, caveats?: unknown[]): string;
  flush?(): Promise<void>;
  dispose?(): Promise<void> | void;
  restart?(): Promise<ModelBoot>;
}
