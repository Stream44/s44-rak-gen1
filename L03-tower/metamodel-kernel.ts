/**
 * Layer 8: MetamodelKernel — the primary entry point for the SDK.
 */

import { MetaLevel, TypeRelation } from "../L01-foundation/types.ts";
import type {
  TypeDef,
  TypeRef,
  TypeDefRef,
  Datum,
  DatumRef,
  JsonSchema,
  JsonSchemaType,
  ValidationResult,
  SubtypeResult,
  CompatibilityResult,
  Compatibility,
  MigrationStep,
  RegistryEventListener,
  TowerExport,
} from "../L01-foundation/types.ts";
import { TypeRegistry, type RegistryOptions } from "./registry.ts";
import { SchemaComposer } from "./composer.ts";
import { CompatibilityChecker } from "./compatibility/engine.ts";
import { RecordSchemaBuilder } from "./builder.ts";
import { TypeGraph } from "./graph.ts";
import { buildTypeUri, ADK_ORIGIN } from "../L01-foundation/utils.ts";
import { BOOTSTRAP_TYPES } from "./bootstrap.ts";

export class MetamodelKernel {
  readonly registry: TypeRegistry;
  readonly composer: SchemaComposer;
  readonly compat: CompatibilityChecker;
  readonly graph: TypeGraph;

  private constructor(registry: TypeRegistry) {
    this.registry = registry;
    this.graph = registry.graph;
    this.composer = new SchemaComposer((ref) => registry.resolveType(ref));
    this.compat = new CompatibilityChecker();
  }

  static create(options?: RegistryOptions): MetamodelKernel {
    const registry = new TypeRegistry(options);
    return new MetamodelKernel(registry);
  }

  // ── M1 Type Definition ──────────────────────────────────────────────

  defineRecord(
    name: string,
    version: string,
    build: (builder: RecordSchemaBuilder) => void,
    opts?: { description?: string; tags?: string[]; refs?: TypeDefRef[] },
  ): string {
    const builder = new RecordSchemaBuilder();
    build(builder);
    const schema = builder.build();

    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
      refs: opts?.refs,
    };

    return this.registry.defineType(typeDef);
  }

  defineEnum(
    name: string,
    version: string,
    values: unknown[],
    opts?: {
      type?: JsonSchemaType;
      description?: string;
      tags?: string[];
    },
  ): string {
    const schema: JsonSchema = { enum: values };
    if (opts?.type) schema.type = opts.type;

    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
    };

    return this.registry.defineType(typeDef);
  }

  defineUnion(
    name: string,
    version: string,
    variants: JsonSchema[],
    opts?: {
      discriminator?: { propertyName: string };
      description?: string;
      tags?: string[];
    },
  ): string {
    const schema: JsonSchema = { oneOf: variants };

    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/union/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
    };

    return this.registry.defineType(typeDef);
  }

  defineCollection(
    name: string,
    version: string,
    itemSchema: JsonSchema,
    opts?: {
      minItems?: number;
      maxItems?: number;
      uniqueItems?: boolean;
      description?: string;
      tags?: string[];
    },
  ): string {
    const schema: JsonSchema = { type: "array", items: itemSchema };
    if (opts?.minItems !== undefined) schema.minItems = opts.minItems;
    if (opts?.maxItems !== undefined) schema.maxItems = opts.maxItems;
    if (opts?.uniqueItems !== undefined) schema.uniqueItems = opts.uniqueItems;

    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/collection/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
    };

    return this.registry.defineType(typeDef);
  }

  defineScalar(
    name: string,
    version: string,
    schema: JsonSchema,
    opts?: { description?: string; tags?: string[] },
  ): string {
    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
    };

    return this.registry.defineType(typeDef);
  }

  defineType(typeDef: TypeDef): string {
    return this.registry.defineType(typeDef);
  }

  defineTypes(typeDefs: TypeDef[]): Map<TypeRef, string> {
    return this.registry.defineTypes(typeDefs);
  }

  // ── M2 Metamodel Definition ─────────────────────────────────────────

  defineMetamodel(
    name: string,
    version: string,
    schema: JsonSchema,
    opts?: { description?: string; tags?: string[] },
  ): string {
    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Metamodel,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
    };

    return this.registry.defineType(typeDef);
  }

  // ── Composed Type Definition ────────────────────────────────────────

  defineExtension(
    name: string,
    version: string,
    baseRef: TypeRef,
    build: (builder: RecordSchemaBuilder) => void,
    opts?: { description?: string; tags?: string[] },
  ): string {
    const builder = new RecordSchemaBuilder();
    build(builder);
    const overrides = builder.build();
    const schema = this.composer.extend(baseRef, overrides);

    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
      refs: [{ rel: TypeRelation.Extends, target: baseRef }],
    };

    return this.registry.defineType(typeDef);
  }

  definePartial(
    name: string,
    version: string,
    baseRef: TypeRef,
    opts?: { description?: string; tags?: string[] },
  ): string {
    const schema = this.composer.partial(baseRef);

    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
      refs: [{ rel: TypeRelation.Extends, target: baseRef }],
    };

    return this.registry.defineType(typeDef);
  }

  definePick(
    name: string,
    version: string,
    baseRef: TypeRef,
    fields: string[],
    opts?: { description?: string; tags?: string[] },
  ): string {
    const schema = this.composer.pick(baseRef, fields);

    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
      refs: [{ rel: TypeRelation.Extends, target: baseRef }],
    };

    return this.registry.defineType(typeDef);
  }

  defineOmit(
    name: string,
    version: string,
    baseRef: TypeRef,
    fields: string[],
    opts?: { description?: string; tags?: string[] },
  ): string {
    const schema = this.composer.omit(baseRef, fields);

    const typeDef: TypeDef = {
      id: buildTypeUri(ADK_ORIGIN, name, version),
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema,
      name,
      version,
      description: opts?.description,
      tags: opts?.tags,
      refs: [{ rel: TypeRelation.Extends, target: baseRef }],
    };

    return this.registry.defineType(typeDef);
  }

  // ── Data Operations ─────────────────────────────────────────────────

  validate(typeRef: TypeRef, data: unknown): ValidationResult {
    return this.registry.validateData(data, typeRef);
  }

  validateDeep(typeRef: TypeRef, data: unknown): ValidationResult {
    return this.registry.validateDataDeep(data, typeRef);
  }

  createDatum<T = unknown>(typeRef: TypeRef, data: T, refs?: DatumRef[]): Datum<T> {
    return this.registry.createDatum(data, typeRef, refs);
  }

  validateDatum(datum: Datum): ValidationResult {
    return this.registry.validateDatum(datum);
  }

  // ── Query ───────────────────────────────────────────────────────────

  resolveType(ref: TypeRef): TypeDef {
    return this.registry.resolveType(ref);
  }

  hasType(ref: TypeRef): boolean {
    return this.registry.hasType(ref);
  }

  conformsTo(childRef: TypeRef, parentRef: TypeRef): boolean {
    return this.registry.conformsTo(childRef, parentRef);
  }

  getConformanceChain(ref: TypeRef): TypeDef[] {
    return this.registry.getConformanceChain(ref);
  }

  isSubtype(childRef: TypeRef, parentRef: TypeRef): SubtypeResult {
    return this.registry.isSubtype(childRef, parentRef);
  }

  listTypes(level?: MetaLevel): TypeDef[] {
    return this.registry.listTypes(level);
  }

  findTypes(query: string): TypeDef[] {
    return this.registry.findTypes(query);
  }

  typesConformingTo(metamodelRef: TypeRef): TypeDef[] {
    return this.graph.byConformsTo(metamodelRef).map((ref) => this.registry.resolveType(ref));
  }

  // ── Compatibility ───────────────────────────────────────────────────

  checkCompatibility(oldRef: TypeRef, newRef: TypeRef, mode: Compatibility): CompatibilityResult {
    const oldType = this.registry.resolveType(oldRef);
    const newType = this.registry.resolveType(newRef);
    return this.compat.check(oldType, newType, mode);
  }

  suggestMigration(oldRef: TypeRef, newRef: TypeRef): MigrationStep[] {
    const oldType = this.registry.resolveType(oldRef);
    const newType = this.registry.resolveType(newRef);
    return this.compat.suggestMigration(oldType, newType);
  }

  // ── Graph ───────────────────────────────────────────────────────────

  impactOf(ref: TypeRef): TypeRef[] {
    return this.graph.impactSet(ref);
  }

  dependenciesOf(ref: TypeRef): TypeRef[] {
    return this.graph.dependencyClosure(ref);
  }

  // ── Lattice ─────────────────────────────────────────────────────────

  join(refA: TypeRef, refB: TypeRef): JsonSchema {
    return this.registry.computeJoin(refA, refB);
  }

  meet(refA: TypeRef, refB: TypeRef): JsonSchema {
    return this.registry.computeMeet(refA, refB);
  }

  // ── Events ──────────────────────────────────────────────────────────

  on(listener: RegistryEventListener): () => void {
    return this.registry.on(listener);
  }

  // ── Export / Import ─────────────────────────────────────────────────

  exportTower(): TowerExport {
    const types = this.registry.listTypes();
    return {
      formatVersion: "1.0",
      exportedAt: new Date().toISOString(),
      types,
    };
  }

  importTower(tower: TowerExport): void {
    const bootstrapIds = new Set(BOOTSTRAP_TYPES.map((typeDef) => typeDef.id));
    const toImport = tower.types.filter((t) => !bootstrapIds.has(t.id));
    if (toImport.length > 0) {
      this.registry.defineTypes(toImport);
    }
  }
}
