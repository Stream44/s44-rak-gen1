/**
 * Layer 14: Branded Types — nominal isolation in a structural system.
 *
 * A BrandedType wraps a structural type with a unique brand tag, preventing
 * semantic confusion between structurally identical types (e.g., Temperature
 * vs Speed are both `{value: number}` but should not be interchangeable).
 */

import type {
  TypeRef,
  JsonSchema,
  ValidationResult,
  TypeDef,
  MetaLevel,
} from "../L01-foundation/types.ts";
import { buildTypeUri } from "../L01-foundation/utils.ts";
import { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";

// ── BrandedTypeDef ───────────────────────────────────────────────────────

export interface BrandedTypeDef {
  id: TypeRef;
  level: MetaLevel;
  conformsTo: TypeRef;
  schema: JsonSchema;
  name?: string;
  version?: string;
  baseType: TypeRef;
  brand: string;
}

// ── BrandingEngine ───────────────────────────────────────────────────────

export class BrandingEngine {
  private readonly kernel: MetamodelKernel;
  private readonly brands = new Map<TypeRef, BrandedTypeDef>();

  constructor(kernel: MetamodelKernel) {
    this.kernel = kernel;
  }

  /**
   * Define a branded type that wraps an existing base type with a nominal brand tag.
   */
  define(
    name: string,
    version: string,
    baseTypeRef: TypeRef,
    brand: string,
    origin = "github.com/Stream44/s44-rak-gen1@1.0",
  ): BrandedTypeDef {
    const baseTypeDef = this.kernel.resolveType(baseTypeRef);
    const id = buildTypeUri(origin, name, version);

    const def: BrandedTypeDef = {
      id,
      level: baseTypeDef.level,
      conformsTo: baseTypeDef.conformsTo,
      schema: { ...baseTypeDef.schema },
      name,
      version,
      baseType: baseTypeRef,
      brand,
    };

    this.brands.set(id, def);
    return def;
  }

  /**
   * Validate data against the branded type's base schema (structural check only).
   * Brands are metadata, not runtime data — validation checks structure, not brand.
   */
  validate(data: unknown, brandedRef: TypeRef): ValidationResult {
    const def = this.brands.get(brandedRef);
    if (!def) {
      return {
        valid: false,
        errors: [
          {
            path: "",
            message: `Branded type not found: ${brandedRef}`,
            keyword: "brand",
            params: { ref: brandedRef },
          },
        ],
      };
    }

    return this.kernel.validate(def.baseType, data);
  }

  /**
   * Check if two branded types share the same brand string.
   */
  areSameBrand(refA: TypeRef, refB: TypeRef): boolean {
    const brandA = this.getBrand(refA);
    const brandB = this.getBrand(refB);
    if (brandA === null || brandB === null) return false;
    return brandA === brandB;
  }

  /**
   * Get the brand string for a branded type, or null if not branded.
   */
  getBrand(ref: TypeRef): string | null {
    const def = this.brands.get(ref);
    return def ? def.brand : null;
  }

  /**
   * Resolve a branded type definition by id.
   */
  resolve(id: TypeRef): BrandedTypeDef {
    const def = this.brands.get(id);
    if (!def) {
      throw new Error(`Branded type not found: ${id}`);
    }
    return def;
  }
}
