/**
 * Layer 22: Traits — reusable partial schemas that compose via flat merge.
 *
 * A Trait is a named, reusable partial JSON Schema. Types compose traits via
 * traitRefs which merges their schemas into a single flat object schema.
 * This enables cross-cutting concerns like Timestamped, Auditable, Taggable.
 */

import type { JsonSchema, TypeDef } from "../L01-foundation/types.ts";
import { MetaLevel } from "../L01-foundation/types.ts";
import { ADK_ORIGIN, buildTypeUri } from "../L01-foundation/utils.ts";

// ── Trait ────────────────────────────────────────────────────────────────

export interface Trait {
  id: string;
  name: string;
  version: string;
  schema: JsonSchema;
  isAbstract?: boolean;
  origin?: string;
}

interface TraitTypeHost {
  defineType(typeDef: TypeDef): string;
}

// ── TraitEngine ─────────────────────────────────────────────────────────

export class TraitEngine {
  private readonly kernel: TraitTypeHost;
  private readonly traits = new Map<string, Trait>();

  constructor(kernel: TraitTypeHost) {
    this.kernel = kernel;
  }

  /**
   * Define a reusable trait. The trait id uses format:
   * `trait://<origin>/<name>/<version>`
   */
  define(
    name: string,
    version: string,
    schema: JsonSchema,
    opts?: { isAbstract?: boolean; origin?: string },
  ): Trait {
    const origin = opts?.origin ?? ADK_ORIGIN;
    const id = `trait://${origin}/${name}/${version}`;

    const trait: Trait = {
      id,
      name,
      version,
      schema,
      isAbstract: opts?.isAbstract,
      origin,
    };

    this.traits.set(id, trait);
    return trait;
  }

  /**
   * Compose a base schema with multiple traits into a single flat object schema.
   * Merges all trait schemas' properties and unions required arrays.
   */
  compose(baseSchema: JsonSchema, traitRefs: string[]): JsonSchema {
    const mergedProperties: Record<string, JsonSchema> = {
      ...(baseSchema.properties ?? {}),
    };
    const mergedRequired = new Set<string>(baseSchema.required ?? []);

    for (const traitRef of traitRefs) {
      const trait = this.resolve(traitRef);
      if (trait.schema.properties) {
        for (const [key, value] of Object.entries(trait.schema.properties)) {
          mergedProperties[key] = value as JsonSchema;
        }
      }
      if (trait.schema.required) {
        for (const r of trait.schema.required) {
          mergedRequired.add(r);
        }
      }
    }

    return {
      type: "object" as const,
      properties: mergedProperties,
      required: mergedRequired.size > 0 ? [...mergedRequired] : undefined,
      additionalProperties: baseSchema.additionalProperties,
    };
  }

  /**
   * Compose a base schema with traits and register the result as a new type
   * in the kernel.
   */
  defineWithTraits(
    name: string,
    version: string,
    baseSchema: JsonSchema,
    traitRefs: string[],
    opts?: { origin?: string },
  ): string {
    const origin = opts?.origin ?? ADK_ORIGIN;
    const mergedSchema = this.compose(baseSchema, traitRefs);
    const id = buildTypeUri(origin, name, version);

    return this.kernel.defineType({
      id,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: mergedSchema,
      name,
      version,
    });
  }

  /**
   * Resolve a trait by id. Throws if not found.
   */
  resolve(id: string): Trait {
    const trait = this.traits.get(id);
    if (!trait) {
      throw new Error(`Trait not found: ${id}`);
    }
    return trait;
  }

  /**
   * Check if a trait is abstract (cannot instantiate data directly).
   */
  isAbstract(id: string): boolean {
    return this.resolve(id).isAbstract === true;
  }

  /**
   * List all defined traits.
   */
  list(): Trait[] {
    return [...this.traits.values()];
  }
}
