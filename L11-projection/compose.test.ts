import { describe, expect, test } from "bun:test";
import { canonicalize as canonicalizeValue } from "../L01-foundation/utils.ts";
import { MetaLevel, type JsonSchema, type TypeDef } from "../L01-foundation/types.ts";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import {
  registerMorphismDocument,
  validateMorphismDocument,
} from "../L02-metamodels/morphism-document-adapter.ts";
import { buildComposeRuntimeDocument } from "./compose-m1.ts";
import resolveExtends from "./morphisms/resolve-extends.ts";
import type { ProjectionModel } from "../L01-foundation/projection-types.ts";

const RECORD_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";
describe("compose morphism document", () => {
  test("validateMorphismDocument(buildComposeRuntimeDocument()) does not throw", () => {
    expect(() => validateMorphismDocument(buildComposeRuntimeDocument())).not.toThrow();
  });

  test("deepMerge scalar-over-scalar: overlay wins", async () => {
    const { kernel } = setupComposeKernel();
    await expect(
      kernel.morphisms.evaluate("morphism://adk/deepMerge/1.0", {
        base: "left",
        overlay: "right",
        opts: { allowUnknownPaths: false },
      }),
    ).resolves.toBe("right");
  });

  test("deepMerge object-over-object recursively merges shared keys", async () => {
    const { kernel } = setupComposeKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/deepMerge/1.0", {
      base: { a: { x: 1, y: 2 }, keep: true },
      overlay: { a: { y: 9 } },
      opts: { allowUnknownPaths: false },
    });
    expect(result).toEqual({ a: { x: 1, y: 9 }, keep: true });
  });

  test("deepMerge allowUnknownPaths true adds overlay-only keys", async () => {
    const { kernel } = setupComposeKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/deepMerge/1.0", {
      base: { a: 1 },
      overlay: { b: 2 },
      opts: { allowUnknownPaths: true },
    });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("deepMerge allowUnknownPaths false rejects overlay-only keys", async () => {
    const { kernel } = setupComposeKernel();
    await expect(
      kernel.morphisms.evaluate("morphism://adk/deepMerge/1.0", {
        base: { a: 1 },
        overlay: { b: 2 },
        opts: { allowUnknownPaths: false },
      }),
    ).rejects.toThrow(/unknown overlay path b/);
  });

  test("deepMerge array-over-array default replaces wholesale", async () => {
    const { kernel } = setupComposeKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/deepMerge/1.0", {
      base: [1, 2],
      overlay: [3],
      opts: { allowUnknownPaths: false },
    });
    expect(result).toEqual([3]);
  });

  test("deepMerge array-over-array append uses arrayConcat", async () => {
    const { kernel } = setupComposeKernel();
    const overlay = [3, 4] as Array<number> & { _mergeStrategy?: string };
    overlay._mergeStrategy = "append";
    const result = await kernel.morphisms.evaluate("morphism://adk/deepMerge/1.0", {
      base: [1, 2],
      overlay,
      opts: { allowUnknownPaths: false },
    });
    expect(result).toEqual([1, 2, 3, 4]);
  });

  test("deepMerge nested three levels reaches leaves", async () => {
    const { kernel } = setupComposeKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/deepMerge/1.0", {
      base: { a: { b: { c: 1, d: 2 } } },
      overlay: { a: { b: { c: 9 } } },
      opts: { allowUnknownPaths: false },
    });
    expect(result).toEqual({ a: { b: { c: 9, d: 2 } } });
  });

  test("deepMerge shape mismatch object-vs-scalar lets overlay win", async () => {
    const { kernel } = setupComposeKernel();
    await expect(
      kernel.morphisms.evaluate("morphism://adk/deepMerge/1.0", {
        base: { a: 1 },
        overlay: "scalar",
        opts: { allowUnknownPaths: false },
      }),
    ).resolves.toBe("scalar");
  });

  test("resolveKindComposition keeps invariants last and records a warning", async () => {
    const events: unknown[] = [];
    const { kernel } = setupComposeKernel({
      emitEvent: (arg) => {
        events.push(arg);
        return {};
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/resolveKindComposition/1.0", {
      defaults: { route: { requiresAuth: false, cache: "short" } },
      projection: { route: { requiresAuth: false, cache: "long" } },
      invariants: { route: { requiresAuth: true } },
    });
    expect(result).toEqual({ route: { requiresAuth: true, cache: "long" } });
    expect(events).toEqual([
      { level: "warning", overlap: ["route.requiresAuth"], context: "kind-composition" },
    ]);
  });

  test("resolveKindComposition with no overlap does not call recordWarning", async () => {
    const events: unknown[] = [];
    const { kernel } = setupComposeKernel({
      emitEvent: (arg) => {
        events.push(arg);
        return {};
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/resolveKindComposition/1.0", {
      defaults: { route: { cache: "short" } },
      projection: { route: { cache: "long" } },
      invariants: { auth: { mode: "strict" } },
    });
    expect(result).toEqual({ route: { cache: "long" }, auth: { mode: "strict" } });
    expect(events).toEqual([]);
  });

  test("detectExtendsCycle direct A->B->A reports a cycle path", async () => {
    const { kernel } = setupComposeKernel();
    const a = { projector: "a", version: "1", bindsModel: "demo", extends: ["b"] };
    const b = { projector: "b", version: "1", bindsModel: "demo", extends: ["a"] };
    const result = await kernel.morphisms.evaluate("morphism://adk/detectExtendsCycle/1.0", {
      chain: [a, b, a],
    });
    expect(result).toEqual({
      hasCycle: true,
      path: [canonicalizeValue(a), canonicalizeValue(b), canonicalizeValue(a)],
    });
  });

  test("detectExtendsCycle indirect A->B->C->A is detected", async () => {
    const { kernel } = setupComposeKernel();
    const a = { projector: "a", version: "1", bindsModel: "demo", extends: ["b"] };
    const b = { projector: "b", version: "1", bindsModel: "demo", extends: ["c"] };
    const c = { projector: "c", version: "1", bindsModel: "demo", extends: ["a"] };
    await expect(
      kernel.morphisms.evaluate("morphism://adk/detectExtendsCycle/1.0", { chain: [a, b, c, a] }),
    ).resolves.toEqual({
      hasCycle: true,
      path: [
        canonicalizeValue(a),
        canonicalizeValue(b),
        canonicalizeValue(c),
        canonicalizeValue(a),
      ],
    });
  });

  test("detectExtendsCycle no-cycle 4-node chain returns hasCycle false", async () => {
    const { kernel } = setupComposeKernel();
    const chain = ["a", "b", "c", "d"].map((projector) => ({
      projector,
      version: "1",
      bindsModel: "demo",
    }));
    await expect(
      kernel.morphisms.evaluate("morphism://adk/detectExtendsCycle/1.0", { chain }),
    ).resolves.toEqual({ hasCycle: false, path: chain.map((edge) => canonicalizeValue(edge)) });
  });

  test("mergeExtendsChain three-level chain reduces left-to-right with leaf wins", async () => {
    const { kernel } = setupComposeKernel();
    const child = {
      projector: "child",
      version: "1",
      bindsModel: "demo",
      page: { title: "child" },
    };
    const parent = {
      projector: "parent",
      version: "1",
      bindsModel: "demo",
      page: { title: "parent", theme: "blue" },
      auth: { mode: "strict" },
    };
    const grand = {
      projector: "grand",
      version: "1",
      bindsModel: "demo",
      page: { layout: "stack" },
      shared: true,
    };
    const result = await kernel.morphisms.evaluate("morphism://adk/mergeExtendsChain/1.0", {
      chain: [child, parent, grand],
    });
    expect(result).toEqual({
      projector: "child",
      version: "1",
      bindsModel: "demo",
      page: { title: "child", theme: "blue", layout: "stack" },
      auth: { mode: "strict" },
      shared: true,
    });
  });

  test("mergeExtendsChain with cycle throws extends cycle", async () => {
    const { kernel } = setupComposeKernel();
    const a = { projector: "a", version: "1", bindsModel: "demo", extends: ["b"] };
    const b = { projector: "b", version: "1", bindsModel: "demo", extends: ["a"] };
    await expect(
      kernel.morphisms.evaluate("morphism://adk/mergeExtendsChain/1.0", { chain: [a, b, a] }),
    ).rejects.toThrow(/extends cycle:/);
  });

  test("extendsResolver end-to-end resolves through the registry", async () => {
    const { kernel } = setupComposeKernel();
    const parentA: ProjectionModel = {
      projector: "parent",
      version: "1",
      bindsModel: "demo",
      page: { theme: "blue" },
    } as ProjectionModel;
    const child: ProjectionModel = {
      projector: "child",
      version: "1",
      bindsModel: "demo",
      extends: ["parentA"],
      page: { title: "child" },
    } as ProjectionModel;
    const registry = new Map<string, ProjectionModel>([["parentA", parentA]]);
    const result = await kernel.morphisms.evaluate("morphism://adk/extendsResolver/1.0", {
      doc: child,
      registry,
    });
    expect(result).toEqual({
      projector: "child",
      version: "1",
      bindsModel: "demo",
      extends: ["parentA"],
      page: { title: "child", theme: "blue" },
    });
  });

  test("resolve-extends shim dispatches extendsResolver and returns the morphism output", async () => {
    const { kernel } = setupComposeKernel();
    const base = {
      projector: "base",
      version: "1",
      bindsModel: "demo",
      title: "base-title",
    } as ProjectionModel;
    const input = {
      doc: {
        projector: "child",
        version: "1",
        bindsModel: "demo",
        extends: ["base"],
      } as ProjectionModel,
      registry: new Map<string, ProjectionModel>([["base", base]]),
    };
    await expect(resolveExtends(input, kernel)).resolves.toEqual({
      projector: "child",
      version: "1",
      bindsModel: "demo",
      extends: ["base"],
      title: "base-title",
    });
  });
});

function setupComposeKernel(opts: { emitEvent?: (arg: unknown) => unknown } = {}) {
  const kernel = AlgebraicKernel.create();
  ensureComposeTypes(kernel);
  registerMorphismDocument(buildComposeRuntimeDocument(), kernel, {
    defaultContext: composeDefaultContext(opts.emitEvent),
  });
  return { kernel };
}

function composeDefaultContext(emitEvent: (arg: unknown) => unknown = () => ({})) {
  return {
    $composeMerge: ({
      base,
      overlay,
      opts,
    }: {
      base: unknown;
      overlay: unknown;
      opts?: { allowUnknownPaths?: boolean };
    }) => composeMergeImpl(base, overlay, opts?.allowUnknownPaths ?? false),
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
        ? composeMergeImpl(
            input.base?.[k],
            input.overlay?.[k],
            input.opts?.allowUnknownPaths ?? false,
          )
        : input.opts?.allowUnknownPaths
          ? input.overlay?.[k]
          : (() => {
              throw new Error(`deepMerge: unknown overlay path ${k}`);
            })(),
    }),
    $findOverlap: ({ a, b }: { a: unknown; b: unknown }) => ({ paths: findOverlapPaths(a, b) }),
    $buildChain: ({
      doc,
      registry,
    }: {
      doc: ProjectionModel;
      registry?: Map<string, ProjectionModel>;
    }) => buildExtendsChain(doc, registry),
    $canonicalize: (value: unknown) => canonicalizeValue(value),
    $detectCycle: ({ chain }: { chain: ProjectionModel[] }) => detectExtendsCycleImpl(chain),
    $mergeChain: (chain: ProjectionModel[]) => mergeExtendsChainImpl(chain),
    $raiseExtendsCycle: ({ path }: { path?: string[] }) => {
      throw new Error(`extends cycle: ${(path ?? []).join(" -> ")}`);
    },
    $emitEvent: emitEvent,
  };
}

function composeMergeImpl(base: unknown, overlay: unknown, allowUnknownPaths: boolean): unknown {
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
        acc[key] = composeMergeImpl(acc[key], value, allowUnknownPaths);
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

function findOverlapPaths(a: unknown, b: unknown, prefix = ""): string[] {
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
      ...findOverlapPaths(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        next,
      ),
    );
  }
  return out.length > 0 ? out : prefix ? [prefix] : [];
}

function detectExtendsCycleImpl(chain: ProjectionModel[]) {
  const visited = new Set<string>(),
    path: string[] = [];
  for (const edge of chain) {
    const canonical = canonicalizeValue(edge);
    if (visited.has(canonical)) return { hasCycle: true, path: [...path, canonical] };
    visited.add(canonical);
    path.push(canonical);
  }
  return { hasCycle: false, path };
}

function buildExtendsChain(
  doc: ProjectionModel,
  registry?: Map<string, ProjectionModel>,
): ProjectionModel[] {
  const chain: ProjectionModel[] = [doc];
  const seen = new Set<string>([canonicalizeValue(doc)]);
  let cursor = doc;
  while ((cursor.extends?.length ?? 0) > 0) {
    const ref = cursor.extends![0]!;
    const next = registry?.get(ref);
    if (!next) throw new Error(`extendsResolver: missing registry entry ${ref}`);
    const key = canonicalizeValue(next);
    chain.push(next);
    if (seen.has(key)) break;
    seen.add(key);
    cursor = next;
  }
  return chain;
}

function mergeExtendsChainImpl(chain: ProjectionModel[]): ProjectionModel {
  if (chain.length === 0) return {} as ProjectionModel;
  return chain
    .slice(1)
    .reduce((acc, edge) => composeMergeImpl(edge, acc, true) as ProjectionModel, chain[0]!);
}

function ensureComposeTypes(kernel: AlgebraicKernel): void {
  for (const typeDef of COMPOSE_TYPES) {
    try {
      kernel.resolveType(typeDef.id);
    } catch {
      kernel.defineType(typeDef);
    }
  }
}

function recordType(
  id: string,
  name: string,
  properties: Record<string, JsonSchema>,
  required: string[],
): TypeDef {
  return {
    id,
    level: 1,
    conformsTo: RECORD_M2,
    name,
    version: "0.1.0",
    schema: { type: "object", properties, required, additionalProperties: true },
  };
}

function anyJsonType(id: string, name: string): TypeDef {
  return {
    id,
    level: 1,
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
    ["hasCycle"],
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
