import { MetaLevel, type TypeDef } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";
import "../../L02-metamodels/pluggable-interface.ts";

export interface KeyAssetInterface {
  load(): Promise<{ keyBytes: ArrayBuffer; format: string }>;
  fingerprint(): Promise<string>;
}

export const KEY_ASSET_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/key-asset/1.0",
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/pluggable-interface/1.0",
  name: "KeyAssetInterface",
  version: "1.0",
  schema: {
    methods: [
      {
        name: "load",
        inputShape: { type: "object", properties: {} },
        outputShape: {
          type: "object",
          required: ["keyBytes", "format"],
          properties: {
            keyBytes: { description: "ArrayBuffer" },
            format: { type: "string", enum: ["raw", "pem", "jwk"] },
          },
        },
      },
      {
        name: "fingerprint",
        inputShape: { type: "object", properties: {} },
        outputShape: {
          type: "object",
          required: ["fingerprint"],
          properties: { fingerprint: { type: "string" } },
        },
      },
    ],
    implModuleRef: "module://./inline-key-asset.ts",
    bootstrapHookName: "registerKeyAsset",
  },
};

export function validateKeyAssetM1(doc: unknown): asserts doc is typeof KEY_ASSET_M1 {
  const fail = (message: string): never => {
    throw new Error(`${KEY_ASSET_M1.id}: ${message}`);
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

registerBootstrapType(KEY_ASSET_M1);
