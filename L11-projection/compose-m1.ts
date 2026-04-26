import { readFileSync } from "node:fs";
import { canonicalize } from "../L01-foundation/utils.ts";
import { MetaLevel, type JsonSchema, type TypeDef } from "../L01-foundation/types.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import { MORPHISM_DOCUMENT_ID } from "../L02-metamodels/morphism-document.ts";
import {
  registerMorphismDocument,
  type MorphismDocumentM1,
} from "../L02-metamodels/morphism-document-adapter.ts";
import type { ProjectionModel } from "../L01-foundation/projection-types.ts";

export const COMPOSE_MORPHISMS_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/ComposeMorphisms/1.0",
  level: MetaLevel.Model,
  conformsTo: MORPHISM_DOCUMENT_ID,
  name: "ComposeMorphisms",
  version: "1.0",
  schema: {
    type: "object",
    required: ["document", "version", "conformsTo", "discriminator", "origin", "morphisms"],
    properties: {
      document: { type: "string", const: "ComposeMorphisms" },
      version: { type: "string", const: "1.0" },
      conformsTo: { type: "string", const: "adk:MorphismDocument/1.0" },
      discriminator: { type: "string", const: "compose" },
      origin: { type: "string", const: "adk" },
      morphisms: {
        type: "object",
        required: [
          "deepMerge",
          "resolveKindComposition",
          "detectExtendsCycle",
          "mergeExtendsChain",
          "extendsResolver",
          "recordWarning",
        ],
        properties: {
          deepMerge: { type: "object" },
          resolveKindComposition: { type: "object" },
          detectExtendsCycle: { type: "object" },
          mergeExtendsChain: { type: "object" },
          extendsResolver: { type: "object" },
          recordWarning: { type: "object" },
        },
      },
    },
  },
};

export function buildComposeRuntimeDocument(): MorphismDocumentM1 {
  const doc = Bun.YAML.parse(
    readFileSync(new URL("./compose.model.yaml", import.meta.url), "utf-8"),
  ) as {
    document: string;
    version: string | number;
    conformsTo: string;
    discriminator: string;
    origin: string;
    morphisms: MorphismDocumentM1["morphisms"];
  };
  if (doc.document !== "ComposeMorphisms")
    throw new Error(`Compose morphism document mismatch: ${String(doc.document)}`);
  if (String(doc.version) !== "1.0")
    throw new Error(`Compose morphism version mismatch: ${String(doc.version)}`);
  if (doc.conformsTo !== "adk:MorphismDocument/1.0")
    throw new Error(`Compose morphism conformsTo mismatch: ${String(doc.conformsTo)}`);
  if (doc.discriminator !== "compose")
    throw new Error(`Compose morphism discriminator mismatch: ${String(doc.discriminator)}`);
  if (doc.origin !== "adk")
    throw new Error(`Compose morphism origin mismatch: ${String(doc.origin)}`);
  return {
    id: COMPOSE_MORPHISMS_M1.id,
    level: MetaLevel.Model,
    conformsTo: MORPHISM_DOCUMENT_ID,
    schema: COMPOSE_MORPHISMS_M1.schema,
    discriminator: doc.discriminator,
    name: "ComposeMorphisms",
    version: "1.0",
    morphisms: doc.morphisms,
  };
}

export function composeMerge({
  base,
  overlay,
  opts,
}: {
  base: unknown;
  overlay: unknown;
  opts?: { allowUnknownPaths?: boolean };
}): unknown {
  return mergeCompose(base, overlay, opts?.allowUnknownPaths ?? false);
}

export function findOverlap({ a, b }: { a: unknown; b: unknown }): { paths: string[] } {
  return { paths: overlapPaths(a, b) };
}

export function buildChain({
  doc,
  registry,
}: {
  doc: ProjectionModel;
  registry?: Map<string, ProjectionModel>;
}): ProjectionModel[] {
  const chain: ProjectionModel[] = [doc];
  const seen = new Set<string>([canonicalize(doc)]);
  let cursor = doc;
  while ((cursor.extends?.length ?? 0) > 0) {
    const next = registry?.get(cursor.extends![0]!);
    if (!next) break;
    const key = canonicalize(next);
    chain.push(next);
    if (seen.has(key)) break;
    seen.add(key);
    cursor = next;
  }
  return chain;
}

export function detectCycle({ chain }: { chain: ProjectionModel[] }): {
  hasCycle: boolean;
  path: string[];
} {
  const visited = new Set<string>(),
    path: string[] = [];
  for (const edge of chain) {
    const key = canonicalize(edge);
    if (visited.has(key)) return { hasCycle: true, path: [...path, key] };
    visited.add(key);
    path.push(key);
  }
  return { hasCycle: false, path };
}

export function mergeChain(chain: ProjectionModel[]): ProjectionModel {
  if (chain.length === 0) return {} as ProjectionModel;
  return chain
    .slice(1)
    .reduce((acc, edge) => mergeCompose(edge, acc, true) as ProjectionModel, chain[0]!);
}

export function raiseExtendsCycle({ path }: { path?: string[] }): never {
  throw new Error(`extends cycle: ${(path ?? []).join(" -> ")}`);
}

export function emitEvent(): Record<string, never> {
  return {};
}

const RECORD_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";

function recordType(
  id: string,
  name: string,
  properties: Record<string, JsonSchema>,
  required: string[],
): TypeDef {
  return {
    id,
    level: MetaLevel.Model,
    conformsTo: RECORD_M2,
    name,
    version: "0.1.0",
    schema: { type: "object", properties, required, additionalProperties: true },
  };
}

function anyJsonType(id: string, name: string): TypeDef {
  return {
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/union/1.0",
    name,
    version: "0.1.0",
    schema: {
      oneOf: [
        { type: "object" },
        { type: "array" },
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
      ],
    },
  };
}

const COMPOSE_TYPES: TypeDef[] = [
  recordType(
    "type://adk/DeepMergeInput/0.1.0",
    "DeepMergeInput",
    {
      base: {},
      overlay: {},
      opts: {
        type: "object",
        properties: { allowUnknownPaths: { type: "boolean" } },
        required: ["allowUnknownPaths"],
        additionalProperties: true,
      },
    },
    ["base", "overlay", "opts"],
  ),
  anyJsonType("type://adk/DeepMergeResult/0.1.0", "DeepMergeResult"),
  recordType(
    "type://adk/KindCompositionInput/0.1.0",
    "KindCompositionInput",
    {
      defaults: { type: "object" },
      projection: { type: "object" },
      invariants: { type: "object" },
    },
    ["defaults", "projection", "invariants"],
  ),
  anyJsonType("type://adk/MergedKind/0.1.0", "MergedKind"),
  recordType(
    "type://adk/ExtendsChain/0.1.0",
    "ExtendsChain",
    { chain: { type: "array", items: { type: "object" } } },
    ["chain"],
  ),
  recordType(
    "type://adk/CycleDetection/0.1.0",
    "CycleDetection",
    { hasCycle: { type: "boolean" }, path: { type: "array", items: { type: "string" } } },
    ["hasCycle", "path"],
  ),
  anyJsonType("type://adk/ResolvedProjection/0.1.0", "ResolvedProjection"),
  recordType(
    "type://adk/ExtendsResolverInput/0.1.0",
    "ExtendsResolverInput",
    { doc: { type: "object" }, registry: { type: "object" } },
    ["doc"],
  ),
  recordType(
    "type://adk/WarningInput/0.1.0",
    "WarningInput",
    { overlap: { type: "object" }, context: { type: "string" } },
    ["overlap", "context"],
  ),
  recordType("type://adk/UnitResult/0.1.0", "UnitResult", {}, []),
];

export function registerComposeMorphisms(kernel: AlgebraicKernel): void {
  for (const typeDef of COMPOSE_TYPES)
    try {
      kernel.resolveType(typeDef.id);
    } catch {
      kernel.defineType(typeDef);
    }
  registerMorphismDocument(buildComposeRuntimeDocument(), kernel, {
    defaultContext: {
      $composeMerge: composeMerge,
      $classifyValue: (value: unknown): "scalar" | "object" | "array" =>
        Array.isArray(value)
          ? "array"
          : value !== null && typeof value === "object"
            ? "object"
            : "scalar",
      $mergeOneKey: ({
        acc,
        k,
        input,
      }: {
        acc: Record<string, unknown>;
        k: string;
        input: {
          base: Record<string, unknown>;
          overlay: Record<string, unknown>;
          opts?: { allowUnknownPaths?: boolean };
        };
      }) => ({
        ...acc,
        [k]: Object.prototype.hasOwnProperty.call(input.base ?? {}, k)
          ? composeMerge({ base: input.base?.[k], overlay: input.overlay?.[k], opts: input.opts })
          : input.opts?.allowUnknownPaths
            ? input.overlay?.[k]
            : (() => {
                throw new Error(`deepMerge: unknown overlay path ${k}`);
              })(),
      }),
      $findOverlap: findOverlap,
      $buildChain: buildChain,
      $canonicalize: (value: unknown) => canonicalize(value),
      $detectCycle: detectCycle,
      $mergeChain: mergeChain,
      $raiseExtendsCycle: raiseExtendsCycle,
      $emitEvent: emitEvent,
    },
  });
}

function mergeCompose(base: unknown, overlay: unknown, allowUnknownPaths: boolean): unknown {
  const baseKind = Array.isArray(base)
    ? "array"
    : base !== null && typeof base === "object"
      ? "object"
      : "scalar";
  const overlayKind = Array.isArray(overlay)
    ? "array"
    : overlay !== null && typeof overlay === "object"
      ? "object"
      : "scalar";
  if (baseKind === "object" && overlayKind === "object") {
    const acc = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
      if (Object.prototype.hasOwnProperty.call(acc, key))
        acc[key] = mergeCompose(acc[key], value, allowUnknownPaths);
      else if (allowUnknownPaths) acc[key] = value;
      else throw new Error(`deepMerge: unknown overlay path ${key}`);
    }
    return acc;
  }
  if (baseKind === "array" && overlayKind === "array")
    return (overlay as Record<string, unknown>)._mergeStrategy === "append"
      ? [...(base as unknown[]), ...(overlay as unknown[])]
      : overlay;
  return overlay;
}

function overlapPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) ||
    Array.isArray(b)
  )
    return prefix ? [prefix] : [];
  const out: string[] = [];
  for (const key of Object.keys(a as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) continue;
    const next = prefix ? `${prefix}.${key}` : key;
    out.push(
      ...overlapPaths(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        next,
      ),
    );
  }
  return out.length > 0 ? out : prefix ? [prefix] : [];
}
