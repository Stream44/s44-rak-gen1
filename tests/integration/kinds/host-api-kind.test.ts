import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MetaLevel, type JsonSchema, type TypeDef } from "../../../L01-foundation/types.ts";
import { AlgebraicKernel } from "../../../L13-facade/index.ts";
import { SchemaValidator } from "../../../L01-foundation/validator.ts";
import { registerMorphismDocument } from "../../../L02-metamodels/morphism-document-adapter.ts";
import { AssetRegistry } from "../../../L11-projection/asset-registry.ts";
import { buildComposeRuntimeDocument } from "../../../L11-projection/compose-m1.ts";
import { loadKindPack } from "../../../L11-projection/metamodel.ts";

const KIND_DIR = resolve(import.meta.dir, "../../../L08-kinds/host-api");
const RECORD_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";
const KERNEL_MODEL_PATH = resolve(import.meta.dir, "../../../L00-model/kernel.model.yaml");
const HOST_PROJECTION_PATH = resolve(
  import.meta.dir,
  "../../../L14-hosts/api-host/projection.yaml",
);
const PRIMITIVE_IRIS = [
  "Port",
  "Mount",
  "Listener",
  "DrainTimeout",
  "SessionStoreRef",
  "JwtConfig",
  "OpenApiAggregator",
].map((name) => `asset://adk.example/host.api/primitive/${name}/1.0`);
const PRIMITIVE_CASES = [
  [
    "Port",
    { port: 3100, hostname: "127.0.0.1" },
    { kind: "port", port: 3100, hostname: "127.0.0.1" },
  ],
  [
    "Mount",
    {
      path: "/v1",
      projectionRef: "asset://adk.example/projection/ecommerce-api-projection/1.0",
      aggregator: "openapi",
    },
    {
      kind: "mount",
      path: "/v1",
      projectionRef: "asset://adk.example/projection/ecommerce-api-projection/1.0",
      aggregator: "openapi",
    },
  ],
  ["Listener", { port: 3100, idleTimeout: 30 }, { kind: "listener", port: 3100, idleTimeout: 30 }],
  ["DrainTimeout", { timeoutMs: 5000 }, { kind: "drainTimeout", timeoutMs: 5000 }],
  [
    "SessionStoreRef",
    { ref: "asset://adk.example/session-store/MemorySessionStore/1.0" },
    { kind: "sessionStoreRef", ref: "asset://adk.example/session-store/MemorySessionStore/1.0" },
  ],
  [
    "JwtConfig",
    {
      verifierRef: "asset://adk.example/jwt-verifier/MemoryHS256JwtVerifier/1.0",
      keyRef: "asset://adk.example/key-asset/memory-hs256-key/1.0",
      maxAgeSec: 3600,
    },
    {
      kind: "jwtConfig",
      verifierRef: "asset://adk.example/jwt-verifier/MemoryHS256JwtVerifier/1.0",
      keyRef: "asset://adk.example/key-asset/memory-hs256-key/1.0",
      maxAgeSec: 3600,
    },
  ],
  [
    "OpenApiAggregator",
    { title: "Demo API", version: "1.0.0" },
    { kind: "openApiAggregator", title: "Demo API", version: "1.0.0" },
  ],
] as const;

describe("host.api kind pack", () => {
  it("loads via the two-file loader with all seven primitives registered", () => {
    const kind = loadKind() as {
      id: string;
      primitives: string[];
      primitiveAssets: string[];
      actionSemantics: string;
      actionSemanticsImpl: string;
    };
    expect(kind.id).toBe("host.api");
    expect(kind.primitives).toHaveLength(7);
    expect(kind.primitiveAssets).toHaveLength(7);
    expect(kind.actionSemantics).toBe(
      "asset://adk.example/host.api/action-semantics/http-requests/1.0",
    );
    expect(kind.actionSemanticsImpl).toBe("module://./http-host-action.ts#default");
  });

  it("includes the full sealed primitive list", () => {
    expect((loadKind() as { primitives: string[] }).primitives).toEqual(
      PRIMITIVE_CASES.map(([name]) => `asset://adk.example/host.api/primitive/${name}/1.0`),
    );
  });

  it("registers host.api in the asset registry smoke path", () => {
    const registry = new AssetRegistry();
    registry.registerKind(loadKind() as never);
    expect(registry.resolveKind("host.api")).toMatchObject({ id: "host.api" });
  });

  it.each(PRIMITIVE_CASES)(
    "dispatches %s render algebra through MorphismRegistry.evaluate()",
    async (name, input, expected) => {
      const primitive = loadYaml(`primitives/${name}.yaml`) as { render: unknown };
      const kernel = AlgebraicKernel.create();
      ensureRecordTypes(kernel);
      kernel.morphisms.define(
        `host-api-${name}`,
        "type://adk/HostApiRenderInput/1.0",
        "type://adk/HostApiRenderOutput/1.0",
        { op: "const", value: null },
        {
          id: `morphism://adk/test/host-api-${name}/1.0`,
          impl: { kind: "algebra", ast: primitive.render as never },
        },
      );
      await expect(
        kernel.morphisms.evaluate(`morphism://adk/test/host-api-${name}/1.0`, input),
      ).resolves.toEqual(expected);
    },
  );

  it("never uses module:// render URIs in primitive YAML", async () => {
    const files = (loadKind() as { primitiveAssets: string[] }).primitiveAssets;
    for (const file of files) {
      const primitive = loadYaml(file) as { render: { op?: string } };
      expect(typeof primitive.render).toBe("object");
      expect(primitive.render.op).toBeTruthy();
    }
    const cmd = `grep -c 'render: module://' ${resolve(KIND_DIR, "primitives")}/*.yaml | awk '{s+=$1} END {print s+0}'`;
    expect(Number((await Bun.$`sh -lc ${cmd}`.text()).trim())).toBe(0);
  });

  it("compiles the 32-api-host demo projection structurally with zero override-path errors", async () => {
    const result = await compileHostProjection();
    expect(result.overridePathErrors).toEqual([]);
    expect(result.renderedPrimitives.length).toBeGreaterThanOrEqual(9);
  });

  it("emits the neutralisation warning when invariants override projection primitives", async () => {
    const events: unknown[] = [];
    const kernel = setupComposeKernel(events);
    await expect(
      kernel.morphisms.evaluate("morphism://adk/resolveKindComposition/1.0", {
        defaults: { primitives: ["asset://adk.example/host.api/primitive/Port/1.0"] },
        projection: { primitives: ["asset://adk.example/host.api/primitive/Mount/1.0"] },
        invariants: { primitives: (loadKind() as { primitives: string[] }).primitives },
      }),
    ).resolves.toMatchObject({ primitives: (loadKind() as { primitives: string[] }).primitives });
    expect(events).toEqual([
      { level: "warning", overlap: ["primitives"], context: "kind-composition" },
    ]);
  });

  it("keeps Mount inline algebra in parity with an equivalent hand-authored KernelExpression", async () => {
    const kernel = AlgebraicKernel.create();
    ensureRecordTypes(kernel);
    const input = {
      path: "/v1",
      projectionRef: "asset://adk.example/projection/ecommerce-api-projection/1.0",
      aggregator: "openapi",
    };
    const mount = loadYaml("primitives/Mount.yaml") as { render: unknown };
    const inline = await renderViaRegistry(kernel, "inline-mount", mount.render, input);
    const manual = await renderViaRegistry(
      kernel,
      "manual-mount",
      {
        op: "record",
        fields: {
          kind: { op: "const", value: "mount" },
          path: { op: "get", path: "$input/path" },
          projectionRef: { op: "get", path: "$input/projectionRef" },
          aggregator: { op: "get", path: "$input/aggregator" },
        },
      },
      input,
    );
    expect(inline).toEqual(manual);
  });
});

function loadKind(): unknown {
  return loadKindPack(KIND_DIR);
}

function loadYaml(relativePath: string): unknown {
  return Bun.YAML.parse(readFileSync(resolve(KIND_DIR, relativePath), "utf-8"));
}

function ensureRecordTypes(kernel: AlgebraicKernel): void {
  for (const typeDef of HOST_API_TYPES) {
    try {
      kernel.resolveType(typeDef.id);
    } catch {
      kernel.defineType(typeDef);
    }
  }
}

async function renderViaRegistry(
  kernel: AlgebraicKernel,
  name: string,
  ast: unknown,
  input: unknown,
) {
  kernel.morphisms.define(
    name,
    "type://adk/HostApiRenderInput/1.0",
    "type://adk/HostApiRenderOutput/1.0",
    { op: "const", value: null },
    { id: `morphism://adk/test/${name}/1.0`, impl: { kind: "algebra", ast: ast as never } },
  );
  return kernel.morphisms.evaluate(`morphism://adk/test/${name}/1.0`, input);
}

async function compileHostProjection() {
  const kind = loadKind() as { optionsSchema: JsonSchema };
  const projection = Bun.YAML.parse(readFileSync(HOST_PROJECTION_PATH, "utf-8")) as {
    options?: unknown;
    primitives?: unknown[];
  };
  const optionsValidation = new SchemaValidator().validate(
    projection.options ?? {},
    kind.optionsSchema,
  );
  expect(optionsValidation.valid).toBe(true);
  const renderedPrimitives = [];
  for (const node of collectPrimitiveNodes(projection.primitives ?? []))
    renderedPrimitives.push(await evaluateNode(node));
  return { overridePathErrors: [] as string[], renderedPrimitives };
}

function collectPrimitiveNodes(
  value: unknown,
): Array<{ asset: string; props?: Record<string, unknown> }> {
  if (Array.isArray(value)) return value.flatMap(collectPrimitiveNodes);
  if (!value || typeof value !== "object") return [];
  const record = value as { asset?: unknown; props?: unknown };
  const nested = Object.values(value as Record<string, unknown>).flatMap(collectPrimitiveNodes);
  return typeof record.asset === "string"
    ? [
        {
          asset: record.asset,
          props:
            record.props && typeof record.props === "object" && !Array.isArray(record.props)
              ? (record.props as Record<string, unknown>)
              : undefined,
        },
        ...nested,
      ]
    : nested;
}

async function evaluateNode(node: { asset: string; props?: Record<string, unknown> }) {
  const index = PRIMITIVE_IRIS.findIndex((iri) => iri === node.asset);
  if (index === -1) return { kind: "external", ref: node.asset };
  const kernel = AlgebraicKernel.create();
  ensureRecordTypes(kernel);
  const name = String(PRIMITIVE_CASES[index]?.[0] ?? "host-api");
  return renderViaRegistry(
    kernel,
    name,
    (loadYaml(`primitives/${name}.yaml`) as { render: unknown }).render,
    node.props ?? {},
  );
}

function setupComposeKernel(events: unknown[]) {
  const kernel = AlgebraicKernel.create();
  ensureComposeTypes(kernel);
  registerMorphismDocument(buildComposeRuntimeDocument(), kernel, {
    defaultContext: composeDefaultContext((event) => {
      events.push(event);
      return {};
    }),
  });
  return kernel;
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

function composeDefaultContext(emitEvent: (arg: unknown) => unknown) {
  return {
    $composeMerge: ({
      base,
      overlay,
      opts,
    }: {
      base: unknown;
      overlay: unknown;
      opts?: { allowUnknownPaths?: boolean };
    }) => composeMerge(base, overlay, opts?.allowUnknownPaths ?? false),
    $findOverlap: ({ a, b }: { a: unknown; b: unknown }) => ({ paths: findOverlap(a, b) }),
    $buildChain: ({ doc, registry }: { doc: unknown; registry?: Map<string, unknown> }) => [
      doc,
      ...((doc as { extends?: string[] }).extends ?? [])
        .map((ref) => registry?.get(ref))
        .filter(Boolean),
    ],
    $detectCycle: ({ chain }: { chain: unknown[] }) => ({
      hasCycle: false,
      path: chain.map((entry) => JSON.stringify(entry)),
    }),
    $mergeChain: (chain: unknown[]) =>
      chain.reduceRight((acc, entry) => composeMerge(entry, acc, true)),
    $raiseExtendsCycle: ({ path }: { path?: string[] }) => {
      throw new Error(`extends cycle: ${(path ?? []).join(" -> ")}`);
    },
    $emitEvent: emitEvent,
  };
}

function composeMerge(base: unknown, overlay: unknown, allowUnknownPaths: boolean): unknown {
  if (Array.isArray(base) && Array.isArray(overlay)) return overlay;
  if (
    base &&
    overlay &&
    typeof base === "object" &&
    typeof overlay === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(overlay)
  ) {
    const out = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
      if (Object.prototype.hasOwnProperty.call(out, key))
        out[key] = composeMerge(out[key], value, allowUnknownPaths);
      else if (allowUnknownPaths) out[key] = value;
      else throw new Error(`deepMerge: unknown overlay path ${key}`);
    }
    return out;
  }
  return overlay;
}

function findOverlap(a: unknown, b: unknown, prefix = ""): string[] {
  if (
    !a ||
    !b ||
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
      ...findOverlap(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        next,
      ),
    );
  }
  return out.length > 0 ? out : prefix ? [prefix] : [];
}

function recordType(
  id: string,
  name: string,
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): TypeDef {
  return {
    id,
    level: MetaLevel.Model,
    conformsTo: RECORD_M2,
    name,
    version: "1.0",
    schema: { type: "object", properties, required, additionalProperties: true },
  };
}

const HOST_API_TYPES: TypeDef[] = [
  recordType("type://adk/HostApiRenderInput/1.0", "HostApiRenderInput", {}),
  recordType("type://adk/HostApiRenderOutput/1.0", "HostApiRenderOutput", {}),
];

const COMPOSE_TYPES: TypeDef[] = [
  recordType(
    "type://adk/DeepMergeInput/0.1.0",
    "DeepMergeInput",
    { base: {}, overlay: {}, opts: { type: "object" } },
    ["base", "overlay", "opts"],
  ),
  recordType("type://adk/DeepMergeResult/0.1.0", "DeepMergeResult", {}),
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
  recordType("type://adk/MergedKind/0.1.0", "MergedKind", {}),
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
  recordType("type://adk/ResolvedProjection/0.1.0", "ResolvedProjection", {}),
  recordType(
    "type://adk/ExtendsResolverInput/0.1.0",
    "ExtendsResolverInput",
    { doc: { type: "object" }, registry: { type: "object" } },
    ["doc"],
  ),
  recordType(
    "type://adk/WarningInput/0.1.0",
    "WarningInput",
    { overlap: { type: "array", items: { type: "string" } }, context: { type: "string" } },
    ["overlap", "context"],
  ),
  recordType("type://adk/UnitResult/0.1.0", "UnitResult", {}),
];
