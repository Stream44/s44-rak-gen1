/**
 * Layer 6: TypeRegistry — the core of the metamodel tower.
 */

import {
  MetaLevel,
  TypeNotFoundError,
  TypeConformanceError,
  TypeLevelError,
  DatumValidationError,
  BatchDefinitionError,
} from "../L01-foundation/types.ts";
import type {
  TypeDef,
  TypeRef,
  Datum,
  DatumRef,
  ValidationResult,
  SubtypeResult,
  JsonSchema,
  Encoder,
  ContentStore,
  RegistryEvent,
  RegistryEventListener,
} from "../L01-foundation/types.ts";
import { JsonEncoder, MemoryStore } from "../L01-foundation/encoder.ts";
import { SchemaValidator } from "../L01-foundation/validator.ts";
import { ConformanceEngine } from "./conformance.ts";
import { TypeGraph } from "./graph.ts";
import { BOOTSTRAP_TYPES, BOOTSTRAP_INDEX, M3_META } from "./bootstrap.ts";
import {
  ALGEBRA_OPERATOR_METAMODEL,
  type AlgebraOperatorM1,
} from "../L02-metamodels/algebra-operator.ts";
import { MORPHISM_DOCUMENT_M2 } from "../L02-metamodels/morphism-document.ts";
import type { AssetRegistry } from "../L11-projection/asset-registry.ts";

export interface RegistryOptions {
  encoder?: Encoder;
  store?: ContentStore;
  storeRef?: { ref: string; registry: AssetRegistry };
  skipBootstrap?: boolean;
}

interface RegistryAuditEvent {
  ts: number;
  op: "type:defined" | "registry:rebound";
  cid: string;
  name?: string;
  oldCid?: string | null;
}

export class TypeRegistry {
  readonly graph: TypeGraph;
  private cache = new Map<TypeRef, TypeDef>();
  private nameIndex = new Map<string, string>();
  private auditLog: RegistryAuditEvent[] = [];
  private encoder: Encoder;
  private store: ContentStore;
  private validator: SchemaValidator;
  private conformance: ConformanceEngine;
  private listeners: RegistryEventListener[] = [];
  private rebindListeners = new Set<
    (event: { name: string; oldCid: string | null; newCid: string }) => void
  >();
  private bootstrapped = false;

  constructor(options?: RegistryOptions) {
    this.encoder = options?.encoder ?? new JsonEncoder();
    if (options?.store && options?.storeRef) {
      throw new Error("TypeRegistry: pass either store OR storeRef, not both");
    }
    if (options?.storeRef) {
      const asset = options.storeRef.registry.resolve(options.storeRef.ref, "content-store");
      if (!asset) {
        throw new Error(
          `TypeRegistry: content-store ref '${options.storeRef.ref}' not found in asset registry`,
        );
      }
      throw new Error(
        "TypeRegistry: storeRef requires async construction; use TypeRegistry.createFromRef()",
      );
    }
    this.store = options?.store ?? new MemoryStore();
    this.validator = new SchemaValidator();
    this.conformance = new ConformanceEngine(this.validator, { registry: this });
    this.graph = new TypeGraph();

    if (!options?.skipBootstrap) {
      this.bootstrap();
    }
  }

  /**
   * Boot-time-only asset swap: resolve the store once during construction and
   * keep the resulting registry fully synchronous for the rest of its lifetime.
   */
  static async createFromRef(
    options: RegistryOptions & { storeRef: NonNullable<RegistryOptions["storeRef"]> },
  ): Promise<TypeRegistry> {
    if (options.store) {
      throw new Error("TypeRegistry: pass either store OR storeRef, not both");
    }
    const asset = options.storeRef.registry.resolve(options.storeRef.ref, "content-store");
    if (!asset) {
      throw new Error(
        `TypeRegistry: content-store ref '${options.storeRef.ref}' not found in asset registry`,
      );
    }
    if (asset.implementation.kind !== "module") {
      throw new Error(
        `TypeRegistry: content-store ref '${options.storeRef.ref}' must use a module implementation`,
      );
    }
    const modulePath = new URL(
      `../L08-kinds/${asset.conformsToKind}/${asset.implementation.module.replace("./", "")}`,
      import.meta.url,
    ).pathname;
    const mod = await import(modulePath);
    const exportName = asset.implementation.export ?? "default";
    const Ctor = mod[exportName as keyof typeof mod] as (new () => ContentStore) | undefined;
    if (typeof Ctor !== "function") {
      throw new Error(
        `TypeRegistry: content-store ref '${options.storeRef.ref}' missing export '${exportName}'`,
      );
    }
    return new TypeRegistry({ ...options, store: new Ctor(), storeRef: undefined });
  }

  // ── Bootstrap ───────────────────────────────────────────────────────

  private cacheType(typeDef: TypeDef, cid?: string): void {
    this.cache.set(typeDef.id, typeDef);
    if (cid) this.cache.set(cid, typeDef);
    for (const alias of typeDef.aliases ?? []) this.cache.set(alias, typeDef);
  }

  bootstrap(): void {
    if (this.bootstrapped) return;

    // Step 1: Register M3 (the axiom, self-referential)
    // Validate M3 against itself
    const m3result = this.validator.validate(M3_META, M3_META.schema);
    if (!m3result.valid) {
      throw new Error(`M3 bootstrap failed: ${m3result.errors.map((e) => e.message).join("; ")}`);
    }
    this.cacheType(M3_META);
    this.graph.addType(M3_META);

    // Step 2: Register M2 metamodels (each conforms to M3)
    for (const m2 of BOOTSTRAP_TYPES) {
      if (m2.id === M3_META.id) continue; // skip M3

      const result = this.validator.validate(m2, M3_META.schema);
      if (!result.valid) {
        throw new Error(
          `M2 bootstrap failed for ${m2.id}: ${result.errors.map((e) => e.message).join("; ")}`,
        );
      }
      this.cacheType(m2);
      this.graph.addType(m2);
    }

    this.bootstrapped = true;
  }

  // ── Define ──────────────────────────────────────────────────────────

  defineType(typeDef: TypeDef): string {
    // 1. Validate shape against M3
    const shapeResult = this.validator.validate(typeDef, M3_META.schema);
    if (!shapeResult.valid) {
      throw new TypeConformanceError(typeDef.id, M3_META.id, shapeResult.errors);
    }

    // 2. Resolve parent
    const parent = this.resolveType(typeDef.conformsTo);

    // 3. Level constraint
    const levelErr = this.conformance.checkLevel(typeDef, parent);
    if (levelErr) {
      throw new TypeLevelError(typeDef.id, typeDef.level, parent.level);
    }

    // 4. Validate against parent schema
    const conformResult = this.validator.validate(typeDef, parent.schema);
    if (!conformResult.valid) {
      throw new TypeConformanceError(typeDef.id, typeDef.conformsTo, conformResult.errors);
    }

    // 5. Encode, hash, store
    const bytes = this.encoder.encode(typeDef);
    const cid = this.encoder.hash(bytes);
    this.store.put(cid, bytes);
    this.cacheType(typeDef, cid);
    this.graph.addType(typeDef);

    this.emit({ kind: "type:defined", typeDef, cid });
    return cid;
  }

  defineTypes(typeDefs: TypeDef[]): Map<TypeRef, string> {
    // Validate all before committing any
    const results = new Map<TypeRef, string>();
    const failures = new Map<TypeRef, Error>();

    // Temporarily add all to cache for circular reference resolution
    const tempCache = new Map<TypeRef, TypeDef>();
    for (const td of typeDefs) {
      tempCache.set(td.id, td);
    }

    for (const td of typeDefs) {
      try {
        // Shape validation
        const shapeResult = this.validator.validate(td, M3_META.schema);
        if (!shapeResult.valid) {
          failures.set(td.id, new TypeConformanceError(td.id, M3_META.id, shapeResult.errors));
          continue;
        }

        // Resolve parent (check batch first, then registry)
        const parent = tempCache.get(td.conformsTo) ?? this.tryResolveType(td.conformsTo);
        if (!parent) {
          failures.set(td.id, new TypeNotFoundError(td.conformsTo));
          continue;
        }

        // Level check
        const levelErr = this.conformance.checkLevel(td, parent);
        if (levelErr) {
          failures.set(td.id, new TypeLevelError(td.id, td.level, parent.level));
          continue;
        }

        // Conformance
        const conformResult = this.validator.validate(td, parent.schema);
        if (!conformResult.valid) {
          failures.set(td.id, new TypeConformanceError(td.id, td.conformsTo, conformResult.errors));
          continue;
        }
      } catch (e) {
        failures.set(td.id, e as Error);
      }
    }

    if (failures.size > 0) {
      throw new BatchDefinitionError(failures);
    }

    // All valid — commit
    for (const td of typeDefs) {
      const bytes = this.encoder.encode(td);
      const cid = this.encoder.hash(bytes);
      this.store.put(cid, bytes);
      this.cacheType(td, cid);
      this.graph.addType(td);
      results.set(td.id, cid);
      this.emit({ kind: "type:defined", typeDef: td, cid });
    }

    return results;
  }

  // ── Resolve ─────────────────────────────────────────────────────────

  resolveType(ref: TypeRef): TypeDef {
    const td = this.tryResolveType(ref);
    if (!td) throw new TypeNotFoundError(ref);
    return td;
  }

  tryResolveType(ref: TypeRef): TypeDef | undefined {
    // Cache first
    const cached = this.cache.get(ref);
    if (cached) return cached;

    // Bootstrap index
    const boot = BOOTSTRAP_INDEX.get(ref);
    if (boot) return boot;

    return undefined;
  }

  bind(name: string, cid: string): void {
    if (!this.cache.has(cid)) throw new Error(`Registry.bind: unknown cid ${cid}`);
    const oldCid = this.nameIndex.get(name) ?? null;
    this.nameIndex.set(name, cid);
    if (oldCid !== cid) {
      const event = { name, oldCid, newCid: cid };
      this.emit({ kind: "registry:rebound", ...event });
      this.rebindListeners.forEach((handler) => handler(event));
    }
  }

  resolveByName(name: string): { cid: string; typeDef: TypeDef } | null {
    const cid = this.nameIndex.get(name);
    if (!cid) return null;
    const typeDef = this.cache.get(cid);
    if (!typeDef) return null;
    return { cid, typeDef };
  }

  rebind(name: string, newCid: string): void {
    this.bind(name, newCid);
  }

  // ── Validate ────────────────────────────────────────────────────────

  validateData(data: unknown, typeRef: TypeRef): ValidationResult {
    const typeDef = this.resolveType(typeRef);
    return this.validator.validate(data, typeDef.schema);
  }

  validateDataDeep(data: unknown, typeRef: TypeRef): ValidationResult {
    const typeDef = this.resolveType(typeRef);
    return this.validator.validateDeep(data, typeDef.schema, (ref) => this.tryResolveType(ref));
  }

  createDatum<T = unknown>(data: T, typeRef: TypeRef, refs?: DatumRef[]): Datum<T> {
    const result = this.validateData(data, typeRef);
    if (!result.valid) {
      throw new DatumValidationError(typeRef, result.errors);
    }

    const bytes = this.encoder.encode(data);
    const cid = this.encoder.hash(bytes);

    const datum: Datum<T> = {
      id: cid,
      type: typeRef,
      data,
      refs: refs ?? [],
    };

    this.emit({ kind: "datum:created", datum: datum as Datum, typeRef });
    return datum;
  }

  validateDatum(datum: Datum): ValidationResult {
    return this.validateData(datum.data, datum.type);
  }

  // ── Conformance ─────────────────────────────────────────────────────

  conformsTo(childRef: TypeRef, parentRef: TypeRef): boolean {
    const child = this.resolveType(childRef);
    const parent = this.resolveType(parentRef);

    if (childRef === parentRef) return true;

    const result = this.conformance.checkTransitive(child, parent, (ref) => this.resolveType(ref));
    this.emit({
      kind: "conformance:checked",
      child: childRef,
      parent: parentRef,
      result: result.valid,
    });
    return result.valid;
  }

  getConformanceChain(ref: TypeRef): TypeDef[] {
    const start = this.resolveType(ref);
    return this.conformance.walkChain(start, (r) => this.resolveType(r));
  }

  // ── Subtyping ───────────────────────────────────────────────────────

  isSubtype(childRef: TypeRef, parentRef: TypeRef): SubtypeResult {
    const child = this.resolveType(childRef);
    const parent = this.resolveType(parentRef);
    return this.validator.isSubtype(child.schema, parent.schema);
  }

  // ── Lattice ─────────────────────────────────────────────────────────

  computeJoin(refA: TypeRef, refB: TypeRef): JsonSchema {
    const a = this.resolveType(refA);
    const b = this.resolveType(refB);
    // JOIN: common properties with loosest constraints
    const propsA = a.schema.properties ?? {};
    const propsB = b.schema.properties ?? {};
    const commonKeys = Object.keys(propsA).filter((k) => k in propsB);
    const properties: Record<string, JsonSchema> = {};
    for (const key of commonKeys) {
      properties[key] = this.joinProperty(propsA[key] as JsonSchema, propsB[key] as JsonSchema);
    }
    // Required: only fields required in both
    const reqA = new Set(a.schema.required ?? []);
    const reqB = new Set(b.schema.required ?? []);
    const required = commonKeys.filter((k) => reqA.has(k) && reqB.has(k));

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  computeMeet(refA: TypeRef, refB: TypeRef): JsonSchema {
    const a = this.resolveType(refA);
    const b = this.resolveType(refB);
    // MEET: all properties with tightest constraints
    const propsA = a.schema.properties ?? {};
    const propsB = b.schema.properties ?? {};
    const allKeys = new Set([...Object.keys(propsA), ...Object.keys(propsB)]);
    const properties: Record<string, JsonSchema> = {};
    for (const key of allKeys) {
      if (key in propsA && key in propsB) {
        properties[key] = this.meetProperty(propsA[key] as JsonSchema, propsB[key] as JsonSchema);
      } else {
        properties[key] = (propsA[key] ?? propsB[key]) as JsonSchema;
      }
    }
    // Required: union of both
    const required = [...new Set([...(a.schema.required ?? []), ...(b.schema.required ?? [])])];

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  // ── Query ───────────────────────────────────────────────────────────

  listTypes(level?: MetaLevel): TypeDef[] {
    if (level !== undefined) {
      return this.graph
        .byLevel(level)
        .map((ref) => this.tryResolveType(ref))
        .filter(Boolean) as TypeDef[];
    }
    return this.graph
      .allTypes()
      .map((ref) => this.tryResolveType(ref))
      .filter(Boolean) as TypeDef[];
  }

  findTypes(query: string): TypeDef[] {
    const lower = query.toLowerCase();
    return this.listTypes().filter(
      (t) => (t.name && t.name.toLowerCase().includes(lower)) || t.id.toLowerCase().includes(lower),
    );
  }

  listAlgebraOperators(): AlgebraOperatorM1[] {
    return this.listTypes(MetaLevel.Model).filter(
      (typeDef): typeDef is AlgebraOperatorM1 =>
        typeDef.conformsTo === ALGEBRA_OPERATOR_METAMODEL.id,
    );
  }

  listMorphisms(): TypeDef[] {
    return this.listTypes(MetaLevel.Model).filter(
      (typeDef) => typeDef.conformsTo === MORPHISM_DOCUMENT_M2.id,
    );
  }

  listByConformsTo(cid: string): TypeDef[] {
    return this.listTypes().filter((typeDef) => typeDef.conformsTo === cid);
  }

  listByMetalevel(level: MetaLevel): TypeDef[] {
    return this.listTypes(level);
  }

  history(filter?: { name?: string; cid?: string }): RegistryAuditEvent[] {
    const events = filter
      ? this.auditLog.filter(
          (event) =>
            (!filter.name || event.name === filter.name) &&
            (!filter.cid || event.cid === filter.cid),
        )
      : this.auditLog;
    return events.map((event) => ({ ...event }));
  }

  hasType(ref: TypeRef): boolean {
    return this.tryResolveType(ref) !== undefined;
  }

  typeCount(level?: MetaLevel): number {
    return this.listTypes(level).length;
  }

  // ── Events ──────────────────────────────────────────────────────────

  on(listener: RegistryEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  onRebind(
    handler: (event: { name: string; oldCid: string | null; newCid: string }) => void,
  ): () => void {
    this.rebindListeners.add(handler);
    return () => this.rebindListeners.delete(handler);
  }

  subscribeToRules(names: string[], handler: (name: string, newCid: string) => void): () => void {
    const subscribed = new Set(names);
    return this.onRebind((event) => {
      if (subscribed.has(event.name)) handler(event.name, event.newCid);
    });
  }

  // ── Private Lattice Helpers ─────────────────────────────────────────

  private joinProperty(a: JsonSchema, b: JsonSchema): JsonSchema {
    const result: JsonSchema = {};
    // Type: must match
    if (a.type === b.type) result.type = a.type;
    // Numeric: loosest
    if (a.minimum !== undefined && b.minimum !== undefined) {
      result.minimum = Math.min(a.minimum, b.minimum);
    }
    if (a.maximum !== undefined && b.maximum !== undefined) {
      result.maximum = Math.max(a.maximum, b.maximum);
    }
    if (a.minLength !== undefined && b.minLength !== undefined) {
      result.minLength = Math.min(a.minLength, b.minLength);
    }
    if (a.maxLength !== undefined && b.maxLength !== undefined) {
      result.maxLength = Math.max(a.maxLength, b.maxLength);
    }
    return result;
  }

  private meetProperty(a: JsonSchema, b: JsonSchema): JsonSchema {
    const result: JsonSchema = {};
    if (a.type === b.type) result.type = a.type;
    // Tightest
    if (a.minimum !== undefined || b.minimum !== undefined) {
      result.minimum = Math.max(a.minimum ?? -Infinity, b.minimum ?? -Infinity);
    }
    if (a.maximum !== undefined || b.maximum !== undefined) {
      result.maximum = Math.min(a.maximum ?? Infinity, b.maximum ?? Infinity);
    }
    if (a.minLength !== undefined || b.minLength !== undefined) {
      result.minLength = Math.max(a.minLength ?? 0, b.minLength ?? 0);
    }
    if (a.maxLength !== undefined || b.maxLength !== undefined) {
      result.maxLength = Math.min(a.maxLength ?? Infinity, b.maxLength ?? Infinity);
    }
    return result;
  }

  private emit(event: RegistryEvent): void {
    if (event.kind === "type:defined") {
      this.auditLog.push({ ts: Date.now(), op: event.kind, cid: event.cid });
    } else if (event.kind === "registry:rebound") {
      this.auditLog.push({
        ts: Date.now(),
        op: event.kind,
        cid: event.newCid,
        name: event.name,
        oldCid: event.oldCid,
      });
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors don't affect registry operation
      }
    }
  }
}
