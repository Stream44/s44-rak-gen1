/**
 * Layer 10: AlgebraicKernel — unified facade wrapping all algebra engines.
 *
 * The single entry point for downstream consumers. Provides:
 * - Structural types (MetamodelKernel)
 * - Morphisms (typed transformations)
 * - Refinement types (predicates as types)
 * - Branded types (nominal isolation)
 * - State machines (process layer)
 * - Proofs (verification)
 * - Dependent types (value-parameterized types)
 * - Expression evaluation
 * - Event streaming
 */

import { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";
import type { RegistryOptions } from "../L03-tower/registry.ts";
import { ExpressionEvaluator } from "../L04-expression/evaluator.ts";
import { KernelStream } from "../L04-expression/stream.ts";
import { MorphismRegistry } from "../L05-morphism/registry.ts";
import { RefinementEngine } from "../L05-morphism/refinement.ts";
import { BrandingEngine } from "../L05-morphism/brand.ts";
import { StateMachineEngine } from "../L06-process/engine.ts";
import { CapabilityEngine } from "../L07-agency/capability.ts";
import { IntentProcessor } from "../L07-agency/intent.ts";
import { ProofEngine } from "../L05-morphism/proof.ts";
import { DependentTypeEngine } from "../L05-morphism/dependent.ts";

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
import type { KernelExpression, EvaluationResult } from "../L04-expression/evaluator.ts";
import type { Morphism } from "../L05-morphism/registry.ts";
import type { RefinementTypeDef, RefinementResult } from "../L05-morphism/refinement.ts";
import type { BrandedTypeDef } from "../L05-morphism/brand.ts";
import type {
  StateMachineDef,
  TransitionResult,
  RunResult,
  InvariantVerificationResult,
  Transition,
} from "../L06-process/engine.ts";
import type { AuthorizationResult, Capability } from "../L07-agency/capability.ts";
import type { ActionType, Intent, IntentResult } from "../L07-agency/intent.ts";
import type { Proposition, ProofResult } from "../L05-morphism/proof.ts";
import type { DependentTypeDef, DependentIndex } from "../L05-morphism/dependent.ts";
import { MetaLevel } from "../L01-foundation/types.ts";
import { RecordSchemaBuilder } from "../L03-tower/builder.ts";

export interface AlgebraicKernelOptions extends RegistryOptions {
  maxGas?: number;
  defaultOrigin?: string;
}

export class AlgebraicKernel {
  /** The structural type kernel. */
  readonly kernel: MetamodelKernel;
  /** Alias for the structural tower facade used by package consumers. */
  readonly types: MetamodelKernel;
  /** Typed transformations. */
  readonly morphisms: MorphismRegistry;
  /** Predicate-narrowed types. */
  readonly refinements: RefinementEngine;
  /** Nominal isolation. */
  readonly brands: BrandingEngine;
  /** Process layer. */
  readonly stateMachines: StateMachineEngine;
  /** Capability issuance and authorization. */
  readonly capabilities: CapabilityEngine;
  /** Intent processing facade. */
  readonly intents: IntentProcessor;
  /** Verification engine. */
  readonly proofs: ProofEngine;
  /** Value-parameterized types. */
  readonly dependentTypes: DependentTypeEngine;
  /** Deterministic expression evaluator. */
  readonly evaluator: ExpressionEvaluator;
  /** Event stream facade. */
  readonly stream: KernelStream;

  private readonly origin: string;

  private constructor(kernel: MetamodelKernel, evaluator: ExpressionEvaluator, origin: string) {
    this.kernel = kernel;
    this.types = kernel;
    this.evaluator = evaluator;
    this.origin = origin;
    this.stream = new KernelStream({ maxGas: evaluator["maxGas"] });
    this.morphisms = new MorphismRegistry(kernel, evaluator);
    this.refinements = new RefinementEngine(kernel, evaluator);
    this.brands = new BrandingEngine(kernel);
    this.stateMachines = new StateMachineEngine(this);
    this.capabilities = new CapabilityEngine(this);
    this.intents = new IntentProcessor(this);
    this.proofs = new ProofEngine(kernel, evaluator);
    this.dependentTypes = new DependentTypeEngine(kernel, evaluator);
  }

  static create(opts?: AlgebraicKernelOptions): AlgebraicKernel {
    const kernel = MetamodelKernel.create(opts);
    const evaluator = new ExpressionEvaluator({ maxGas: opts?.maxGas });
    const origin = opts?.defaultOrigin ?? "github.com/Stream44/s44-rak-gen1@1.0";
    return new AlgebraicKernel(kernel, evaluator, origin);
  }

  // ── Structural Types (delegates to MetamodelKernel) ─────────────────

  defineRecord(
    name: string,
    version: string,
    build: (builder: RecordSchemaBuilder) => void,
    opts?: { description?: string; tags?: string[]; refs?: TypeDefRef[] },
  ): string {
    return this.kernel.defineRecord(name, version, build, opts);
  }

  defineEnum(
    name: string,
    version: string,
    values: unknown[],
    opts?: { type?: JsonSchemaType; description?: string; tags?: string[] },
  ): string {
    return this.kernel.defineEnum(name, version, values, opts);
  }

  defineUnion(
    name: string,
    version: string,
    variants: JsonSchema[],
    opts?: { discriminator?: { propertyName: string }; description?: string; tags?: string[] },
  ): string {
    return this.kernel.defineUnion(name, version, variants, opts);
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
    return this.kernel.defineCollection(name, version, itemSchema, opts);
  }

  defineScalar(
    name: string,
    version: string,
    schema: JsonSchema,
    opts?: { description?: string; tags?: string[] },
  ): string {
    return this.kernel.defineScalar(name, version, schema, opts);
  }

  defineType(typeDef: TypeDef): string {
    return this.kernel.defineType(typeDef);
  }

  defineTypes(typeDefs: TypeDef[]): Map<TypeRef, string> {
    return this.kernel.defineTypes(typeDefs);
  }

  // ── Morphisms ───────────────────────────────────────────────────────

  defineMorphism(
    name: string,
    sourceType: TypeRef,
    targetType: TypeRef,
    expr: KernelExpression,
    opts?: { isIsomorphism?: boolean; inverseId?: string },
  ): Morphism {
    return this.morphisms.define(name, sourceType, targetType, expr, opts);
  }

  applyMorphism(morphismId: string, datum: Datum): Datum {
    return this.morphisms.apply(morphismId, datum);
  }

  // ── Refinements ─────────────────────────────────────────────────────

  defineRefinement(
    name: string,
    version: string,
    baseType: TypeRef,
    predicate: KernelExpression,
  ): RefinementTypeDef {
    return this.refinements.define(name, version, baseType, predicate, this.origin);
  }

  validateRefinement(data: unknown, refinementId: string): RefinementResult {
    return this.refinements.validate(data, refinementId);
  }

  // ── Brands ──────────────────────────────────────────────────────────

  defineBrandedType(
    name: string,
    version: string,
    baseType: TypeRef,
    brand: string,
  ): BrandedTypeDef {
    return this.brands.define(name, version, baseType, brand, this.origin);
  }

  // ── State Machines ──────────────────────────────────────────────────

  defineStateMachine(def: StateMachineDef): StateMachineDef {
    return this.stateMachines.define(def);
  }

  stepStateMachine(machineId: string, currentState: unknown, event: unknown): TransitionResult {
    return this.stateMachines.step(machineId, currentState, event);
  }

  runStateMachine(machineId: string, initialState: unknown, events: unknown[]): RunResult {
    return this.stateMachines.run(machineId, initialState, events);
  }

  verifyStateMachineInvariants(machineId: string): InvariantVerificationResult {
    return this.stateMachines.verifyInvariants(machineId);
  }

  // ── Proofs ──────────────────────────────────────────────────────────

  defineAction(
    name: string,
    version: string,
    opts: {
      verb: string;
      inputSchema: JsonSchema;
      targetMachine?: string | null;
      preconditions?: KernelExpression[];
      origin?: string;
    },
  ): ActionType {
    return this.intents.defineAction(name, version, opts);
  }

  submitIntent(partial: Omit<Intent, "id" | "timestamp">): Promise<IntentResult> {
    return this.intents.submit(partial);
  }

  issueCapability(
    actionRef: string,
    issuer: string,
    opts?: {
      caveats?: KernelExpression[];
      expiresAt?: string;
    },
  ): Capability {
    return this.capabilities.issue(actionRef, issuer, opts);
  }

  authorizeIntent(intent: Intent, capabilityId: string): AuthorizationResult {
    return this.capabilities.authorize(intent, capabilityId);
  }

  defineProposition(
    name: string,
    statement: KernelExpression,
    context: Record<string, TypeRef>,
  ): Proposition {
    return this.proofs.defineProposition(name, statement, context, this.origin);
  }

  verifyProof(propositionId: string, bindings: Record<string, unknown>): ProofResult {
    return this.proofs.verify(propositionId, bindings);
  }

  // ── Dependent Types ─────────────────────────────────────────────────

  defineDependentType(
    name: string,
    indices: DependentIndex[],
    baseSchema: JsonSchema,
    generator: (indices: Record<string, unknown>) => JsonSchema,
  ): DependentTypeDef {
    return this.dependentTypes.define(name, indices, baseSchema, generator, this.origin);
  }

  instantiateDependentType(depTypeId: string, indexValues: Record<string, unknown>): TypeRef {
    return this.dependentTypes.instantiate(depTypeId, indexValues);
  }

  // ── Data Operations ─────────────────────────────────────────────────

  validate(typeRef: TypeRef, data: unknown): ValidationResult {
    return this.kernel.validate(typeRef, data);
  }

  createDatum<T = unknown>(typeRef: TypeRef, data: T, refs?: DatumRef[]): Datum<T> {
    return this.kernel.createDatum(typeRef, data, refs);
  }

  evaluate(expr: KernelExpression, context?: Record<string, unknown>): EvaluationResult {
    return this.evaluator.evaluate(expr, context);
  }

  // ── Query ───────────────────────────────────────────────────────────

  resolveType(ref: TypeRef): TypeDef {
    return this.kernel.resolveType(ref);
  }

  hasType(ref: TypeRef): boolean {
    return this.kernel.hasType(ref);
  }

  conformsTo(childRef: TypeRef, parentRef: TypeRef): boolean {
    return this.kernel.conformsTo(childRef, parentRef);
  }

  getConformanceChain(ref: TypeRef): TypeDef[] {
    return this.kernel.getConformanceChain(ref);
  }

  isSubtype(childRef: TypeRef, parentRef: TypeRef): SubtypeResult {
    return this.kernel.isSubtype(childRef, parentRef);
  }

  listTypes(level?: MetaLevel): TypeDef[] {
    return this.kernel.listTypes(level);
  }

  // ── Compatibility ───────────────────────────────────────────────────

  checkCompatibility(oldRef: TypeRef, newRef: TypeRef, mode: Compatibility): CompatibilityResult {
    return this.kernel.checkCompatibility(oldRef, newRef, mode);
  }

  // ── Graph ───────────────────────────────────────────────────────────

  impactOf(ref: TypeRef): TypeRef[] {
    return this.kernel.impactOf(ref);
  }

  dependenciesOf(ref: TypeRef): TypeRef[] {
    return this.kernel.dependenciesOf(ref);
  }

  // ── Export / Import ─────────────────────────────────────────────────

  exportTower(): TowerExport {
    return this.kernel.exportTower();
  }

  importTower(tower: TowerExport): void {
    this.kernel.importTower(tower);
  }

  // ── Events ──────────────────────────────────────────────────────────

  on(listener: RegistryEventListener): () => void {
    return this.kernel.on(listener);
  }
}
