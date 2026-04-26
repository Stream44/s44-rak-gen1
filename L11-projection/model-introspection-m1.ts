import { readFileSync } from "node:fs";
import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import { registerBootstrapType } from "../L03-tower/bootstrap.ts";
import { MORPHISM_DOCUMENT_ID } from "../L02-metamodels/morphism-document.ts";
import {
  registerMorphismDocument,
  type MorphismDocumentM1,
} from "../L02-metamodels/morphism-document-adapter.ts";

const td = (id: string, name: string, conformsTo: string, schema: TypeDef["schema"]): TypeDef => ({
  id,
  level: MetaLevel.Model,
  conformsTo,
  name,
  version: "0.1.0",
  schema,
});
const RECORD = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
  COLLECTION = "type://github.com/Stream44/s44-rak-gen1@1.0/collection/1.0",
  UNION = "type://github.com/Stream44/s44-rak-gen1@1.0/union/1.0";
export const MODEL_INTROSPECTION_MORPHISMS_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/ModelIntrospectionMorphisms/1.0",
  level: MetaLevel.Model,
  conformsTo: MORPHISM_DOCUMENT_ID,
  name: "ModelIntrospectionMorphisms",
  version: "1.0",
  schema: {
    type: "object",
    required: ["document", "version", "conformsTo", "discriminator", "origin", "morphisms"],
    properties: {
      document: { type: "string", const: "ModelIntrospectionMorphisms" },
      version: { type: "string", const: "1.0" },
      conformsTo: { type: "string", const: "adk:MorphismDocument/1.0" },
      discriminator: { type: "string", const: "modelIntrospection" },
      origin: { type: "string", const: "adk" },
      morphisms: {
        type: "object",
        required: ["listLoadedModels", "getModelDocument", "walkModelCrossRefs"],
        properties: {
          listLoadedModels: { type: "object" },
          getModelDocument: { type: "object" },
          walkModelCrossRefs: { type: "object" },
        },
      },
    },
  },
};
registerBootstrapType(MODEL_INTROSPECTION_MORPHISMS_M1);
const TYPES = [
  td("type://adk/ListLoadedModelsInput/0.1.0", "ListLoadedModelsInput", RECORD, {
    type: "object",
    required: ["loader"],
    properties: { loader: { type: "object" } },
    additionalProperties: true,
  }),
  td("type://adk/ModelSummaryList/0.1.0", "ModelSummaryList", COLLECTION, {
    type: "array",
    items: { type: "object" },
  }),
  td("type://adk/GetModelDocumentInput/0.1.0", "GetModelDocumentInput", RECORD, {
    type: "object",
    required: ["loader", "modelId"],
    properties: { loader: { type: "object" }, modelId: { type: "string" } },
    additionalProperties: true,
  }),
  td("type://adk/ModelDocumentOrNull/0.1.0", "ModelDocumentOrNull", UNION, {
    oneOf: [{ type: "object" }, { type: "null" }],
  }),
  td("type://adk/WalkModelCrossRefsInput/0.1.0", "WalkModelCrossRefsInput", RECORD, {
    type: "object",
    required: ["document"],
    properties: { document: { type: "object" } },
    additionalProperties: true,
  }),
  td("type://adk/CrossRefIndex/0.1.0", "CrossRefIndex", RECORD, {
    type: "object",
    required: ["typeToRelations", "actionToTargetMachine", "morphismToAssets"],
    properties: {
      typeToRelations: { type: "object" },
      actionToTargetMachine: { type: "object" },
      morphismToAssets: { type: "object" },
    },
    additionalProperties: true,
  }),
];
const assets = (value: unknown, out: string[] = []): string[] => {
  if (!value || typeof value !== "object") return out;
  if (
    (value as { op?: string }).op === "assetRef" &&
    typeof (value as { name?: unknown }).name === "string"
  )
    out.push((value as { name: string }).name);
  for (const child of Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>))
    assets(child, out);
  return out;
};
const helpers = {
  $listLoadedModelsImpl: ({ loader }: { loader: { loadedModels?: Record<string, any> } }) =>
    Object.values(loader.loadedModels ?? {}).map((edge: any) => ({
      modelId: edge.modelId,
      origin: edge.origin,
      version: edge.version,
      conformsTo: edge.conformsTo,
      typeCount: Object.keys(edge.document?.entities ?? {}).length,
      enumCount: Object.keys(edge.document?.enums ?? {}).length,
      relationCount: Object.keys(edge.document?.relations ?? {}).length,
      actionCount: Object.keys(edge.document?.actions ?? {}).length,
      hasLifecycle: Object.prototype.hasOwnProperty.call(edge.document ?? {}, "lifecycle"),
    })),
  $getModelDocumentImpl: ({
    loader,
    modelId,
  }: {
    loader: { loadedModels?: Record<string, any> };
    modelId: string;
  }) => loader.loadedModels?.[modelId]?.document ?? null,
  $walkModelCrossRefsImpl: ({ document }: { document: Record<string, any> }) => ({
    typeToRelations: Object.entries(document.relations ?? {}).reduce(
      (acc, [name, relation]) => {
        for (const type of Object.values(
          (relation as { roles?: Record<string, string> }).roles ?? {},
        ))
          acc[String(type)] = [...(acc[String(type)] ?? []), name];
        return acc;
      },
      {} as Record<string, string[]>,
    ),
    actionToTargetMachine: Object.fromEntries(
      Object.entries(document.actions ?? {})
        .map(([name, action]) => [
          name,
          String((action as { targetMachine?: string }).targetMachine ?? ""),
        ])
        .filter(([, target]) => target.length > 0),
    ),
    morphismToAssets: Object.fromEntries(
      Object.entries(document.morphisms ?? {}).map(([name, morphism]) => [
        name,
        (morphism as { impl?: { kind?: string; uri?: string; ast?: unknown } }).impl?.kind ===
        "module"
          ? [`asset-module:${String((morphism as { impl?: { uri?: string } }).impl?.uri ?? "")}`]
          : assets((morphism as { impl?: { ast?: unknown } }).impl?.ast),
      ]),
    ),
  }),
};

export function buildModelIntrospectionRuntimeDocument(): MorphismDocumentM1 {
  const doc = Bun.YAML.parse(
    readFileSync(new URL("./model-introspection.model.yaml", import.meta.url), "utf-8"),
  ) as { discriminator: string; morphisms: MorphismDocumentM1["morphisms"] };
  return {
    id: MODEL_INTROSPECTION_MORPHISMS_M1.id,
    level: MetaLevel.Model,
    conformsTo: MORPHISM_DOCUMENT_ID,
    schema: MODEL_INTROSPECTION_MORPHISMS_M1.schema,
    discriminator: doc.discriminator,
    name: "ModelIntrospectionMorphisms",
    version: "1.0",
    morphisms: doc.morphisms,
  };
}

export function registerModelIntrospectionMorphisms(kernel: AlgebraicKernel): void {
  for (const typeDef of TYPES)
    try {
      kernel.resolveType(typeDef.id);
    } catch {
      kernel.defineType(typeDef);
    }
  registerMorphismDocument(buildModelIntrospectionRuntimeDocument(), kernel, {
    defaultContext: helpers,
  });
}
