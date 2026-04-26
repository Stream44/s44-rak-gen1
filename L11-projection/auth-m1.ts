import { readFileSync } from "node:fs";
import { MetaLevel, type JsonSchema, type TypeDef } from "../L01-foundation/types.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import { MORPHISM_DOCUMENT_ID } from "../L02-metamodels/morphism-document.ts";
import {
  registerMorphismDocument,
  type MorphismDocumentM1,
} from "../L02-metamodels/morphism-document-adapter.ts";

export const AUTH_MORPHISMS_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/AuthMorphisms/1.0",
  level: MetaLevel.Model,
  conformsTo: MORPHISM_DOCUMENT_ID,
  name: "AuthMorphisms",
  version: "1.0",
  schema: {
    type: "object",
    required: ["document", "version", "conformsTo", "discriminator", "origin", "morphisms"],
    properties: {
      document: { type: "string", const: "AuthMorphisms" },
      version: { type: "string", const: "1.0" },
      conformsTo: { type: "string", const: "adk:MorphismDocument/1.0" },
      discriminator: { type: "string", const: "auth" },
      origin: { type: "string", const: "adk" },
      morphisms: {
        type: "object",
        required: [
          "extractAuthHeader",
          "jwtVerify",
          "mergeSessionScopes",
          "emitResolvedAuth",
          "resolveAuth",
          "bindSession",
          "jwtSign",
        ],
        properties: {
          extractAuthHeader: { type: "object" },
          jwtVerify: { type: "object" },
          mergeSessionScopes: { type: "object" },
          emitResolvedAuth: { type: "object" },
          resolveAuth: { type: "object" },
          bindSession: { type: "object" },
          jwtSign: { type: "object" },
        },
      },
    },
  },
};

export function buildAuthRuntimeDocument(): MorphismDocumentM1 {
  const doc = Bun.YAML.parse(
    readFileSync(new URL("./auth.model.yaml", import.meta.url), "utf-8"),
  ) as {
    document: string;
    version: string | number;
    conformsTo: string;
    discriminator: string;
    origin: string;
    morphisms: MorphismDocumentM1["morphisms"];
  };
  if (doc.document !== "AuthMorphisms")
    throw new Error(`Auth morphism document mismatch: ${String(doc.document)}`);
  if (String(doc.version) !== "1.0")
    throw new Error(`Auth morphism version mismatch: ${String(doc.version)}`);
  if (doc.conformsTo !== "adk:MorphismDocument/1.0")
    throw new Error(`Auth morphism conformsTo mismatch: ${String(doc.conformsTo)}`);
  if (doc.discriminator !== "auth")
    throw new Error(`Auth morphism discriminator mismatch: ${String(doc.discriminator)}`);
  if (doc.origin !== "adk") throw new Error(`Auth morphism origin mismatch: ${String(doc.origin)}`);
  return {
    id: AUTH_MORPHISMS_M1.id,
    level: MetaLevel.Model,
    conformsTo: MORPHISM_DOCUMENT_ID,
    schema: AUTH_MORPHISMS_M1.schema,
    discriminator: doc.discriminator,
    name: "AuthMorphisms",
    version: "1.0",
    morphisms: doc.morphisms,
  };
}

export function store(): never {
  throw new Error("PluggableInterface not wired");
}

export function jwtVerifier(): never {
  throw new Error("PluggableInterface not wired");
}

const RECORD_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";
const SCALAR_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0";

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
    "type://adk/AuthHeaderInput/0.1.0",
    "AuthHeaderInput",
    { request: { type: "object" }, authZPrimitives: { type: "array", items: { type: "object" } } },
    ["request", "authZPrimitives"],
  ),
  recordType(
    "type://adk/AuthHeaderResult/0.1.0",
    "AuthHeaderResult",
    {
      rawToken: { type: ["string", "null"] },
      authHeader: { type: ["string", "null"] },
      caps: { type: "object" },
      found: { type: "boolean" },
    },
    ["rawToken", "authHeader", "caps", "found"],
  ),
  recordType(
    "type://adk/JwtVerifyInput/0.1.0",
    "JwtVerifyInput",
    { rawToken: { type: ["string", "null"] }, keyAssetRef: { type: "string" } },
    ["rawToken", "keyAssetRef"],
  ),
  recordType(
    "type://adk/JwtVerifyResult/0.1.0",
    "JwtVerifyResult",
    { valid: { type: "boolean" }, claims: {}, error: { type: "string" } },
    ["valid"],
  ),
  recordType(
    "type://adk/MergeSessionScopesInput/0.1.0",
    "MergeSessionScopesInput",
    {
      sessionIds: { type: "object" },
      declaredScopes: { type: "array", items: { type: "string" } },
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
    "type://adk/ResolveAuthInput/0.1.0",
    "ResolveAuthInput",
    { request: { type: "object" }, context: { type: "object" } },
    ["request", "context"],
  ),
  recordType(
    "type://adk/ResolveAuthResult/0.1.0",
    "ResolveAuthResult",
    {
      source: { type: "string" },
      caps: { type: "object" },
      capabilityScopes: { type: "object" },
      jwtClaims: {},
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
  {
    id: "type://adk/SessionId/0.1.0",
    level: MetaLevel.Model,
    conformsTo: SCALAR_M2,
    name: "SessionId",
    version: "0.1.0",
    schema: { type: "string" },
  },
  recordType(
    "type://adk/JwtSignInput/0.1.0",
    "JwtSignInput",
    { payload: { type: "object" }, keyRef: { type: "string" }, verifierRef: {} },
    ["payload", "keyRef"],
  ),
  {
    id: "type://adk/JwtToken/0.1.0",
    level: MetaLevel.Model,
    conformsTo: SCALAR_M2,
    name: "JwtToken",
    version: "0.1.0",
    schema: { type: "string" },
  },
];

export function registerAuthMorphisms(kernel: AlgebraicKernel): void {
  for (const typeDef of AUTH_TYPES)
    try {
      kernel.resolveType(typeDef.id);
    } catch {
      kernel.defineType(typeDef);
    }
  registerMorphismDocument(buildAuthRuntimeDocument(), kernel, {
    defaultContext: { $store: store, $jwtVerifier: jwtVerifier },
  });
}
