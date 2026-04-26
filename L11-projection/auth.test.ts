import { describe, expect, test } from "bun:test";
import { MetaLevel, type JsonSchema, type TypeDef } from "../L01-foundation/types.ts";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { buildAuthRuntimeDocument } from "./auth-m1.ts";
import {
  registerMorphismDocument,
  validateMorphismDocument,
} from "../L02-metamodels/morphism-document-adapter.ts";

const RECORD_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";
const SCALAR_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0";

describe("auth morphism document", () => {
  test("validateMorphismDocument(buildAuthRuntimeDocument()) does not throw", () => {
    expect(() => validateMorphismDocument(buildAuthRuntimeDocument())).not.toThrow();
  });

  test("extractAuthHeader bearer match returns token, header, and caps", async () => {
    const { kernel } = setupAuthKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/extractAuthHeader/1.0", {
      request: { headers: { Authorization: { scheme: "Bearer", credentials: "tok-123" } } },
      authZPrimitives: [
        { header: "Authorization", format: "bearer", mapsTo: { caps: { confirm: "allow" } } },
      ],
    });
    expect(result).toEqual({
      rawToken: "tok-123",
      authHeader: "Authorization",
      caps: { confirm: "allow" },
      found: true,
    });
  });

  test("extractAuthHeader basic match returns the base64 chunk without decoding", async () => {
    const { kernel } = setupAuthKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/extractAuthHeader/1.0", {
      request: { headers: { Authorization: { scheme: "Basic", credentials: "YWxpY2U6c2VjcmV0" } } },
      authZPrimitives: [{ header: "Authorization", format: "basic", mapsTo: { caps: {} } }],
    });
    expect(result).toEqual({
      rawToken: "YWxpY2U6c2VjcmV0",
      authHeader: "Authorization",
      caps: {},
      found: true,
    });
  });

  test("extractAuthHeader raw match returns the whole header value", async () => {
    const { kernel } = setupAuthKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/extractAuthHeader/1.0", {
      request: { headers: { "X-Session": "session-42" } },
      authZPrimitives: [
        { header: "X-Session", format: "raw", mapsTo: { caps: { session: "allow" } } },
      ],
    });
    expect(result).toEqual({
      rawToken: "session-42",
      authHeader: "X-Session",
      caps: { session: "allow" },
      found: true,
    });
  });

  test("extractAuthHeader missing header returns null token and found false", async () => {
    const { kernel } = setupAuthKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/extractAuthHeader/1.0", {
      request: { headers: {} },
      authZPrimitives: [{ header: "Authorization", format: "bearer", mapsTo: { caps: {} } }],
    });
    expect(result).toEqual({ rawToken: null, authHeader: null, caps: {}, found: false });
  });

  test("extractAuthHeader malformed bearer header does not bind token", async () => {
    const { kernel } = setupAuthKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/extractAuthHeader/1.0", {
      request: { headers: { Authorization: { scheme: "Bearer" } } },
      authZPrimitives: [
        { header: "Authorization", format: "bearer", mapsTo: { caps: { confirm: "allow" } } },
      ],
    });
    expect(result).toEqual({ rawToken: null, authHeader: null, caps: {}, found: false });
  });

  test("extractAuthHeader picks the first matching primitive and short-circuits later ones", async () => {
    const { kernel } = setupAuthKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/extractAuthHeader/1.0", {
      request: { headers: { Authorization: { scheme: "Bearer", credentials: "tok-abc" } } },
      authZPrimitives: [
        { header: "Authorization", format: "bearer", mapsTo: { caps: { first: true } } },
        { header: "Authorization", format: "bearer", mapsTo: { caps: { second: true } } },
      ],
    });
    expect(result).toEqual({
      rawToken: "tok-abc",
      authHeader: "Authorization",
      caps: { first: true },
      found: true,
    });
  });

  test("jwtVerify with null token returns no-token without touching jwtVerifier", async () => {
    let calls = 0;
    const { kernel } = setupAuthKernel({
      $jwtVerifier: () => {
        calls += 1;
        throw new Error("should not run");
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/jwtVerify/1.0", {
      rawToken: null,
      keyAssetRef: "asset://keys/main",
    });
    expect(result).toEqual({ valid: false, error: "no-token" });
    expect(calls).toBe(0);
  });

  test("jwtVerify dispatches jwtVerifier with token and keyRef", async () => {
    const calls: unknown[] = [];
    const { kernel } = setupAuthKernel({
      $jwtVerifier: (arg: unknown) => {
        calls.push(arg);
        return { valid: true, claims: { caps: { confirm: true }, scopes: { orders: "sess-1" } } };
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/jwtVerify/1.0", {
      rawToken: "signed.jwt",
      keyAssetRef: "asset://keys/main",
    });
    expect(calls).toEqual([{ token: "signed.jwt", keyRef: "asset://keys/main" }]);
    expect(result).toEqual({
      valid: true,
      claims: { caps: { confirm: true }, scopes: { orders: "sess-1" } },
    });
  });

  test("mergeSessionScopes with empty sessionIds returns empty aggregates", async () => {
    const { kernel } = setupAuthKernel({
      $store: () => {
        throw new Error("should not run");
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/mergeSessionScopes/1.0", {
      sessionIds: {},
      declaredScopes: ["orders"],
    });
    expect(result).toEqual({ caps: {}, capabilityScopes: {}, ephemeral: {} });
  });

  test("mergeSessionScopes merges a single session scope", async () => {
    const { kernel } = setupAuthKernel({
      $store: () => ({
        caps: { confirm: true },
        capabilityScopes: { orders: "sess-1" },
        ephemeral: { actor: "alice" },
      }),
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/mergeSessionScopes/1.0", {
      sessionIds: { orders: "sess-1" },
      declaredScopes: ["orders"],
    });
    expect(result).toEqual({
      caps: { confirm: true },
      capabilityScopes: { orders: "sess-1" },
      ephemeral: { actor: "alice" },
    });
  });

  test("mergeSessionScopes merges multiple identifiers with later-scope-wins collisions", async () => {
    const calls: unknown[] = [];
    const store = ({ scope, sessionId }: { scope: string; sessionId: string }) => {
      calls.push({ scope, sessionId });
      return scope === "orders"
        ? {
            caps: { confirm: false },
            capabilityScopes: { orders: "sess-1" },
            ephemeral: { actor: "alice", region: "us" },
          }
        : {
            caps: { confirm: true, pay: true },
            capabilityScopes: { payments: "sess-2" },
            ephemeral: { actor: "bob" },
          };
    };
    const { kernel } = setupAuthKernel({ $store: store });
    const result = await kernel.morphisms.evaluate("morphism://adk/mergeSessionScopes/1.0", {
      sessionIds: { orders: "sess-1", payments: "sess-2" },
      declaredScopes: ["orders", "payments"],
    });
    expect(calls).toEqual([
      { scope: "orders", sessionId: "sess-1" },
      { scope: "payments", sessionId: "sess-2" },
    ]);
    expect(result).toEqual({
      caps: { confirm: true, pay: true },
      capabilityScopes: { orders: "sess-1", payments: "sess-2" },
      ephemeral: { actor: "bob", region: "us" },
    });
  });

  test("resolveAuth JWT-only path returns jwt and does not call store", async () => {
    let storeCalls = 0;
    const { kernel } = setupAuthKernel({
      $jwtVerifier: () => ({
        valid: true,
        claims: { caps: { confirm: true }, scopes: { orders: "jwt-orders" }, sub: "alice" },
      }),
      $store: () => {
        storeCalls += 1;
        return {};
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/resolveAuth/1.0", {
      request: {
        headers: { Authorization: { scheme: "Bearer", credentials: "jwt-1" } },
        sessionIds: {},
      },
      context: {
        authZPrimitives: [{ header: "Authorization", format: "bearer", mapsTo: { caps: {} } }],
        keyAssetRef: "asset://keys/main",
        declaredScopes: ["orders"],
      },
    });
    expect(storeCalls).toBe(0);
    expect(result).toEqual({
      source: "jwt",
      caps: { confirm: true },
      capabilityScopes: { orders: "jwt-orders" },
      jwtClaims: { caps: { confirm: true }, scopes: { orders: "jwt-orders" }, sub: "alice" },
    });
  });

  test("resolveAuth JWT plus session path calls both siblings and returns jwt+session", async () => {
    let jwtCalls = 0;
    let storeCalls = 0;
    const { kernel } = setupAuthKernel({
      $jwtVerifier: () => {
        jwtCalls += 1;
        return {
          valid: true,
          claims: { caps: { confirm: true }, scopes: { orders: "jwt-orders" } },
        };
      },
      $store: () => {
        storeCalls += 1;
        return {
          caps: { pay: true },
          capabilityScopes: { orders: "sess-1" },
          ephemeral: { pay: true },
        };
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/resolveAuth/1.0", {
      request: {
        headers: { Authorization: { scheme: "Bearer", credentials: "jwt-2" } },
        sessionIds: { orders: "sess-1" },
      },
      context: {
        authZPrimitives: [{ header: "Authorization", format: "bearer", mapsTo: { caps: {} } }],
        keyAssetRef: "asset://keys/main",
        declaredScopes: ["orders"],
      },
    });
    expect(jwtCalls).toBe(1);
    expect(storeCalls).toBe(1);
    expect(result).toEqual({
      source: "jwt+session",
      caps: { confirm: true, pay: true },
      capabilityScopes: { orders: "sess-1" },
      jwtClaims: { caps: { confirm: true }, scopes: { orders: "jwt-orders" } },
      ephemeral: { pay: true },
    });
  });

  test("resolveAuth store-only path skips jwtVerifier and returns session", async () => {
    let jwtCalls = 0;
    const { kernel } = setupAuthKernel({
      $jwtVerifier: () => {
        jwtCalls += 1;
        return { valid: true };
      },
      $store: () => ({
        caps: { confirm: true },
        capabilityScopes: { orders: "sess-1" },
        ephemeral: { actor: "alice" },
      }),
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/resolveAuth/1.0", {
      request: { headers: {}, sessionIds: { orders: "sess-1" } },
      context: {
        authZPrimitives: [{ header: "Authorization", format: "bearer", mapsTo: { caps: {} } }],
        keyAssetRef: "asset://keys/main",
        declaredScopes: ["orders"],
      },
    });
    expect(jwtCalls).toBe(0);
    expect(result).toEqual({
      source: "session",
      caps: { confirm: true },
      capabilityScopes: { orders: "sess-1" },
      ephemeral: { actor: "alice" },
    });
  });

  test("resolveAuth anonymous path returns empty caps", async () => {
    const { kernel } = setupAuthKernel();
    const result = await kernel.morphisms.evaluate("morphism://adk/resolveAuth/1.0", {
      request: { headers: {}, sessionIds: {} },
      context: { authZPrimitives: [], keyAssetRef: "asset://keys/main", declaredScopes: [] },
    });
    expect(result).toEqual({ source: "anonymous", caps: {}, capabilityScopes: {} });
  });

  test("bindSession dispatches store create and attach then returns the session id", async () => {
    const calls: unknown[] = [];
    const { kernel } = setupAuthKernel({
      $store: (arg: { op: string }) => {
        calls.push(arg);
        return arg.op === "create" ? "sess-created" : null;
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/bindSession/1.0", {
      user: { id: "alice" },
      scope: "orders",
      caps: { confirm: true },
    });
    expect(calls).toEqual([
      { op: "create", user: { id: "alice" }, scope: "orders" },
      { op: "attach", sessionId: "sess-created", caps: { confirm: true } },
    ]);
    expect(result).toBe("sess-created");
  });

  test("jwtSign dispatches jwtVerifier sign and returns the token", async () => {
    const calls: unknown[] = [];
    const { kernel } = setupAuthKernel({
      $jwtVerifier: (arg: unknown) => {
        calls.push(arg);
        return { token: "jwt-123" };
      },
    });
    const result = await kernel.morphisms.evaluate("morphism://adk/jwtSign/1.0", {
      payload: { sub: "alice" },
      keyRef: "asset://keys/main",
      verifierRef: "asset://adk.example/jwt-verifier/MemoryHS256JwtVerifier/1.0",
    });
    expect(calls).toEqual([
      {
        op: "sign",
        claims: { sub: "alice" },
        keyRef: "asset://keys/main",
        verifierRef: "asset://adk.example/jwt-verifier/MemoryHS256JwtVerifier/1.0",
      },
    ]);
    expect(result).toBe("jwt-123");
  });
});

function setupAuthKernel(defaultContext: Record<string, unknown> = {}) {
  const kernel = AlgebraicKernel.create();
  ensureAuthTypes(kernel);
  const doc = buildAuthRuntimeDocument();
  registerMorphismDocument(doc, kernel, {
    defaultContext: {
      $store: () => {
        throw new Error("PluggableInterface not wired");
      },
      $jwtVerifier: () => {
        throw new Error("PluggableInterface not wired");
      },
      ...defaultContext,
    },
  });
  return { kernel, doc };
}

function ensureAuthTypes(kernel: AlgebraicKernel): void {
  for (const typeDef of AUTH_TYPES) {
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
    level: MetaLevel.Model,
    conformsTo: RECORD_M2,
    name,
    version: "0.1.0",
    schema: { type: "object", properties, required, additionalProperties: true },
  };
}

const AUTH_TYPES: TypeDef[] = [
  recordType(
    "type://adk/AuthExtractInput/0.1.0",
    "AuthExtractInput",
    { request: { type: "object" }, authZPrimitives: { type: "array", items: { type: "object" } } },
    ["request", "authZPrimitives"],
  ),
  recordType(
    "type://adk/AuthExtractResult/0.1.0",
    "AuthExtractResult",
    { rawToken: {}, authHeader: {}, caps: { type: "object" }, found: { type: "boolean" } },
    ["rawToken", "authHeader", "caps", "found"],
  ),
  recordType(
    "type://adk/JwtVerifyInput/0.1.0",
    "JwtVerifyInput",
    { rawToken: {}, keyAssetRef: {} },
    ["rawToken", "keyAssetRef"],
  ),
  recordType(
    "type://adk/JwtVerifyResult/0.1.0",
    "JwtVerifyResult",
    { valid: { type: "boolean" }, claims: { type: "object" }, error: { type: "string" } },
    ["valid"],
  ),
  recordType(
    "type://adk/MergeSessionScopesInput/0.1.0",
    "MergeSessionScopesInput",
    {
      sessionIds: { type: "object" },
      declaredScopes: { type: "array", items: { type: "string" } },
      store: {},
    },
    ["sessionIds", "declaredScopes"],
  ),
  recordType(
    "type://adk/MergeSessionScopesResult/0.1.0",
    "MergeSessionScopesResult",
    {
      caps: { type: "object" },
      capabilityScopes: { type: "object" },
      ephemeral: { type: "object" },
    },
    ["caps", "capabilityScopes", "ephemeral"],
  ),
  recordType(
    "type://adk/EmitResolvedAuthInput/0.1.0",
    "EmitResolvedAuthInput",
    {
      jwtResult: { type: "object" },
      sessionResult: { type: "object" },
      extracted: { type: "object" },
    },
    ["jwtResult", "sessionResult", "extracted"],
  ),
  recordType(
    "type://adk/ResolveAuthInput/0.1.0",
    "ResolveAuthInput",
    { request: { type: "object" }, context: { type: "object" } },
    ["request", "context"],
  ),
  recordType(
    "type://adk/ResolvedAuth/0.1.0",
    "ResolvedAuth",
    {
      source: { type: "string" },
      caps: { type: "object" },
      capabilityScopes: { type: "object" },
      jwtClaims: { type: "object" },
      ephemeral: { type: "object" },
    },
    ["source", "caps", "capabilityScopes"],
  ),
  recordType(
    "type://adk/BindSessionInput/0.1.0",
    "BindSessionInput",
    { user: { type: "object" }, scope: { type: "string" }, caps: { type: "object" } },
    ["user", "scope", "caps"],
  ),
  recordType(
    "type://adk/JwtSignInput/0.1.0",
    "JwtSignInput",
    { payload: { type: "object" }, keyRef: { type: "string" }, verifierRef: {} },
    ["payload", "keyRef"],
  ),
  {
    id: "type://adk/SessionId/0.1.0",
    level: MetaLevel.Model,
    conformsTo: SCALAR_M2,
    name: "SessionId",
    version: "0.1.0",
    schema: { type: "string" },
  },
  {
    id: "type://adk/JwtToken/0.1.0",
    level: MetaLevel.Model,
    conformsTo: SCALAR_M2,
    name: "JwtToken",
    version: "0.1.0",
    schema: { type: "string" },
  },
];
