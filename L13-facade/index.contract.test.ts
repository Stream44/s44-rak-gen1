import { expect, test } from "bun:test";

import * as facade from "./index.ts";
import type {
  AcceptanceSuite,
  ActionBindingDef,
  ActionDef,
  ActionManifestEntry,
  ActionManifestEntryObject,
  ActionType,
  AlgebraicKernelOptions,
  Assertion,
  AssertionResult,
  AttributeDef,
  AuthorizationResult,
  Branch,
  BrandedTypeDef,
  BreakingChange,
  BuiltinFn,
  Capability,
  CompiledMorphismRef,
  CompatibilityResult,
  CompilerMode,
  ComponentDef,
  ContentStore,
  ContractDef,
  CrossRefIndex,
  DataProvider,
  DataRequirement,
  Datum,
  DatumRef,
  DependentIndex,
  DependentTypeDef,
  DependentTypeGenerator,
  EmittedEvent,
  Encoder,
  EndpointDef,
  EntityDef,
  EnumDef,
  ErrorExpected,
  EvaluationResult,
  EventEmitted,
  EventFilter,
  EventHandler,
  EventKind,
  ExecutionContext,
  FoldAlgebra,
  Intent,
  IntentResult,
  InvariantVerificationResult,
  JsonSchema,
  JsonSchemaType,
  KernelCommand,
  KernelEvent,
  KernelExpression,
  LifecycleDef,
  LoadingPlan,
  MatchCase,
  MigrationStep,
  ModelBoot,
  ModelDocument,
  ModelLoadResult,
  ModelSummary,
  ModuleResolver,
  Morphism,
  MorphismDefineOptions,
  MorphismImpl,
  MorphismListOptions,
  PageDef,
  Pattern,
  Persona,
  PredicateAssertion,
  ProjectionAsset,
  ProjectionKind,
  ProjectionModel,
  ProjectionNode,
  ProjectionSession,
  ProjectionSurfaceAssertion,
  ProjectionTree,
  ProjectorDocument,
  ProjectorSession,
  ProjectorSessionOptions,
  ProofResult,
  Proposition,
  RefinementResult,
  RefinementTypeDef,
  RegistryEvent,
  RegistryEventListener,
  RegistryOptions,
  RelationDef,
  RenderContext,
  RunResult,
  Scenario,
  ScenarioResult,
  Seed,
  StateEquals,
  StateFieldMatch,
  StateMachineDef,
  Step,
  StepContext,
  StepResult,
  StreamProvenanceEntry,
  SubtypeResult,
  SuiteResult,
  SuiteStats,
  SurfaceEvaluator,
  TowerExport,
  Trace,
  TraceResult,
  Trait,
  Transition,
  TransitionResult,
  TypeDef,
  TypeDefRef,
  TypeEdge,
  TypeRef,
  UnfoldResult,
  UseCase,
  UseCaseResult,
  ValidationError,
  ValidationResult,
} from "./index.ts";

void (0 as
  | AcceptanceSuite
  | ActionBindingDef
  | ActionDef
  | ActionManifestEntry
  | ActionManifestEntryObject
  | ActionType
  | AlgebraicKernelOptions
  | Assertion
  | AssertionResult
  | AttributeDef
  | AuthorizationResult
  | Branch
  | BrandedTypeDef
  | BreakingChange
  | BuiltinFn
  | Capability
  | CompiledMorphismRef
  | CompatibilityResult
  | CompilerMode
  | ComponentDef
  | ContentStore
  | ContractDef
  | CrossRefIndex
  | DataProvider
  | DataRequirement
  | Datum
  | DatumRef
  | DependentIndex
  | DependentTypeDef
  | DependentTypeGenerator
  | EmittedEvent
  | Encoder
  | EndpointDef
  | EntityDef
  | EnumDef
  | ErrorExpected
  | EvaluationResult
  | EventEmitted
  | EventFilter
  | EventHandler
  | EventKind
  | ExecutionContext
  | FoldAlgebra
  | Intent
  | IntentResult
  | InvariantVerificationResult
  | JsonSchema
  | JsonSchemaType
  | KernelCommand
  | KernelEvent
  | KernelExpression
  | LifecycleDef
  | LoadingPlan
  | MatchCase
  | MigrationStep
  | ModelBoot
  | ModelDocument
  | ModelLoadResult
  | ModelSummary
  | ModuleResolver
  | Morphism
  | MorphismDefineOptions
  | MorphismImpl
  | MorphismListOptions
  | PageDef
  | Pattern
  | Persona
  | PredicateAssertion
  | ProjectionAsset
  | ProjectionKind
  | ProjectionModel
  | ProjectionNode
  | ProjectionSession
  | ProjectionSurfaceAssertion
  | ProjectionTree
  | ProjectorDocument
  | ProjectorSession
  | ProjectorSessionOptions
  | ProofResult
  | Proposition
  | RefinementResult
  | RefinementTypeDef
  | RegistryEvent
  | RegistryEventListener
  | RegistryOptions
  | RelationDef
  | RenderContext
  | RunResult
  | Scenario
  | ScenarioResult
  | Seed
  | StateEquals
  | StateFieldMatch
  | StateMachineDef
  | Step
  | StepContext
  | StepResult
  | StreamProvenanceEntry
  | SubtypeResult
  | SuiteResult
  | SuiteStats
  | SurfaceEvaluator
  | TowerExport
  | Trace
  | TraceResult
  | Trait
  | Transition
  | TransitionResult
  | TypeDef
  | TypeDefRef
  | TypeEdge
  | TypeRef
  | UnfoldResult
  | UseCase
  | UseCaseResult
  | ValidationError
  | ValidationResult
  | undefined);

const EXPECTED_EXPORTS = [
  "ACCEPTANCE_SUITE_DOCUMENT_ID",
  "ACCEPTANCE_SUITE_DOCUMENT_M2",
  "ADK_M3_URI",
  "ADK_ORIGIN",
  "AcceptanceEngine",
  "AlgebraicKernel",
  "AssetRegistry",
  "BOOTSTRAP_INDEX",
  "BOOTSTRAP_TYPES",
  "BatchDefinitionError",
  "BrandingEngine",
  "CapabilityEngine",
  "Compatibility",
  "CompatibilityChecker",
  "ConformanceEngine",
  "DatumValidationError",
  "DemandEngine",
  "DependentTypeEngine",
  "ExpressionEvaluator",
  "IntentProcessor",
  "JsonEncoder",
  "KernelStream",
  "M2_COLLECTION",
  "M2_ENUM",
  "M2_PLUGGABLE_INTERFACE",
  "M2_RECORD",
  "M2_RULES_DOCUMENT",
  "M2_SCALAR",
  "M2_UNION",
  "M3_META",
  "MORPHISM_DOCUMENT_M2",
  "MemoryDataProvider",
  "MemoryStore",
  "MetaLevel",
  "MetamodelKernel",
  "ModelLoader",
  "MorphismRegistry",
  "PLUGGABLE_INTERFACE_M2",
  "PrimitiveRegistry",
  "ProofEngine",
  "RAK_VERSION",
  "RULES_DOCUMENT_M2",
  "RecordSchemaBuilder",
  "RefinementEngine",
  "SchemaComposer",
  "SchemaValidator",
  "StateMachineEngine",
  "TraitEngine",
  "TypeConformanceError",
  "TypeGraph",
  "TypeLevelError",
  "TypeNotFoundError",
  "TypeRegistry",
  "TypeRelation",
  "UnfoldingEngine",
  "bootNodeTree",
  "buildTypeUri",
  "canonicalize",
  "compileAttributeType",
  "compileInnerType",
  "createMetaProjectionKernel",
  "deepEqual",
  "extractTraces",
  "extractTypeRefs",
  "getSurfaceEvaluator",
  "hasSurfaceEvaluator",
  "isContentId",
  "isTypeUri",
  "loadKernelModel",
  "parseClaim",
  "parseTypeUri",
  "registerBootstrapType",
  "registerSurfaceEvaluator",
  "requiredDiff",
  "validateAcceptanceSuiteDocument",
];

test("index facade - runtime exports match the contract", () => {
  const actual = Object.keys(facade)
    .filter((key) => key !== "default")
    .sort();
  expect(actual).toEqual(EXPECTED_EXPORTS);
});

test("index facade - SLOC cap (DC7)", async () => {
  const text = await Bun.file(import.meta.dir + "/index.ts").text();
  expect(text.split("\n").length).toBeLessThanOrEqual(250);
});

test("index facade - no implementation logic", async () => {
  const text = await Bun.file(import.meta.dir + "/index.ts").text();
  expect(text).not.toMatch(/^\s*(export\s+)?function\s+/m);
  expect(text).not.toMatch(/^\s*(export\s+)?class\s+/m);
});
