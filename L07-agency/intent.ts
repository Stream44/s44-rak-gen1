import { randomUUID } from "node:crypto";
import type {
  ActionKind,
  ActionType,
  BatchSubmitDef,
  KeyStrategy,
} from "../L01-foundation/action-type.ts";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import { MetaLevel, type JsonSchema } from "../L01-foundation/types.ts";
import { SchemaValidator } from "../L01-foundation/validator.ts";
import type { KernelExpression } from "../L04-expression/evaluator.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import { authorizeCapability } from "./intent/modules/authorize-capability.ts";
import { checkPreconditions } from "./intent/modules/check-preconditions.ts";
import { emitEvents } from "./intent/modules/emit-events.ts";
import { validatePayload } from "./intent/modules/validate-payload.ts";

export type {
  ActionKind,
  ActionType,
  BatchSubmitDef,
  KeyStrategy,
} from "../L01-foundation/action-type.ts";

export interface Intent {
  id: string;
  cid?: string;
  action: string;
  actionId?: string;
  target: string;
  targetKey: string;
  payload: unknown;
  capabilities?: string[];
  issuer?: string;
  timestamp: string;
}

export interface IntentResult {
  success: boolean;
  intent: Intent;
  previousState?: unknown;
  newState?: unknown;
  emittedEvents: EmittedEvent[];
  error?: string;
}

export type EmittedEventKind = "submitted" | "removed" | "transactionCommitted";
export type TransactionHandle = string;

export interface SubmittedEvent {
  kind?: "submitted";
  id: string;
  entity?: string;
  targetMachine?: string;
  verb: string;
  type: string;
  source: string;
  targetKey: string;
  beforeState: unknown;
  afterState: unknown;
  payload: unknown;
  at: string;
  causationKey: string;
  data: { previousState: unknown; newState: unknown; payload: unknown };
  causedBy: string;
  timestamp: string;
}

export interface RemovedEvent {
  kind: "removed";
  entity?: string;
  targetMachine?: string;
  targetKey: string;
  at: string;
  previousState: unknown;
  newState: undefined;
  id: string;
  timestamp: string;
}

export interface TransactionCommittedEvent {
  kind: "transactionCommitted";
  id: string;
  transactionId: string;
  // SubmittedEvent and RemovedEvent both carry targetKey as a first-class field.
  events: Array<SubmittedEvent | RemovedEvent>;
  timestamp: string;
}

export type EmittedEvent = SubmittedEvent | RemovedEvent | TransactionCommittedEvent;

export interface IntentStageInput {
  action: string;
  target: string;
  targetKey: string;
  payload: object;
  issuer?: string;
}

export interface IntentStageCarrier {
  intent: Intent;
  action: ActionType | string;
  currentState?: unknown;
  previousState?: unknown;
  abort?: { error: string };
}

const submitChain = async (
  input: IntentStageInput,
  context?: { $processor?: IntentProcessor },
): Promise<IntentResult> => {
  const validated = validatePayload(input, context);
  const checked = checkPreconditions(validated, context);
  const authorized = authorizeCapability(checked, context);
  return await emitEvents(authorized, context);
};

export function computeIntentCid(
  encoder: JsonEncoder,
  input: Pick<IntentStageInput, "action" | "target" | "payload"> & { capabilities?: string[] },
): string {
  return encoder.encodeAndHash({
    actionId: input.action,
    payload: input.payload,
    target: input.target ?? null,
    capabilities: input.capabilities ?? [],
  }).cid;
}

/** Namespace key format: bindings/<bindingName>/<targetKey>. */
function nsKey(bindingName: string, targetKey: string): string {
  return `bindings/${bindingName}/${targetKey}`;
}

export class IntentProcessor {
  readonly actions = new Map<string, ActionType>();
  readonly stateStore = new Map<string, unknown>();
  readonly eventHandlers: Array<(event: EmittedEvent) => void> = [];
  readonly transactionCommitHandlers: Array<(event: TransactionCommittedEvent) => void> = [];
  readonly transaction = { active: false };
  readonly encoder = new JsonEncoder();
  readonly validator = new SchemaValidator();
  readonly ak: AlgebraicKernel;
  private transactionHandle: TransactionHandle | null = null;
  private transactionSnapshot: Map<string, unknown> | null = null;
  private transactionBuffer: Array<SubmittedEvent | RemovedEvent> = [];
  private readonly machineAggregateBindings = new Map<string, string>();

  constructor(readonly kernel: AlgebraicKernel) {
    this.ak = kernel;
    ensureIntentMorphismTypes(this.kernel);
    // registerMorphismDocument(...) is intentionally not invoked at runtime here
    // because the current adapter import path introduces bootstrap cycles.
  }

  defineAction(
    name: string,
    version: string,
    opts: {
      verb: string;
      inputSchema?: JsonSchema;
      targetMachine?: string | null;
      entity?: string;
      preconditions?: KernelExpression[];
      kind?: ActionKind;
      targetField?: string;
      keyField?: string;
      keyStrategy?: KeyStrategy;
      defaults?: Record<string, unknown>;
      selector?: unknown;
      submit?: BatchSubmitDef;
      origin?: string;
    },
  ): ActionType {
    const origin = opts.origin ?? "github.com/Stream44/s44-rak-gen1@1.0";
    const id = `action://${origin}/${name}/${version}`;
    const targetMachine = opts.targetMachine ?? "";
    const preconditions = opts.preconditions ?? [];
    const inputSchema = opts.inputSchema ?? { type: "object" };
    const kind = opts.kind ?? "mutate";
    const { cid } = this.encoder.encodeAndHash({
      name,
      version,
      verb: opts.verb,
      inputSchema,
      targetMachine: opts.targetMachine ?? null,
      entity: opts.entity ?? null,
      preconditions,
      kind,
      targetField: opts.targetField ?? null,
      keyField: opts.keyField ?? null,
      keyStrategy: opts.keyStrategy ?? null,
      defaults: opts.defaults ?? null,
      selector: opts.selector ?? null,
      submit: opts.submit ?? null,
      origin: opts.origin ?? null,
    });
    const action: ActionType = {
      id,
      cid,
      name,
      version,
      verb: opts.verb,
      inputSchema,
      targetMachine,
      entity: opts.entity,
      preconditions,
      kind,
      targetField: opts.targetField,
      keyField: opts.keyField,
      keyStrategy: opts.keyStrategy,
      defaults: opts.defaults,
      selector: opts.selector,
      submit: opts.submit,
      origin,
    };
    this.actions.set(id, action);
    return action;
  }

  /**
   * Backward-compat shim: flat state keys still address the primary entity
   * binding directly. Namespaced binding access is additive.
   */
  setState(targetKey: string, state: unknown): void {
    this.stateStore.set(targetKey, state);
  }

  /** Write state under a named binding's namespace. */
  setStateForBinding(bindingName: string, targetKey: string, state: unknown): void {
    this.stateStore.set(nsKey(bindingName, targetKey), state);
  }

  /** Read state under a named binding's namespace. */
  readStoreForBinding(bindingName: string, targetKey: string): unknown | undefined {
    return this.stateStore.get(nsKey(bindingName, targetKey));
  }

  /** Enumerate (targetKey, state) pairs for one binding. */
  listStoreForBinding(bindingName: string): Array<[string, unknown]> {
    const prefix = `bindings/${bindingName}/`;
    const out: Array<[string, unknown]> = [];
    for (const [key, value] of this.stateStore) {
      if (key.startsWith(prefix)) out.push([key.slice(prefix.length), value]);
    }
    return out;
  }

  /** Remove one namespaced entry. */
  removeStateForBinding(bindingName: string, targetKey: string): void {
    this.stateStore.delete(nsKey(bindingName, targetKey));
  }

  beginTransaction(): TransactionHandle {
    if (this.transaction.active) throw new Error("Nested transactions are not supported.");
    const handle = randomUUID();
    this.transaction.active = true;
    this.transactionHandle = handle;
    this.transactionSnapshot = new Map(this.stateStore);
    this.transactionBuffer = [];
    return handle;
  }

  commitTransaction(handle: TransactionHandle): void {
    if (!this.transaction.active || this.transactionHandle !== handle) {
      throw new Error("Transaction handle is not active.");
    }
    const events = [...this.transactionBuffer];
    for (const event of events) {
      for (const handler of this.eventHandlers) handler(event);
    }
    this.transaction.active = false;
    this.transactionHandle = null;
    this.transactionSnapshot = null;
    this.transactionBuffer = [];
    const committed: TransactionCommittedEvent = {
      kind: "transactionCommitted",
      id: randomUUID(),
      transactionId: handle,
      events,
      timestamp: new Date().toISOString(),
    };
    for (const handler of this.eventHandlers) handler(committed);
    for (const handler of this.transactionCommitHandlers) handler(committed);
  }

  rollbackTransaction(handle: TransactionHandle): void {
    if (!this.transaction.active || this.transactionHandle !== handle) {
      throw new Error("Transaction handle is not active.");
    }
    this.stateStore.clear();
    for (const [key, value] of this.transactionSnapshot ?? new Map()) {
      this.stateStore.set(key, value);
    }
    this.transaction.active = false;
    this.transactionHandle = null;
    this.transactionSnapshot = null;
    this.transactionBuffer = [];
  }

  removeState(
    targetKey: string,
    metadata?: { entity?: string; targetMachine?: string; at?: string },
  ): void {
    const previousState = this.stateStore.get(targetKey);
    if (previousState === undefined) return;
    this.stateStore.delete(targetKey);
    const timestamp = metadata?.at ?? new Date().toISOString();
    this.emitEvent({
      id: randomUUID(),
      kind: "removed",
      entity: metadata?.entity,
      targetMachine: metadata?.targetMachine,
      targetKey,
      at: timestamp,
      previousState,
      newState: undefined,
      timestamp,
    });
  }

  getState(targetKey: string): unknown | undefined {
    return this.stateStore.get(targetKey);
  }

  /**
   * Resolve the current state for a state-machine aggregate keyed by
   * `aggregateKey`, by looking into the stateMachineAggregate binding's
   * namespace. Returns undefined if no such binding has been written to
   * yet (e.g. before the first transition).
   *
   * Convention: the binding name for a machine's aggregate is assumed to
   * be `<machineId>-aggregate` unless an override is registered via
   * `registerMachineAggregateBinding(machineId, bindingName)`.
   */
  currentStateForMachine(machineId: string, aggregateKey: string): unknown | undefined {
    const bindingName = this.machineAggregateBindings.get(machineId) ?? `${machineId}-aggregate`;
    return this.readStoreForBinding(bindingName, aggregateKey);
  }

  /** Register the binding name used for a machine aggregate. */
  registerMachineAggregateBinding(machineId: string, bindingName: string): void {
    this.machineAggregateBindings.set(machineId, bindingName);
  }

  async submit(partial: Omit<Intent, "id" | "timestamp">): Promise<IntentResult> {
    return await submitChain(
      {
        action: partial.action,
        target: partial.target,
        targetKey: partial.targetKey,
        payload: partial.payload as object,
        issuer: partial.issuer,
      },
      { $processor: this },
    );
  }

  async processAll(intents: Array<Omit<Intent, "id" | "timestamp">>): Promise<IntentResult[]> {
    const results: IntentResult[] = [];
    for (const intent of intents) results.push(await this.submit(intent));
    return results;
  }

  onEvent(handler: (event: EmittedEvent) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  onTransactionCommit(handler: (event: TransactionCommittedEvent) => void): () => void {
    this.transactionCommitHandlers.push(handler);
    return () => {
      const idx = this.transactionCommitHandlers.indexOf(handler);
      if (idx >= 0) this.transactionCommitHandlers.splice(idx, 1);
    };
  }

  emitEvent(event: EmittedEvent): void {
    if (this.transaction.active && event.kind !== "transactionCommitted") {
      this.transactionBuffer.push(event as SubmittedEvent | RemovedEvent);
      return;
    }
    for (const handler of this.eventHandlers) handler(event);
  }

  resolveAction(id: string): ActionType {
    const action = this.actions.get(id);
    if (!action) throw new Error(`Action not found: ${id}`);
    return action;
  }
}

function ensureIntentMorphismTypes(kernel: AlgebraicKernel): void {
  const typeDefs = [
    {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/IntentStageInput/1.0",
      name: "IntentStageInput",
      schema: {
        type: "object",
        required: ["action", "target", "targetKey", "payload"],
        properties: {
          action: { type: "string" },
          target: { type: "string" },
          targetKey: { type: "string" },
          payload: { type: "object" },
          issuer: { type: "string" },
        },
      },
    },
    {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/IntentStageCarrier/1.0",
      name: "IntentStageCarrier",
      schema: {
        type: "object",
        required: ["intent", "action"],
        properties: {
          intent: { type: "object" },
          action: {},
          currentState: {},
          previousState: {},
          abort: { type: "object" },
        },
      },
    },
    {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/IntentResult/1.0",
      name: "IntentResult",
      schema: {
        type: "object",
        required: ["success", "intent", "emittedEvents"],
        properties: {
          success: { type: "boolean" },
          intent: { type: "object" },
          previousState: {},
          newState: {},
          emittedEvents: { type: "array", items: { type: "object" } },
          error: { type: "string" },
        },
      },
    },
  ];
  for (const typeDef of typeDefs) {
    try {
      kernel.resolveType(typeDef.id);
    } catch {
      kernel.defineType({
        id: typeDef.id,
        level: MetaLevel.Model,
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        name: typeDef.name,
        version: "1.0",
        schema: typeDef.schema as never,
      });
    }
  }
}
