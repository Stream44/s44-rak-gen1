/**
 * KernelMetamodel is the M2 schema surface for the meta-circular kernel.
 *
 * In the M3/M2/M1/M0 tower, KernelMetamodel is M2, a loaded
 * `kernel.model.yaml` document is M1, and a runtime `DispatchFrame` is M0.
 *
 * Bootstrap parses this document shape first, then registers its
 * contents with these ADK layers:
 * - Layer 12 morphism primitives.
 * - Layer 15 state machine primitives.
 * - Layer 19 model loader / `TypeRegistry` primitives.
 * - Layer 23 intent primitives.
 * - Layer 24 capability primitives.
 *
 * The normative source is
 * `packages/04-ReflexiveAlgebraicKernel/stewardship/specs/02-TheMetaCircularProjectionKernel.md §6`.
 *
 * Spec §6.1 presents top-level defs as arrays, but this file deliberately uses
 * `Record<string, Def>` maps instead. That deviation matches
 * `19-model-loader.ts`'s record-keyed house style, gives cheap
 * name-keyed lookup during bootstrap, and treats the record key as the def's
 * identifier.
 *
 * This file does structural parsing only. It does not check that morphism type
 * refs resolve, that action.machine points at a declared machine, or that
 * module imports are allowlisted. Those semantic checks are deferred.
 *
 * `assets` stays as `Record<string, unknown>` for now, and
 * `KernelCapabilityDef` is intentionally stubbed to `{ id: string }` until
 * a future revision can fill in spec §6.6's richer issuer / caveat / description surface.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { JsonSchema, TypeRef, Pattern, KernelExpression } from "../L13-facade/index.ts";
import type { MorphismAST } from "./algebra.ts";
import { SchemaValidator } from "../L01-foundation/validator.ts";
import type { ProjectionKind } from "../L01-foundation/projection-types.ts";

export interface KernelModelDocument {
  kernel: string;
  version: string;
  conformsTo: "adk:KernelMetamodel/1.0";
  origin?: string;
  types: Record<string, KernelTypeDef>;
  machines: Record<string, KernelMachineDef>;
  morphisms: Record<string, KernelMorphismDef>;
  actions: Record<string, KernelActionDef>;
  capabilities?: Record<string, KernelCapabilityDef>;
  imports?: string[];
  kinds?: Record<string, KernelKindDef>;
  assets?: Record<string, unknown>;
}

export interface KernelTypeDef {
  name: string;
  jsonSchema: JsonSchema;
  unionOf?: string[];
}

export interface KernelMachineDef {
  id: string;
  name: string;
  stateType: TypeRef;
  eventType: TypeRef;
  initialState: unknown;
  transitions: Array<{
    from: Pattern;
    event: Pattern;
    to: KernelExpression;
    guard?: KernelExpression;
    label?: string;
  }>;
  invariants?: KernelExpression[];
}

export interface KernelActionDef {
  name: string;
  verb: string;
  inputSchema: JsonSchema;
  capabilityRequirement: string;
  machine: string;
  morphism: MorphismRef;
}

export type MorphismRef =
  | { kind: "name"; name: string }
  | { kind: "compose"; f: MorphismRef; g: MorphismRef }
  | { kind: "product"; left: MorphismRef; right: MorphismRef }
  | {
      kind: "sum";
      predicate: KernelExpression;
      then: MorphismRef;
      else: MorphismRef;
    };

export interface KernelMorphismDef {
  id: string;
  input: TypeRef;
  output: TypeRef;
  impl: KernelMorphismImpl;
  category?: "pure" | "stateful" | "io";
}

export type KernelMorphismImpl =
  | { kind: "algebra"; ast: MorphismAST | KernelExpression }
  | { kind: "module"; uri: string; export: string };

export interface KernelKindDef {
  kindPath: string;
}

/** Capability defs stay as an id-only stub for now; a future revision can fill out spec §6.6. */
export interface KernelCapabilityDef {
  id: string;
}

export function loadKindPack(dir: string): ProjectionKind {
  const root = resolve(dir),
    legacy = resolve(root, "kind.yaml"),
    invariantsPath = resolve(root, "kind.invariants.yaml"),
    defaultsPath = resolve(root, "kind.defaults.yaml");
  if (existsSync(legacy))
    throw new Error(
      `Legacy single-file kind.yaml at ${legacy}; migrate to kind.invariants.yaml + kind.defaults.yaml`,
    );
  const missing = [
    ["kind.invariants.yaml", invariantsPath],
    ["kind.defaults.yaml", defaultsPath],
  ]
    .filter(([, path]) => !existsSync(path))
    .map(([name]) => name);
  if (missing.length === 2)
    throw new Error(`Kind pack missing kind.invariants.yaml + kind.defaults.yaml in ${root}`);
  if (missing.length === 1) throw new Error(`Kind pack missing ${missing[0]} in ${root}`);
  const invariants = Bun.YAML.parse(readFileSync(invariantsPath, "utf-8")) as Record<
      string,
      unknown
    >,
    defaults = Bun.YAML.parse(readFileSync(defaultsPath, "utf-8")) as Record<string, unknown>;
  for (const key of Object.keys(invariants))
    if (key in defaults && defaults[key] !== invariants[key])
      console.warn(`loadKindPack: conflicting key "${key}" in ${root}; invariants win`);
  return { ...defaults, ...invariants } as unknown as ProjectionKind;
}

const MORPHISM_IMPL_SCHEMA: JsonSchema = {
  type: "object",
  required: ["kind"],
  // `oneOf` is supported by `SchemaValidator.validate()`, so we use the
  // spec's exact discriminated-union encoding here.
  oneOf: [
    {
      type: "object",
      required: ["kind", "ast"],
      properties: {
        kind: { const: "algebra" },
        ast: { type: "object" },
      },
    },
    {
      type: "object",
      required: ["kind", "uri", "export"],
      properties: {
        kind: { const: "module" },
        uri: { type: "string", pattern: "^module://" },
        export: { type: "string" },
      },
    },
  ],
};

const ALGEBRA_IMPL_SCHEMA = MORPHISM_IMPL_SCHEMA.oneOf?.[0] as JsonSchema;
const MODULE_IMPL_SCHEMA = MORPHISM_IMPL_SCHEMA.oneOf?.[1] as JsonSchema;

const MORPHISM_DEF_SCHEMA: JsonSchema = {
  type: "object",
  required: ["id", "input", "output", "impl"],
  properties: {
    id: { type: "string" },
    input: { type: "string" },
    output: { type: "string" },
    impl: MORPHISM_IMPL_SCHEMA,
    category: { enum: ["pure", "stateful", "io"] },
  },
};

export const KERNEL_MODEL_SCHEMA: JsonSchema = {
  type: "object",
  required: ["kernel", "version", "conformsTo", "types", "machines", "morphisms", "actions"],
  properties: {
    kernel: { type: "string" },
    version: { type: "string" },
    conformsTo: { type: "string", const: "adk:KernelMetamodel/1.0" },
    origin: { type: "string" },
    types: { type: "object" },
    machines: { type: "object" },
    morphisms: {
      type: "object",
      additionalProperties: MORPHISM_DEF_SCHEMA,
    },
    actions: { type: "object" },
    capabilities: { type: "object" },
    imports: { type: "array", items: { type: "string" } },
    kinds: { type: "object" },
    assets: { type: "object" },
  },
};

// Semantic validation deferred:
// This parser rejects malformed YAML and structurally invalid documents only.
// Cross-field checks like undeclared type refs, action-to-machine linkage, and
// import allowlist enforcement happen in the bootstrap layer, not here.
export function parseKernelModel(yamlText: string): KernelModelDocument {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(yamlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parseKernelModel: YAML parse failed: ${message}`);
  }

  const v = new SchemaValidator().validate(parsed, KERNEL_MODEL_SCHEMA);
  const errors = [...v.errors];

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "morphisms" in parsed) {
    const morphisms = (parsed as { morphisms?: unknown }).morphisms;
    if (morphisms && typeof morphisms === "object" && !Array.isArray(morphisms)) {
      const validator = new SchemaValidator();
      for (const [name, morphism] of Object.entries(morphisms)) {
        if (
          !morphism ||
          typeof morphism !== "object" ||
          Array.isArray(morphism) ||
          !("impl" in morphism)
        ) {
          continue;
        }
        const impl = (morphism as { impl?: unknown }).impl;
        const basePath = `/morphisms/${name}/impl`;
        if (!impl || typeof impl !== "object" || Array.isArray(impl)) continue;
        const kind = (impl as { kind?: unknown }).kind;
        if (kind === "algebra") {
          errors.push(
            ...validator.validate(impl, ALGEBRA_IMPL_SCHEMA).errors.map((error) => ({
              ...error,
              path: `${basePath}${error.path}`,
            })),
          );
          continue;
        }
        if (kind === "module") {
          errors.push(
            ...validator.validate(impl, MODULE_IMPL_SCHEMA).errors.map((error) => ({
              ...error,
              path: `${basePath}${error.path}`,
            })),
          );
          continue;
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `parseKernelModel: document does not conform to KernelMetamodel: ${errors.map((e) => `${e.path || "<root>"}: ${e.message}`).join("; ")}`,
    );
  }

  return parsed as KernelModelDocument;
}
