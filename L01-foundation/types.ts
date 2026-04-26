/**
 * Core types for the Axiomatic Data Kernel.
 */

// ── Enumerations ──────────────────────────────────────────────────────────

export enum MetaLevel {
  Instance = 0,
  Model = 1,
  Metamodel = 2,
  MetaMetamodel = 3,
}

export enum Compatibility {
  Backward = "BACKWARD",
  Forward = "FORWARD",
  Full = "FULL",
  None = "NONE",
}

export enum TypeRelation {
  ConformsTo = "conformsTo",
  References = "references",
  Extends = "extends",
  Supersedes = "supersedes",
}

// ── Type References ───────────────────────────────────────────────────────

export type TypeRef = string;

// ── JSON Schema ───────────────────────────────────────────────────────────

export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  const?: unknown;
  enum?: unknown[];

  // Composition
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  not?: JsonSchema;

  // Object
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;

  // Array
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // String
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  // Numeric
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Metadata
  title?: string;
  description?: string;
  default?: unknown;

  // Tower extension
  $typeRef?: TypeRef;

  // Vendor extensions
  [key: string]: unknown;
}

// ── Type Definition ───────────────────────────────────────────────────────

export interface TypeDefRef {
  rel: TypeRelation | string;
  target: TypeRef;
  label?: string;
}

export interface TypeDef {
  id: TypeRef;
  level: MetaLevel;
  conformsTo: TypeRef;
  schema: JsonSchema;
  aliases?: string[];
  name?: string;
  version?: string;
  description?: string;
  tags?: string[];
  refs?: TypeDefRef[];
}

// ── Datum ─────────────────────────────────────────────────────────────────

export interface DatumRef {
  rel: string;
  target: string;
}

export interface Datum<T = unknown> {
  id: string;
  type: TypeRef;
  data: T;
  refs: DatumRef[];
}

// ── Result Types ──────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface SubtypeResult {
  isSubtype: boolean;
  reasons: string[];
}

export interface CompatibilityResult {
  compatible: boolean;
  mode: Compatibility;
  breakingChanges: BreakingChange[];
}

export interface BreakingChange {
  path: string;
  kind: string;
  message: string;
}

export interface TypeEdge {
  from: TypeRef;
  to: TypeRef;
  rel: TypeRelation;
}

export interface MigrationStep {
  path: string;
  action: string;
  defaultValue?: unknown;
  description: string;
}

// ── Infrastructure Interfaces ─────────────────────────────────────────────

export interface Encoder {
  encode(value: unknown): Uint8Array;
  decode(bytes: Uint8Array): unknown;
  hash(bytes: Uint8Array): string;
  verify(id: string, bytes: Uint8Array): boolean;
}

export interface ContentStore {
  get(id: string): Uint8Array | null;
  put(id: string, bytes: Uint8Array): void;
  has(id: string): boolean;
  delete(id: string): boolean;
}

// ── Events ────────────────────────────────────────────────────────────────

export type RegistryEvent =
  | { kind: "type:defined"; typeDef: TypeDef; cid: string }
  | { kind: "type:resolved"; typeRef: TypeRef; typeDef: TypeDef }
  | { kind: "registry:rebound"; name: string; oldCid: string | null; newCid: string }
  | { kind: "datum:created"; datum: Datum; typeRef: TypeRef }
  | { kind: "validation:failed"; data: unknown; typeRef: TypeRef; errors: ValidationError[] }
  | { kind: "conformance:checked"; child: TypeRef; parent: TypeRef; result: boolean }
  | { kind: "error"; error: Error; context: string };

export type RegistryEventListener = (event: RegistryEvent) => void;

// ── Export Format ─────────────────────────────────────────────────────────

export interface TowerExport {
  formatVersion: string;
  exportedAt: string;
  types: TypeDef[];
  metadata?: Record<string, unknown>;
}

// ── Error Types ───────────────────────────────────────────────────────────

export class TypeNotFoundError extends Error {
  readonly ref: TypeRef;
  constructor(ref: TypeRef) {
    super(`Type not found: ${ref}`);
    this.name = "TypeNotFoundError";
    this.ref = ref;
  }
}

export class TypeConformanceError extends Error {
  readonly typeId: string;
  readonly conformsToRef: string;
  readonly validationErrors: ValidationError[];
  constructor(typeId: string, conformsTo: string, errors: ValidationError[]) {
    super(`Type "${typeId}" does not conform to "${conformsTo}"`);
    this.name = "TypeConformanceError";
    this.typeId = typeId;
    this.conformsToRef = conformsTo;
    this.validationErrors = errors;
  }
}

export class TypeLevelError extends Error {
  readonly typeId: string;
  readonly level: MetaLevel;
  readonly parentLevel: MetaLevel;
  constructor(typeId: string, level: MetaLevel, parentLevel: MetaLevel) {
    super(`Type "${typeId}" at level ${level} cannot conform to level ${parentLevel}`);
    this.name = "TypeLevelError";
    this.typeId = typeId;
    this.level = level;
    this.parentLevel = parentLevel;
  }
}

export class DatumValidationError extends Error {
  readonly typeRef: TypeRef;
  readonly validationErrors: ValidationError[];
  constructor(typeRef: TypeRef, errors: ValidationError[]) {
    super(`Data fails validation against "${typeRef}"`);
    this.name = "DatumValidationError";
    this.typeRef = typeRef;
    this.validationErrors = errors;
  }
}

export class BatchDefinitionError extends Error {
  readonly failures: Map<TypeRef, Error>;
  constructor(failures: Map<TypeRef, Error>) {
    super(`Batch definition failed: ${failures.size} type(s) invalid`);
    this.name = "BatchDefinitionError";
    this.failures = failures;
  }
}
