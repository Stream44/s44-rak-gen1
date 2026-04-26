/**
 * Layer 3: Bootstrap constants — M3 meta-metamodel + built-in M2 metamodels.
 *
 * M3_META is the axiom. It is the only type that cannot be derived.
 * Every other type in the system is validated against its parent,
 * forming a chain that terminates at M3 (which conforms to itself).
 */

import { MetaLevel } from "../L01-foundation/types.ts";
import type { TypeDef } from "../L01-foundation/types.ts";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import "./conformance/m1.ts";
import { MORPHISM_DOCUMENT_M2 } from "../L02-metamodels/morphism-document.ts";
import { ALGEBRA_OPERATOR_METAMODEL } from "../L02-metamodels/algebra-operator.ts";
import "../L02-metamodels/pluggable-interface.ts";
import "../L09-demand/demand/m1.ts";
import "../L06-process/m1.ts";
// Side-effect register IntentMorphisms M1 instance.
import "../L07-agency/intent/m1.ts";
import "../L11-projection/algebra-operators/index.ts";
import "../L02-metamodels/rules-document.ts";
import { SPECIALISATION_RULE_METAMODEL } from "../L02-metamodels/specialisation-rule.ts";

type BootstrapGlobals = typeof globalThis & {
  __adkBootstrapTypes?: TypeDef[];
  __adkBootstrapIndex?: Map<string, TypeDef>;
};

function getBootstrapTypes(): TypeDef[] {
  const globals = globalThis as BootstrapGlobals;
  globals.__adkBootstrapTypes ??= [];
  return globals.__adkBootstrapTypes;
}

function getBootstrapIndex(): Map<string, TypeDef> {
  const globals = globalThis as BootstrapGlobals;
  globals.__adkBootstrapIndex ??= new Map();
  return globals.__adkBootstrapIndex;
}

export function registerBootstrapType(typeDef: TypeDef): void {
  const types = getBootstrapTypes();
  if (types.some((entry) => entry.id === typeDef.id)) return;
  types.push(typeDef);
  const index = getBootstrapIndex();
  index.set(typeDef.id, typeDef);
  for (const alias of typeDef.aliases ?? []) index.set(alias, typeDef);
}

// ── M3: The Meta-Metamodel (Self-Referential Fixed Point) ─────────────

const M3_BODY: Omit<TypeDef, "id" | "conformsTo"> = {
  level: MetaLevel.MetaMetamodel,
  aliases: ["type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0"],
  name: "MetaMetamodel",
  version: "1.0",
  description: "The self-referential fixed point. Defines what a type definition IS.",
  schema: {
    type: "object",
    required: ["id", "level", "conformsTo", "schema"],
    properties: {
      id: { type: "string", minLength: 1 },
      level: { type: "integer", minimum: 0, maximum: 3 },
      conformsTo: { type: "string", minLength: 1 },
      schema: { type: "object" },
      aliases: { type: "array", items: { type: "string" } },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      refs: {
        type: "array",
        items: {
          type: "object",
          required: ["rel", "target"],
          properties: {
            rel: { type: "string" },
            target: { type: "string" },
            label: { type: "string" },
          },
        },
      },
    },
  },
};

const __m3_cid = new JsonEncoder().encodeAndHashWithExclusion(
  { ...M3_BODY, id: "__pending__", conformsTo: "__pending__" },
  ["id", "conformsTo"],
).cid;

export const M3_META: TypeDef = {
  ...M3_BODY,
  id: __m3_cid,
  conformsTo: __m3_cid,
};

ALGEBRA_OPERATOR_METAMODEL.conformsTo = M3_META.id;
SPECIALISATION_RULE_METAMODEL.conformsTo = M3_META.id;

// ── M2: Record Metamodel ──────────────────────────────────────────────

export const M2_RECORD: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "Record",
  version: "1.0",
  description: "Metamodel for structured record types with named, typed properties.",
  schema: {
    type: "object",
    required: ["id", "level", "conformsTo", "schema"],
    properties: {
      id: { type: "string", minLength: 1 },
      level: { type: "integer", const: 1 },
      conformsTo: {
        type: "string",
        const: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      },
      schema: {
        type: "object",
        required: ["type", "properties"],
        properties: {
          type: { type: "string", const: "object" },
          properties: { type: "object" },
          required: { type: "array", items: { type: "string" } },
          additionalProperties: {},
        },
      },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      refs: { type: "array" },
    },
  },
};

// ── M2: Enum Metamodel ────────────────────────────────────────────────

export const M2_ENUM: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0",
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "Enum",
  version: "1.0",
  description: "Metamodel for enumeration types with a fixed set of allowed values.",
  schema: {
    type: "object",
    required: ["id", "level", "conformsTo", "schema"],
    properties: {
      id: { type: "string", minLength: 1 },
      level: { type: "integer", const: 1 },
      conformsTo: { type: "string", const: "type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0" },
      schema: {
        type: "object",
        required: ["enum"],
        properties: {
          enum: { type: "array", minItems: 1 },
          type: { type: "string" },
        },
      },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      refs: { type: "array" },
    },
  },
};

// ── M2: Union Metamodel ───────────────────────────────────────────────

export const M2_UNION: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/union/1.0",
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "Union",
  version: "1.0",
  description: "Metamodel for discriminated union types.",
  schema: {
    type: "object",
    required: ["id", "level", "conformsTo", "schema"],
    properties: {
      id: { type: "string", minLength: 1 },
      level: { type: "integer", const: 1 },
      conformsTo: {
        type: "string",
        const: "type://github.com/Stream44/s44-rak-gen1@1.0/union/1.0",
      },
      schema: {
        type: "object",
        required: ["oneOf"],
        properties: {
          oneOf: { type: "array", minItems: 1 },
        },
      },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      refs: { type: "array" },
    },
  },
};

// ── M2: Collection Metamodel ──────────────────────────────────────────

export const M2_COLLECTION: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/collection/1.0",
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "Collection",
  version: "1.0",
  description: "Metamodel for collection types (arrays with typed items).",
  schema: {
    type: "object",
    required: ["id", "level", "conformsTo", "schema"],
    properties: {
      id: { type: "string", minLength: 1 },
      level: { type: "integer", const: 1 },
      conformsTo: {
        type: "string",
        const: "type://github.com/Stream44/s44-rak-gen1@1.0/collection/1.0",
      },
      schema: {
        type: "object",
        required: ["type", "items"],
        properties: {
          type: { type: "string", const: "array" },
          items: { type: "object" },
          minItems: { type: "integer", minimum: 0 },
          maxItems: { type: "integer", minimum: 0 },
          uniqueItems: { type: "boolean" },
        },
      },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      refs: { type: "array" },
    },
  },
};

// ── M2: Scalar Metamodel ──────────────────────────────────────────────

export const M2_SCALAR: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0",
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "Scalar",
  version: "1.0",
  description: "Metamodel for constrained scalar/primitive types.",
  schema: {
    type: "object",
    required: ["id", "level", "conformsTo", "schema"],
    properties: {
      id: { type: "string", minLength: 1 },
      level: { type: "integer", const: 1 },
      conformsTo: {
        type: "string",
        const: "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0",
      },
      schema: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string" },
          minimum: { type: "number" },
          maximum: { type: "number" },
          minLength: { type: "integer" },
          maxLength: { type: "integer" },
          pattern: { type: "string" },
          format: { type: "string" },
        },
      },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      refs: { type: "array" },
    },
  },
};

// ── Aggregates ────────────────────────────────────────────────────────

const bootstrapDefaults: TypeDef[] = [
  M3_META,
  M2_RECORD,
  M2_ENUM,
  M2_UNION,
  M2_COLLECTION,
  M2_SCALAR,
  MORPHISM_DOCUMENT_M2,
  ALGEBRA_OPERATOR_METAMODEL,
  SPECIALISATION_RULE_METAMODEL,
];

const bootstrapTypes = getBootstrapTypes();
const dynamicBootstrapTypes = bootstrapTypes.filter(
  (typeDef) => !bootstrapDefaults.some((builtin) => builtin.id === typeDef.id),
);
bootstrapTypes.splice(0, bootstrapTypes.length, ...bootstrapDefaults, ...dynamicBootstrapTypes);

const bootstrapIndex = getBootstrapIndex();
bootstrapIndex.clear();
for (const typeDef of bootstrapTypes) {
  bootstrapIndex.set(typeDef.id, typeDef);
  for (const alias of typeDef.aliases ?? []) bootstrapIndex.set(alias, typeDef);
}

export const BOOTSTRAP_TYPES: readonly TypeDef[] = bootstrapTypes;
export const BOOTSTRAP_INDEX: ReadonlyMap<string, TypeDef> = bootstrapIndex;
