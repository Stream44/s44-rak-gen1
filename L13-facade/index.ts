// This is the RAK's ONLY public surface.
// See spec 05 §19.1 for the committed export shape.

export type {
  TypeDef,
  TypeRef,
  Datum,
  Encoder,
  ContentStore,
  JsonSchema,
  JsonSchemaType,
  CompatibilityResult,
  BreakingChange,
  ValidationError,
  ValidationResult,
  SubtypeResult,
  MigrationStep,
  TypeEdge,
  TowerExport,
  TypeDefRef,
  DatumRef,
  RegistryEvent,
  RegistryEventListener,
} from "../L01-foundation/types.ts";
export {
  MetaLevel,
  Compatibility,
  TypeRelation,
  TypeNotFoundError,
  TypeConformanceError,
  TypeLevelError,
  DatumValidationError,
  BatchDefinitionError,
} from "../L01-foundation/types.ts";
export {
  canonicalize,
  isContentId,
  isTypeUri,
  parseTypeUri,
  buildTypeUri,
  extractTypeRefs,
  requiredDiff,
} from "../L01-foundation/utils.ts";
export { JsonEncoder, MemoryStore } from "../L01-foundation/encoder.ts";
export { SchemaValidator } from "../L01-foundation/validator.ts";
export {
  M3_META,
  M2_RECORD,
  M2_ENUM,
  M2_UNION,
  M2_COLLECTION,
  M2_SCALAR,
  BOOTSTRAP_TYPES,
  BOOTSTRAP_INDEX,
  registerBootstrapType,
} from "../L03-tower/bootstrap.ts";
export { ConformanceEngine } from "../L03-tower/conformance.ts";
export { TypeGraph } from "../L03-tower/graph.ts";
export { TypeRegistry } from "../L03-tower/registry.ts";
export type { RegistryOptions } from "../L03-tower/registry.ts";
export { SchemaComposer } from "../L03-tower/composer.ts";
export { CompatibilityChecker } from "../L03-tower/compatibility/engine.ts";
export { RecordSchemaBuilder } from "../L03-tower/builder.ts";
export { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";
export {
  ExpressionEvaluator,
  type KernelExpression,
  type BuiltinFn,
  type EvaluationResult,
  type MatchCase,
  type Pattern,
} from "../L04-expression/evaluator.ts";
export {
  KernelStream,
  type KernelCommand,
  type KernelEvent,
  type EventKind,
  type EventHandler,
  type EventFilter,
  type FoldAlgebra,
  type StreamProvenanceEntry,
} from "../L04-expression/stream.ts";
export {
  MorphismRegistry,
  type CompilerMode,
  type CompiledMorphismRef,
  type ModuleResolver,
  type Morphism,
  type MorphismDefineOptions,
  type MorphismImpl,
  type MorphismListOptions,
} from "../L05-morphism/registry.ts";
export {
  RefinementEngine,
  type RefinementResult,
  type RefinementTypeDef,
} from "../L05-morphism/refinement.ts";
export { BrandingEngine, type BrandedTypeDef } from "../L05-morphism/brand.ts";
export { ProofEngine, type ProofResult, type Proposition } from "../L05-morphism/proof.ts";
export {
  DependentTypeEngine,
  type DependentIndex,
  type DependentTypeDef,
  type DependentTypeGenerator,
} from "../L05-morphism/dependent.ts";
export { TraitEngine, type Trait } from "../L05-morphism/trait.ts";
export {
  StateMachineEngine,
  type InvariantVerificationResult,
  type RunResult,
  type StateMachineDef,
  type Transition,
  type TransitionResult,
} from "../L06-process/engine.ts";
export {
  CapabilityEngine,
  type AuthorizationResult,
  type Capability,
} from "../L07-agency/capability.ts";
export {
  IntentProcessor,
  type ActionType,
  type EmittedEvent,
  type Intent,
  type IntentResult,
} from "../L07-agency/intent.ts";
export { AlgebraicKernel, type AlgebraicKernelOptions } from "./kernel.export.ts";
export {
  DemandEngine,
  MemoryDataProvider,
  type DataProvider,
  type DataRequirement,
  type ExecutionContext,
  type LoadingPlan,
} from "../L09-demand/demand.ts";
export {
  ModelLoader,
  compileAttributeType,
  compileInnerType,
  parseClaim,
  type ActionDef,
  type AttributeDef,
  type ContractDef,
  type CrossRefIndex,
  type EntityDef,
  type EnumDef,
  type LifecycleDef,
  type ModelBoot,
  type ModelDocument,
  type ModelLoadResult,
  type ModelSummary,
  type RelationDef,
} from "../L09-demand/model-loader.ts";
export { UnfoldingEngine, type EndpointDef, type UnfoldResult } from "../L09-demand/unfold.ts";
export {
  AcceptanceEngine,
  deepEqual,
  extractTraces,
  getSurfaceEvaluator,
  hasSurfaceEvaluator,
  registerSurfaceEvaluator,
  type AcceptanceSuite,
  type Assertion,
  type AssertionResult,
  type Branch,
  type ErrorExpected,
  type EventEmitted,
  type Persona,
  type PredicateAssertion,
  type ProjectionSurfaceAssertion,
  type ProjectorSessionOptions,
  type Scenario,
  type ScenarioResult,
  type Seed,
  type StateEquals,
  type StateFieldMatch,
  type Step,
  type StepContext,
  type StepResult,
  type SuiteResult,
  type SuiteStats,
  type SurfaceEvaluator,
  type Trace,
  type TraceResult,
  type UseCase,
  type UseCaseResult,
} from "../L10-acceptance/acceptance.ts";
export type {
  ActionBindingDef,
  ActionManifestEntry,
  ActionManifestEntryObject,
  ComponentDef,
  PageDef,
  ProjectionAsset,
  ProjectionKind,
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
  ProjectorDocument,
  ProjectorSession,
  RenderContext,
} from "../L01-foundation/projection-types.ts";
export { createMetaProjectionKernel, loadKernelModel } from "../L11-projection/bootstrap.ts";
export { bootNodeTree } from "./boot-node-tree.ts";
export { AssetRegistry } from "../L11-projection/asset-registry.ts";
export { PrimitiveRegistry } from "../L11-projection/primitive-registry.ts";
export type { ProjectionSession } from "../L11-projection/session.ts";
export { RULES_DOCUMENT_M2 } from "../L02-metamodels/rules-document.ts";
export { MORPHISM_DOCUMENT_M2 } from "../L02-metamodels/morphism-document.ts";
export { PLUGGABLE_INTERFACE_M2 } from "../L02-metamodels/pluggable-interface.ts";
export {
  ACCEPTANCE_SUITE_DOCUMENT_ID,
  ACCEPTANCE_SUITE_DOCUMENT_M2,
  validateAcceptanceSuiteDocument,
  type AcceptanceSuiteDocumentM1,
} from "../L02-metamodels/acceptance-suite.ts";
export { M2_RULES_DOCUMENT } from "../L02-metamodels/rules-document.ts";
export { M2_PLUGGABLE_INTERFACE } from "../L02-metamodels/pluggable-interface.ts";

export const ADK_ORIGIN = "github.com/Stream44/s44-rak-gen1@1.0";
export const ADK_M3_URI = "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0";
export const RAK_VERSION = "0.1.0";
