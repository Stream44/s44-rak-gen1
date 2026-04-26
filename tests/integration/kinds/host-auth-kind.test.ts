import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MetaLevel, type JsonSchema, type TypeDef } from "../../../L01-foundation/types.ts";
import { AlgebraicKernel } from "../../../L13-facade/index.ts";
import {
  registerMorphismDocument,
  type MorphismDocumentM1,
} from "../../../L02-metamodels/morphism-document-adapter.ts";
import { MORPHISM_DOCUMENT_ID } from "../../../L02-metamodels/morphism-document.ts";
import type { KernelExpression } from "../../../L04-expression/evaluator.ts";
import { createKindRegistry } from "../../../L11-projection/kind-registry.ts";
import { loadKindPack } from "../../../L11-projection/metamodel.ts";
import { buildComposeRuntimeDocument } from "../../../L11-projection/compose-m1.ts";
import HS256JwtVerifier from "../../../L08-kinds/jwt-verifier/hs256-jwt-verifier.ts";
import MemorySessionStore from "../../../L08-kinds/session-store/memory-session-store.ts";
import hostAuthDispatch from "../../../L08-kinds/host-auth/dispatch.ts";

const KIND_DIR = resolve(import.meta.dir, "../../../L08-kinds/host-auth");
const DEMO_DIR = resolve(import.meta.dir, "../../kernel-fixtures/projections/auth");
const RECORD_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";
const INLINE_KEY_REF = "asset://adk.example/key-asset/InlineKeyAsset/1.0";
const INLINE_KEY_BYTES = Buffer.from("host-auth-inline-secret");
const PRIMITIVES = ["Challenge", "VerifyCredential", "IssueCapability", "SessionBinding"] as const;

describe("host.auth kind pack", () => {
  it("loads via the two-file loader with all four primitives registered", () => {
    const kind = loadKind() as {
      id: string;
      primitives: string[];
      primitiveAssets: string[];
      actionSemanticsImpl: string;
    };
    expect(kind.id).toBe("host.auth");
    expect(kind.primitives).toHaveLength(4);
    expect(kind.primitiveAssets).toHaveLength(4);
    expect(kind.actionSemanticsImpl).toBe("morphism://adk.example/host-auth/hostAuthPipeline/1.0");
  });

  it("registers host.auth in the kind registry smoke path", () => {
    const registry = createKindRegistry();
    expect(registry.getKind("host.auth")).toMatchObject({ id: "host.auth" });
  });

  it("contains zero .ts files under primitives/", async () => {
    const count = Number(
      (await Bun.$`sh -lc "ls ${resolve(KIND_DIR, "primitives")}/*.ts 2>/dev/null | wc -l"`)
        .text()
        .trim(),
    );
    expect(count).toBe(0);
  });

  it.each([
    [
      "Challenge",
      {
        request: makeRequestPayload("alice", "confirm,pay"),
        props: { method: "queryParams", paramNames: ["test_user", "test_caps"] },
      },
      {
        kind: "challenge",
        method: "queryParams",
        extracted: { user: "alice", caps: "confirm,pay" },
      },
    ],
    [
      "VerifyCredential",
      {
        challenge: { extracted: { user: "alice", caps: "confirm,pay" } },
        props: { verifier: "self-issue", safetyEnv: { allowInProduction: false } },
      },
      { kind: "verified", user: "alice", caps: "confirm,pay" },
    ],
    [
      "IssueCapability",
      {
        verifyResult: { kind: "verified", user: "alice", caps: "confirm,pay" },
        props: { capScope: "api-primary", ttlSec: 3600 },
      },
      {
        kind: "capability",
        user: "alice",
        caps: { confirm: "allow", pay: "allow" },
        capabilityScopes: ["api-primary"],
        ttlSec: 3600,
      },
    ],
    [
      "SessionBinding",
      {
        projection: { labels: { user: "alice" }, session: { scope: "auth-primary" } },
        capability: { kind: "capability", user: "alice", caps: { confirm: "allow" } },
        props: {
          strategy: "session",
          sessionStoreRef: "asset://adk.example/session-store/MemorySessionStore/1.0",
        },
      },
      { kind: "bound", sessionId: "sess-test", labels: { user: "alice" } },
    ],
  ] as const)(
    "dispatches %s render algebra through MorphismRegistry.evaluate()",
    async (name, input, expected) => {
      const ctx =
        name === "VerifyCredential"
          ? { $env: { NODE_ENV: "development", ADK_ALLOW_TEST_AUTH: "" } }
          : name === "SessionBinding"
            ? { $bindSession: () => "sess-test", $jwtSign: () => "jwt-test" }
            : {};
      await expect(renderPrimitive(name, input, ctx)).resolves.toMatchObject(expected);
    },
  );

  it("never uses module:// render URIs in primitive YAML", async () => {
    const count = PRIMITIVES.reduce(
      (sum, name) =>
        sum +
        (readFileSync(resolve(KIND_DIR, `primitives/${name}.yaml`), "utf-8").includes(
          "render: module://",
        )
          ? 1
          : 0),
      0,
    );
    expect(count).toBe(0);
  });

  it("keeps Challenge inline algebra in parity with an equivalent hand-authored expression", async () => {
    const kernel = AlgebraicKernel.create();
    ensureTypes(kernel);
    const input = {
      request: makeRequestPayload("alice", "confirm,pay"),
      props: { method: "queryParams" },
    };
    const inline = await renderViaRegistry(
      kernel,
      "challenge-inline",
      loadPrimitive("Challenge").render,
      input,
      {},
    );
    const manual = await renderViaRegistry(
      kernel,
      "challenge-manual",
      {
        op: "record",
        fields: {
          kind: { op: "const", value: "challenge" },
          method: { op: "const", value: "queryParams" },
          extracted: {
            op: "record",
            fields: {
              user: { op: "get", path: "$input/request/query/test_user" },
              caps: { op: "get", path: "$input/request/query/test_caps" },
            },
          },
        },
      },
      input,
      {},
    );
    expect(inline).toEqual(manual);
  });

  it("dispatches hostAuthPipeline end-to-end and resolves the created session", async () => {
    const harness = makeHarness();
    const result = await runPipeline(harness);
    expect(result).toMatchObject({ kind: "bound", sessionId: expect.any(String) });
    expect(harness.store.list("alice")[0]).toMatchObject({
      userId: "alice",
      scope: "auth-primary",
    });
  });

  it("blocks self-issue in production by default", async () => {
    const harness = makeHarness({ NODE_ENV: "production" });
    const result = await runPipeline(harness);
    expect(result).toMatchObject({ kind: "rejected", reason: "test-auth disabled in production" });
  });

  it("allows self-issue in production with ADK_ALLOW_TEST_AUTH=1", async () => {
    const harness = makeHarness({ NODE_ENV: "production", ADK_ALLOW_TEST_AUTH: "1" });
    const result = await runPipeline(harness);
    expect(result).toMatchObject({ kind: "bound", sessionId: expect.any(String) });
  });

  it("allows self-issue in development", async () => {
    const harness = makeHarness();
    const result = await runPipeline(harness);
    expect(result).toMatchObject({ kind: "bound", sessionId: expect.any(String) });
  });

  it("resolves the extends cascade base -> demo while preserving the sealed session scope", async () => {
    const harness = makeHarness();
    const merged = await resolveProjection(
      loadDemo("projection.yaml"),
      harness.env,
      harness.events,
    );
    expect(merged.labels.user).toBe("alice");
    expect(merged.session.scope).toBe("auth-primary");
  });

  it("emits a neutralisation warning when a demo variant tries to override session.scope", async () => {
    const harness = makeHarness();
    const override = { ...loadDemo("projection.yaml"), session: { scope: "rogue-scope" } };
    const merged = await resolveProjection(override, harness.env, harness.events);
    expect(merged.session.scope).toBe("auth-primary");
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        level: "warning",
        context: "kind-composition",
        overlap: expect.arrayContaining(["session.scope"]),
      }),
    );
  });

  it("yields usable capabilities in MemorySessionStore", async () => {
    const harness = makeHarness();
    const result = await runPipeline(harness);
    expect(harness.store.getByScope("alice", "auth-primary")).toMatchObject({
      capabilities: { confirm: "allow", pay: "allow" },
    });
    expect(harness.store.list("alice")[0]).toMatchObject({
      capabilities: { confirm: "allow", pay: "allow" },
    });
  });

  it("binds a verifiable jwt token for strategy=jwt", async () => {
    const harness = makeHarness();
    const result = await runPipeline(harness, {
      primitives: {
        SessionBinding: {
          props: {
            strategy: "jwt",
            jwtVerifierRef: "asset://adk.example/jwt-verifier/MemoryHS256JwtVerifier/1.0",
            keyRef: INLINE_KEY_REF,
          },
        },
      },
    });
    await expect(
      makeVerifier().verify(String((result as { jwtToken: string }).jwtToken), INLINE_KEY_REF),
    ).resolves.toMatchObject({
      valid: true,
      claims: { user: "alice", caps: { confirm: "allow", pay: "allow" } },
    });
  });

  it("binds both session and jwt for strategy=both", async () => {
    const harness = makeHarness();
    const result = await runPipeline(harness, {
      primitives: {
        SessionBinding: {
          props: {
            strategy: "both",
            sessionStoreRef: "asset://adk.example/session-store/MemorySessionStore/1.0",
            jwtVerifierRef: "asset://adk.example/jwt-verifier/MemoryHS256JwtVerifier/1.0",
            keyRef: INLINE_KEY_REF,
          },
        },
      },
    });
    expect(result).toMatchObject({ sessionId: expect.any(String), jwtToken: expect.any(String) });
    expect(harness.store.list("alice")[0]).toMatchObject({
      userId: "alice",
      scope: "auth-primary",
    });
  });

  it("returns the external verifier stub rejection", async () => {
    const harness = makeHarness();
    const result = await runPipeline(harness, {
      primitives: {
        VerifyCredential: {
          props: { verifier: "external", externalRef: "asset://example/external" },
        },
      },
    });
    expect(result).toMatchObject({ kind: "rejected", reason: "external verifier not wired" });
  });

  it("detects extends cycles at load time", async () => {
    const kernel = setupComposeKernel([]);
    const a = {
      projector: "a",
      version: "1.0.0",
      bindsModel: "",
      session: { scope: "auth-primary" },
      extends: ["b"],
    };
    const b = {
      projector: "b",
      version: "1.0.0",
      bindsModel: "",
      session: { scope: "auth-primary" },
      extends: ["a"],
    };
    await expect(
      kernel.morphisms.evaluate("morphism://adk/detectExtendsCycle/1.0", { chain: [a, b, a] }),
    ).resolves.toMatchObject({ hasCycle: true });
  });

  it("updates auth responses after a same-alias projection rebind without restarting the backend", async () => {
    const harness = makeHarness();
    const live = { current: await resolveProjection(loadDemo("projection.yaml"), harness.env, []) };
    const backend = hostAuthDispatch(
      new Proxy({}, { get: (_, prop) => Reflect.get(live.current, prop) }),
      { morphisms: harness.kernel.morphisms },
    );
    const first = await decodeResponse(
      await backend.handleRequest(makeRequestPayload("alice", "confirm,pay") as unknown as Request),
    );
    live.current = await resolveProjection(loadDemo("projection-variant-b.yaml"), harness.env, []);
    const second = await decodeResponse(
      await backend.handleRequest(makeRequestPayload("bob", "confirm") as unknown as Request),
    );
    expect(first.labels.user).toBe("alice");
    expect(second.labels.user).toBe("bob");
  });
});

function loadKind(): unknown {
  return loadKindPack(KIND_DIR);
}

function loadPrimitive(name: (typeof PRIMITIVES)[number]): { render: KernelExpression } {
  return Bun.YAML.parse(readFileSync(resolve(KIND_DIR, `primitives/${name}.yaml`), "utf-8")) as {
    render: KernelExpression;
  };
}

function loadDoc(name: string): Record<string, any> {
  return Bun.YAML.parse(readFileSync(resolve(KIND_DIR, name), "utf-8")) as Record<string, any>;
}

function loadDemo(name: "projection.yaml" | "projection-variant-b.yaml") {
  return Bun.YAML.parse(readFileSync(resolve(DEMO_DIR, name), "utf-8")) as Record<string, any>;
}

function makeRequestPayload(user: string, caps: string) {
  return {
    url: `https://example.test/auth?test_user=${user}&test_caps=${caps}`,
    query: { test_user: user, test_caps: caps },
    headers: {},
    body: {},
  };
}

async function renderPrimitive(
  name: (typeof PRIMITIVES)[number],
  input: unknown,
  defaultContext: Record<string, unknown>,
) {
  const kernel = AlgebraicKernel.create();
  ensureTypes(kernel);
  return renderViaRegistry(kernel, `primitive-${name}`, loadPrimitive(name).render, input, {
    $normalizeCaps: (raw: unknown) => normalizeCaps(raw),
    ...defaultContext,
  });
}

async function renderViaRegistry(
  kernel: AlgebraicKernel,
  name: string,
  ast: KernelExpression,
  input: unknown,
  defaultContext: Record<string, unknown>,
) {
  kernel.morphisms.define(
    name,
    "type://adk/HostAuthAny/1.0",
    "type://adk/HostAuthAny/1.0",
    { op: "const", value: null },
    { id: `morphism://adk/test/${name}/1.0`, impl: { kind: "algebra", ast }, defaultContext },
  );
  return kernel.morphisms.evaluate(`morphism://adk/test/${name}/1.0`, input);
}

function makeHarness(env: Record<string, string> = {}) {
  const kernel = AlgebraicKernel.create();
  ensureTypes(kernel);
  const store = new MemorySessionStore();
  const verifier = makeVerifier();
  const events: unknown[] = [];
  registerMorphismDocument(loadHostAuthDocument(), kernel, {
    defaultContext: {
      $normalizeCaps: (raw: unknown) => normalizeCaps(raw),
      $bindSession: (arg: Record<string, any>) => {
        const sessionId = store.create(arg.user, arg.scope);
        store.attach(sessionId, arg.caps ?? {});
        return sessionId;
      },
      $jwtSign: (arg: Record<string, any>) => signJwt(arg.payload ?? {}),
    },
  });
  return {
    kernel,
    store,
    verifier,
    env: { NODE_ENV: "", ADK_ALLOW_TEST_AUTH: "", ...env },
    events,
  };
}

function makeVerifier() {
  return new HS256JwtVerifier({
    keyLoader: async () => ({
      keyBytes: INLINE_KEY_BYTES.buffer.slice(
        INLINE_KEY_BYTES.byteOffset,
        INLINE_KEY_BYTES.byteOffset + INLINE_KEY_BYTES.byteLength,
      ),
      format: "raw",
    }),
  });
}

async function runPipeline(
  harness: ReturnType<typeof makeHarness>,
  overrides: Record<string, any> = {},
) {
  const projection = applyOverrides(
    await resolveProjection(loadDemo("projection.yaml"), harness.env, harness.events),
    overrides,
  );
  return harness.kernel.morphisms.evaluate(
    "morphism://adk.example/host-auth/hostAuthPipeline/1.0",
    { request: makeRequestPayload("alice", "confirm,pay"), projection },
  ) as Promise<Record<string, unknown>>;
}

async function resolveProjection(
  doc: Record<string, any>,
  env: Record<string, string>,
  events: unknown[],
) {
  const baseDefaults = loadDoc("default-projection.defaults.yaml");
  const baseInvariants = loadDoc("default-projection.invariants.yaml");
  const compose = setupComposeKernel(events);
  const chainResolved = (await compose.morphisms.evaluate("morphism://adk/extendsResolver/1.0", {
    doc,
    registry: new Map([
      [String(doc.extends?.[0] ?? "../../L08-kinds/host-auth/default-projection"), baseDefaults],
    ]),
  })) as Record<string, any>;
  const { extends: _extends, ...overlay } = chainResolved;
  const merged = (await compose.morphisms.evaluate("morphism://adk/resolveKindComposition/1.0", {
    defaults: baseDefaults,
    projection: overlay,
    invariants: baseInvariants,
  })) as Record<string, any>;
  return {
    ...merged,
    env,
    primitives: Object.fromEntries(
      PRIMITIVES.map((name) => [
        name,
        { ...(merged.primitives?.[name] ?? {}), render: loadPrimitive(name).render },
      ]),
    ),
  };
}

function applyOverrides(projection: Record<string, any>, overrides: Record<string, any>) {
  const next = structuredClone(projection);
  for (const [key, value] of Object.entries(overrides.primitives ?? {})) {
    next.primitives[key] = {
      ...next.primitives[key],
      ...value,
      props: { ...next.primitives[key]?.props, ...(value as Record<string, any>).props },
    };
  }
  return next;
}

function loadHostAuthDocument(): MorphismDocumentM1 {
  const raw = Bun.YAML.parse(
    readFileSync(resolve(KIND_DIR, "action-semantics.model.yaml"), "utf-8"),
  ) as {
    id: string;
    document: string;
    version: string;
    discriminator: string;
    morphisms: MorphismDocumentM1["morphisms"];
  };
  return {
    id: raw.id,
    level: MetaLevel.Model,
    conformsTo: MORPHISM_DOCUMENT_ID,
    schema: {},
    discriminator: raw.discriminator,
    name: raw.document,
    version: raw.version,
    morphisms: raw.morphisms,
  };
}

function normalizeCaps(raw: unknown) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return String(raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part]: "allow" }), {});
}

function signJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", INLINE_KEY_BYTES)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

async function decodeResponse(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

function setupComposeKernel(events: unknown[]) {
  const kernel = AlgebraicKernel.create();
  ensureTypes(kernel);
  registerMorphismDocument(buildComposeRuntimeDocument(), kernel, {
    defaultContext: composeContext((event) => {
      events.push(event);
      return {};
    }),
  });
  return kernel;
}

function composeContext(emitEvent: (arg: unknown) => unknown) {
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
        ? composeMerge(input.base?.[k], input.overlay?.[k], input.opts?.allowUnknownPaths ?? false)
        : input.opts?.allowUnknownPaths
          ? input.overlay?.[k]
          : (() => {
              throw new Error(`deepMerge: unknown overlay path ${k}`);
            })(),
    }),
    $findOverlap: ({ a, b }: { a: unknown; b: unknown }) => ({ paths: findOverlap(a, b) }),
    $buildChain: ({
      doc,
      registry,
    }: {
      doc: Record<string, any>;
      registry?: Map<string, Record<string, any>>;
    }) => [
      doc,
      ...(doc.extends ?? []).map((ref: string) => registry?.get(ref)).filter(Boolean as any),
    ],
    $canonicalize: (value: unknown) => JSON.stringify(value),
    $detectCycle: ({ chain }: { chain: unknown[] }) => detectCycle(chain),
    $mergeChain: (chain: unknown[]) =>
      chain.slice(1).reduce((acc, entry) => composeMerge(entry, acc, true), chain[0]),
    $raiseExtendsCycle: ({ path }: { path?: string[] }) => {
      throw new Error(`extends cycle: ${(path ?? []).join(" -> ")}`);
    },
    $emitEvent: emitEvent,
  };
}

function detectCycle(chain: unknown[]) {
  const seen = new Set<string>(),
    path: string[] = [];
  for (const edge of chain) {
    const key = JSON.stringify(edge);
    if (seen.has(key)) return { hasCycle: true, path: [...path, key] };
    seen.add(key);
    path.push(key);
  }
  return { hasCycle: false, path };
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

function ensureTypes(kernel: AlgebraicKernel) {
  for (const typeDef of TYPES) {
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
  required: string[] = [],
): TypeDef {
  return {
    id,
    level: MetaLevel.Model,
    conformsTo: RECORD_M2,
    name,
    version: "1.0.0",
    schema: { type: "object", properties, required, additionalProperties: true },
  };
}

const TYPES: TypeDef[] = [
  recordType("type://adk/HostAuthAny/1.0", "HostAuthAny", {}),
  recordType("type://adk/HostAuthPipelineInput/1.0", "HostAuthPipelineInput", {}),
  recordType("type://adk/HostAuthStageAccumulator/1.0", "HostAuthStageAccumulator", {}),
  recordType("type://adk/AuthResult/1.0", "AuthResult", {}),
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
