/**
 * Layer 18: Dependent Types — types parameterized by values.
 *
 * A DependentType is a type family where the type itself depends on a value
 * parameter. Classic example: `Vec<T, N>` — a vector of type T with exactly
 * N elements. The "N" is a value (natural number), not a type.
 *
 * In the ADK, dependent types are represented as type generators: given
 * concrete index values, they produce a concrete TypeDef.
 */

import type {
  TypeDef,
  TypeRef,
  JsonSchema,
  MetaLevel,
  ValidationResult,
} from "../L01-foundation/types.ts";
import { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";
import type { ExpressionEvaluator, KernelExpression } from "../L04-expression/evaluator.ts";

// ── Dependent Type Interfaces ───────────────────────────────────────

export interface DependentIndex {
  name: string;
  type: TypeRef; // the type of this index value (e.g., integer type ref)
}

export interface DependentTypeDef {
  id: string;
  name: string;
  indices: DependentIndex[];
  generator: DependentTypeGenerator;
  baseSchema: JsonSchema;
  origin?: string;
}

/**
 * The generator is a TS function: given concrete index values, it produces
 * a JsonSchema describing the instantiated type.
 */
export type DependentTypeGenerator = (indices: Record<string, unknown>) => JsonSchema;

// ── Dependent Type Engine ───────────────────────────────────────────

export class DependentTypeEngine {
  private readonly kernel: MetamodelKernel;
  private readonly evaluator: ExpressionEvaluator;
  private readonly definitions = new Map<string, DependentTypeDef>();
  private readonly instantiationCache = new Map<string, TypeRef>();

  constructor(kernel: MetamodelKernel, evaluator: ExpressionEvaluator) {
    this.kernel = kernel;
    this.evaluator = evaluator;
  }

  /**
   * Define a new dependent type family.
   *
   * @returns The stored DependentTypeDef.
   */
  define(
    name: string,
    indices: DependentIndex[],
    baseSchema: JsonSchema,
    generator: DependentTypeGenerator,
    origin: string = "github.com/Stream44/s44-rak-gen1@1.0",
  ): DependentTypeDef {
    const id = `deptype://${origin}/${name}`;

    const def: DependentTypeDef = {
      id,
      name,
      indices,
      generator,
      baseSchema,
      origin,
    };

    this.definitions.set(id, def);
    return def;
  }

  /**
   * Instantiate a dependent type with concrete index values.
   *
   * Calls the generator to produce a concrete JsonSchema, registers it as
   * an M1 TypeDef in the kernel, and returns its TypeRef.
   *
   * Results are cached: identical depType + indices yield the same TypeRef.
   */
  instantiate(depTypeId: string, indexValues: Record<string, unknown>): TypeRef {
    const def = this.definitions.get(depTypeId);
    if (!def) {
      throw new Error(`Unknown dependent type: ${depTypeId}`);
    }

    // Validate that all declared indices are provided and match their types
    this.validateIndices(def, indexValues);

    // Build cache key
    const serialized = this.serializeIndices(def, indexValues);
    const cacheKey = `${depTypeId}|${serialized}`;

    const cached = this.instantiationCache.get(cacheKey);
    if (cached) return cached;

    // Generate the concrete schema
    const schema = def.generator(indexValues);

    // Build the instantiated type ID
    const origin = def.origin ?? "github.com/Stream44/s44-rak-gen1@1.0";
    const typeId = `type://${origin}/${def.name}<${serialized}>/1.0`;

    // Register in the kernel as an M1 type
    const typeDef: TypeDef = {
      id: typeId,
      level: 1 as MetaLevel, // MetaLevel.Model
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0",
      schema,
      name: `${def.name}<${serialized}>`,
      version: "1.0",
    };

    this.kernel.defineType(typeDef);

    this.instantiationCache.set(cacheKey, typeId);
    return typeId;
  }

  /**
   * Validate data against a dependent type with specific index values.
   *
   * Instantiates (or retrieves from cache), then validates data against
   * the concrete schema.
   */
  validate(
    data: unknown,
    depTypeId: string,
    indexValues: Record<string, unknown>,
  ): ValidationResult {
    const typeRef = this.instantiate(depTypeId, indexValues);
    return this.kernel.validate(typeRef, data);
  }

  /**
   * Resolve a dependent type definition by id.
   */
  resolve(id: string): DependentTypeDef {
    const def = this.definitions.get(id);
    if (!def) {
      throw new Error(`Unknown dependent type: ${id}`);
    }
    return def;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private validateIndices(def: DependentTypeDef, indexValues: Record<string, unknown>): void {
    for (const idx of def.indices) {
      if (!(idx.name in indexValues)) {
        throw new Error(`Missing index "${idx.name}" for dependent type "${def.name}"`);
      }

      const value = indexValues[idx.name];

      // Validate the index value against its declared type in the kernel
      const result = this.kernel.validate(idx.type, value);
      if (!result.valid) {
        throw new Error(
          `Index "${idx.name}" value ${JSON.stringify(value)} does not match declared type "${idx.type}": ${result.errors.map((e) => e.message).join(", ")}`,
        );
      }
    }
  }

  private serializeIndices(def: DependentTypeDef, indexValues: Record<string, unknown>): string {
    // Deterministic serialization: sort by declared index order
    return def.indices
      .map((idx) => `${idx.name}=${JSON.stringify(indexValues[idx.name])}`)
      .join(",");
  }
}
