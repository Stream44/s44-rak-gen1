/**
 * Layer 7: SchemaComposer — derives new schemas from existing types.
 */

import type { TypeDef, TypeRef, JsonSchema } from "../L01-foundation/types.ts";

export class SchemaComposer {
  constructor(private resolve: (ref: TypeRef) => TypeDef) {}

  /** Extend a base type with additional properties (flat merge). */
  extend(baseRef: TypeRef, overrides: JsonSchema): JsonSchema {
    const base = this.resolve(baseRef);
    const baseProps = base.schema.properties ?? {};
    const overrideProps = overrides.properties ?? {};
    const baseRequired = base.schema.required ?? [];
    const overrideRequired = overrides.required ?? [];

    return {
      type: "object",
      properties: { ...baseProps, ...overrideProps },
      required: [...new Set([...baseRequired, ...overrideRequired])],
    };
  }

  /** Pick specific properties from a type's schema. */
  pick(ref: TypeRef, fields: string[]): JsonSchema {
    const td = this.resolve(ref);
    const props = td.schema.properties ?? {};
    const picked: Record<string, JsonSchema> = {};
    const fieldSet = new Set(fields);
    for (const f of fields) {
      if (props[f]) picked[f] = props[f] as JsonSchema;
    }
    const required = (td.schema.required ?? []).filter((r) => fieldSet.has(r));
    return {
      type: "object",
      properties: picked,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  /** Omit specific properties from a type's schema. */
  omit(ref: TypeRef, fields: string[]): JsonSchema {
    const td = this.resolve(ref);
    const props = { ...(td.schema.properties ?? {}) };
    const omitSet = new Set(fields);
    for (const f of fields) {
      delete props[f];
    }
    const required = (td.schema.required ?? []).filter((r) => !omitSet.has(r));
    return {
      type: "object",
      properties: props,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  /** Intersect two type schemas (MEET). */
  intersect(refA: TypeRef, refB: TypeRef): JsonSchema {
    const a = this.resolve(refA);
    const b = this.resolve(refB);
    return { allOf: [a.schema, b.schema] };
  }

  /** Union two type schemas (JOIN). */
  union(refA: TypeRef, refB: TypeRef): JsonSchema {
    const a = this.resolve(refA);
    const b = this.resolve(refB);
    return { anyOf: [a.schema, b.schema] };
  }

  /** Create a discriminated union. */
  discriminate(discriminatorField: string, variantRefs: TypeRef[]): JsonSchema {
    const variants = variantRefs.map((ref) => this.resolve(ref).schema);
    return { oneOf: variants };
  }

  /** Make all properties optional. */
  partial(ref: TypeRef): JsonSchema {
    const td = this.resolve(ref);
    const { required, ...rest } = td.schema;
    return { ...rest };
  }

  /** Make all properties required. */
  complete(ref: TypeRef): JsonSchema {
    const td = this.resolve(ref);
    const props = td.schema.properties ?? {};
    return {
      ...td.schema,
      required: Object.keys(props),
    };
  }

  /** Merge multiple schemas with allOf semantics. */
  merge(refs: TypeRef[]): JsonSchema {
    const schemas = refs.map((ref) => this.resolve(ref).schema);
    return { allOf: schemas };
  }
}
