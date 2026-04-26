import { MetaLevel, type TypeDef } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";
import "../../L02-metamodels/pluggable-interface.ts";

export const CONTENT_STORE_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/content-store/1.0",
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/pluggable-interface/1.0",
  name: "ContentStore",
  version: "1.0",
  schema: {
    methods: [
      {
        name: "get",
        inputShape: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        outputShape: { type: ["array", "null"], description: "Uint8Array | null" },
      },
      {
        name: "put",
        inputShape: {
          type: "object",
          required: ["id", "bytes"],
          properties: { id: { type: "string" }, bytes: { description: "Uint8Array" } },
        },
        outputShape: { type: "void" },
      },
      {
        name: "has",
        inputShape: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        outputShape: { type: "boolean" },
      },
      {
        name: "delete",
        inputShape: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        outputShape: { type: "boolean" },
      },
    ],
    implModuleRef: "module://./memory-content-store.ts",
    bootstrapHookName: "registerContentStore",
  },
};

export function validateContentStoreM1(doc: unknown): asserts doc is typeof CONTENT_STORE_M1 {
  const fail = (message: string): never => {
    throw new Error(`${CONTENT_STORE_M1.id}: ${message}`);
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
  for (const method of candidate.schema.methods as unknown[]) {
    if (!method || typeof method !== "object") fail("methods entries must be objects");
    const entry = method as Record<string, unknown>;
    if (typeof entry.name !== "string") fail("methods.name must be a string");
    if (!entry.inputShape || typeof entry.inputShape !== "object")
      fail(`method ${String(entry.name)} missing inputShape`);
    if (!entry.outputShape || typeof entry.outputShape !== "object")
      fail(`method ${String(entry.name)} missing outputShape`);
  }
}

registerBootstrapType(CONTENT_STORE_M1);
