/**
 * Layer 11: KernelStream — event-driven facade for the Axiomatic Data Kernel.
 *
 * Integrates with the github.com/Stream44/s44-rak-gen1@1.0 architecture:
 * - Commands stream in  (AsyncIterable<KernelCommand>)
 * - Events stream out   (AsyncIterable<KernelEvent>)
 * - ProvenanceLog-compatible audit trail with hash chaining
 * - EventEmitter-style subscriptions for existing codebase compatibility
 *
 * Design follows the existing patterns:
 * - CrossingEvent structure for provenance entries
 * - Content-addressed identity for every emitted event
 * - Fold algebra support for stream aggregation
 */

import { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";
import { ExpressionEvaluator } from "./evaluator.ts";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import type { RegistryOptions } from "../L03-tower/registry.ts";
import type {
  TypeDef,
  TypeRef,
  Datum,
  DatumRef,
  JsonSchema,
  ValidationResult,
  TypeDefRef,
} from "../L01-foundation/types.ts";
import type { KernelExpression, EvaluationResult } from "./evaluator.ts";

// ── Commands (input stream) ───────────────────────────────────────────

export type KernelCommand =
  | { kind: "define"; typeDef: TypeDef }
  | {
      kind: "define:record";
      name: string;
      version: string;
      schema: JsonSchema;
      opts?: { description?: string; tags?: string[]; refs?: TypeDefRef[] };
    }
  | { kind: "define:enum"; name: string; version: string; values: unknown[] }
  | { kind: "define:batch"; typeDefs: TypeDef[] }
  | { kind: "validate"; typeRef: TypeRef; data: unknown }
  | { kind: "create"; typeRef: TypeRef; data: unknown; refs?: DatumRef[] }
  | { kind: "resolve"; typeRef: TypeRef }
  | { kind: "evaluate"; expr: KernelExpression; context?: Record<string, unknown> }
  | { kind: "refine"; typeRef: TypeRef; data: unknown; predicate: KernelExpression };

// ── Events (output stream) ────────────────────────────────────────────

export type KernelEvent =
  | { kind: "type:defined"; typeDef: TypeDef; cid: string; seq: number; timestamp: string }
  | { kind: "type:batch"; refs: Map<TypeRef, string>; seq: number; timestamp: string }
  | {
      kind: "validated";
      typeRef: TypeRef;
      data: unknown;
      result: ValidationResult;
      seq: number;
      timestamp: string;
    }
  | { kind: "datum:created"; datum: Datum; seq: number; timestamp: string }
  | { kind: "type:resolved"; typeDef: TypeDef; seq: number; timestamp: string }
  | { kind: "evaluated"; result: EvaluationResult; seq: number; timestamp: string }
  | {
      kind: "refined";
      typeRef: TypeRef;
      structural: ValidationResult;
      predicate: boolean | null;
      seq: number;
      timestamp: string;
    }
  | { kind: "error"; command: KernelCommand; error: string; seq: number; timestamp: string };

// ── Provenance (audit trail) ──────────────────────────────────────────

export interface StreamProvenanceEntry {
  seq: number;
  prev_hash: string;
  action: string;
  timestamp: string;
  command_hash: string;
  event_hash: string;
}

// ── Subscription ──────────────────────────────────────────────────────

export type EventKind = KernelEvent["kind"];
export type EventHandler = (event: KernelEvent) => void;
export type EventFilter = (event: KernelEvent) => boolean;

// ── Fold Algebra (stream aggregation) ─────────────────────────────────

export interface FoldAlgebra<A> {
  init: A;
  step: (acc: A, event: KernelEvent) => A;
}

// ── KernelStream ──────────────────────────────────────────────────────

export class KernelStream {
  readonly kernel: MetamodelKernel;
  readonly evaluator: ExpressionEvaluator;

  private encoder = new JsonEncoder();
  private seq = 0;
  private headHash = "";
  private provenance: StreamProvenanceEntry[] = [];
  private handlers = new Map<EventKind | "*", Set<EventHandler>>();

  constructor(opts?: RegistryOptions & { maxGas?: number }) {
    this.kernel = MetamodelKernel.create(opts);
    this.evaluator = new ExpressionEvaluator({ maxGas: opts?.maxGas });
  }

  // ── Single command processing ─────────────────────────────────────

  process(command: KernelCommand): KernelEvent {
    const timestamp = new Date().toISOString();
    const seqNum = this.seq++;
    let event: KernelEvent;

    try {
      switch (command.kind) {
        case "define": {
          const cid = this.kernel.defineType(command.typeDef);
          event = { kind: "type:defined", typeDef: command.typeDef, cid, seq: seqNum, timestamp };
          break;
        }

        case "define:record": {
          const typeDef: TypeDef = {
            id: `type://github.com/Stream44/s44-rak-gen1@1.0/${command.name}/${command.version}`,
            level: 1,
            conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
            schema: command.schema,
            name: command.name,
            version: command.version,
            description: command.opts?.description,
            tags: command.opts?.tags,
            refs: command.opts?.refs,
          };
          const cid = this.kernel.defineType(typeDef);
          event = { kind: "type:defined", typeDef, cid, seq: seqNum, timestamp };
          break;
        }

        case "define:enum": {
          const cid = this.kernel.defineEnum(command.name, command.version, command.values);
          const typeDef = this.kernel.resolveType(
            `type://github.com/Stream44/s44-rak-gen1@1.0/${command.name}/${command.version}`,
          );
          event = { kind: "type:defined", typeDef, cid, seq: seqNum, timestamp };
          break;
        }

        case "define:batch": {
          const refs = this.kernel.defineTypes(command.typeDefs);
          event = { kind: "type:batch", refs, seq: seqNum, timestamp };
          break;
        }

        case "validate": {
          const result = this.kernel.validate(command.typeRef, command.data);
          event = {
            kind: "validated",
            typeRef: command.typeRef,
            data: command.data,
            result,
            seq: seqNum,
            timestamp,
          };
          break;
        }

        case "create": {
          const datum = this.kernel.createDatum(command.typeRef, command.data, command.refs);
          event = { kind: "datum:created", datum, seq: seqNum, timestamp };
          break;
        }

        case "resolve": {
          const typeDef = this.kernel.resolveType(command.typeRef);
          event = { kind: "type:resolved", typeDef, seq: seqNum, timestamp };
          break;
        }

        case "evaluate": {
          const result = this.evaluator.evaluate(command.expr, command.context);
          event = { kind: "evaluated", result, seq: seqNum, timestamp };
          break;
        }

        case "refine": {
          const structural = this.kernel.validate(command.typeRef, command.data);
          let predicateResult: boolean | null = null;
          if (structural.valid) {
            const evalResult = this.evaluator.evaluate(command.predicate, { $self: command.data });
            predicateResult = evalResult.value === true;
          }
          event = {
            kind: "refined",
            typeRef: command.typeRef,
            structural,
            predicate: predicateResult,
            seq: seqNum,
            timestamp,
          };
          break;
        }

        default:
          event = {
            kind: "error",
            command,
            error: `Unknown command kind: ${(command as any).kind}`,
            seq: seqNum,
            timestamp,
          };
      }
    } catch (err) {
      event = { kind: "error", command, error: (err as Error).message, seq: seqNum, timestamp };
    }

    this.appendProvenance(command, event);
    this.emit(event);
    return event;
  }

  // ── Stream processing (pipe) ──────────────────────────────────────

  async *pipe(
    commands: AsyncIterable<KernelCommand> | Iterable<KernelCommand>,
  ): AsyncGenerator<KernelEvent> {
    for await (const command of commands) {
      yield this.process(command);
    }
  }

  // ── Batch processing ──────────────────────────────────────────────

  processAll(commands: KernelCommand[]): KernelEvent[] {
    return commands.map((cmd) => this.process(cmd));
  }

  // ── Fold (stream aggregation) ─────────────────────────────────────

  fold<A>(commands: KernelCommand[], algebra: FoldAlgebra<A>): A {
    let acc = algebra.init;
    for (const cmd of commands) {
      const event = this.process(cmd);
      acc = algebra.step(acc, event);
    }
    return acc;
  }

  async foldAsync<A>(
    commands: AsyncIterable<KernelCommand> | Iterable<KernelCommand>,
    algebra: FoldAlgebra<A>,
  ): Promise<A> {
    let acc = algebra.init;
    for await (const event of this.pipe(commands)) {
      acc = algebra.step(acc, event);
    }
    return acc;
  }

  // ── Subscriptions ─────────────────────────────────────────────────

  on(kind: EventKind | "*", handler: EventHandler): () => void {
    if (!this.handlers.has(kind)) this.handlers.set(kind, new Set());
    this.handlers.get(kind)!.add(handler);
    return () => {
      this.handlers.get(kind)?.delete(handler);
    };
  }

  /** Subscribe with a filter predicate. */
  where(filter: EventFilter, handler: EventHandler): () => void {
    return this.on("*", (event) => {
      if (filter(event)) handler(event);
    });
  }

  /** Wait for a single event matching the filter, with optional timeout. */
  when(filter: EventFilter, timeoutMs = 5000): Promise<KernelEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error("KernelStream.when() timed out"));
      }, timeoutMs);

      const unsub = this.where(filter, (event) => {
        clearTimeout(timer);
        unsub();
        resolve(event);
      });
    });
  }

  // ── Provenance (audit trail) ──────────────────────────────────────

  get provenanceLength(): number {
    return this.provenance.length;
  }

  provenanceTail(n: number): StreamProvenanceEntry[] {
    return this.provenance.slice(-n).reverse();
  }

  provenanceHead(): StreamProvenanceEntry | null {
    return this.provenance.at(-1) ?? null;
  }

  /** Verify the integrity of the provenance chain. */
  verifyProvenance(): boolean {
    let expectedPrevHash = "";
    for (const entry of this.provenance) {
      if (entry.prev_hash !== expectedPrevHash) return false;
      expectedPrevHash = this.hashEntry(entry);
    }
    return this.headHash === expectedPrevHash;
  }

  // ── Private ───────────────────────────────────────────────────────

  private appendProvenance(command: KernelCommand, event: KernelEvent): void {
    const entry: StreamProvenanceEntry = {
      seq: event.seq,
      prev_hash: this.headHash,
      action: command.kind,
      timestamp: event.timestamp,
      command_hash: this.hashValue(command),
      event_hash: this.hashValue(event),
    };
    this.headHash = this.hashEntry(entry);
    this.provenance.push(entry);
  }

  private emit(event: KernelEvent): void {
    // Notify kind-specific handlers
    const kindHandlers = this.handlers.get(event.kind);
    if (kindHandlers) {
      for (const handler of kindHandlers) {
        try {
          handler(event);
        } catch {
          /* subscriber errors don't break the stream */
        }
      }
    }
    // Notify wildcard handlers
    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch {
          /* subscriber errors don't break the stream */
        }
      }
    }
  }

  private hashValue(value: unknown): string {
    const bytes = this.encoder.encode(value);
    return this.encoder.hash(bytes);
  }

  private hashEntry(entry: StreamProvenanceEntry): string {
    return this.hashValue({
      seq: entry.seq,
      prev_hash: entry.prev_hash,
      action: entry.action,
      timestamp: entry.timestamp,
      command_hash: entry.command_hash,
      event_hash: entry.event_hash,
    });
  }
}
