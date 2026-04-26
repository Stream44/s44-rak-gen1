import { MetaLevel, type TypeDef } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";
import "../../L02-metamodels/pluggable-interface.ts";

export interface JwtVerifierInterface {
  verify(
    token: string,
    keyRef: string,
  ): Promise<{ valid: boolean; claims?: Record<string, unknown>; error?: string }>;
  sign(claims: Record<string, unknown>, keyRef: string): Promise<{ token: string }>;
}

export const JWT_VERIFIER_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/jwt-verifier/1.0",
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/pluggable-interface/1.0",
  name: "JwtVerifierInterface",
  version: "1.0",
  schema: {
    methods: [
      {
        name: "verify",
        inputShape: {
          type: "object",
          required: ["token", "keyRef"],
          properties: { token: { type: "string" }, keyRef: { type: "string" } },
        },
        outputShape: {
          type: "object",
          required: ["valid"],
          properties: {
            valid: { type: "boolean" },
            claims: { type: "object" },
            error: { type: "string" },
          },
        },
      },
      {
        name: "sign",
        inputShape: {
          type: "object",
          required: ["claims", "keyRef"],
          properties: { claims: { type: "object" }, keyRef: { type: "string" } },
        },
        outputShape: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string" } },
        },
      },
    ],
    implModuleRef: "module://./hs256-jwt-verifier.ts",
    bootstrapHookName: "registerJwtVerifier",
  },
};

export function validateJwtVerifierM1(doc: unknown): asserts doc is typeof JWT_VERIFIER_M1 {
  const fail = (message: string): never => {
    throw new Error(`${JWT_VERIFIER_M1.id}: ${message}`);
  };
  if (!doc || typeof doc !== "object") fail("document must be an object");
  const candidate = doc as TypeDef;
  if (!Array.isArray(candidate.schema?.methods)) fail("missing methods");
  if (
    typeof candidate.schema.implModuleRef !== "string" ||
    !candidate.schema.implModuleRef.startsWith("module://")
  )
    fail("invalid implModuleRef");
  if (
    typeof candidate.schema.bootstrapHookName !== "string" ||
    candidate.schema.bootstrapHookName.length === 0
  )
    fail("invalid bootstrapHookName");
}

registerBootstrapType(JWT_VERIFIER_M1);
