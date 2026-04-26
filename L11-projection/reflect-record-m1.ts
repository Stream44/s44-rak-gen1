import { readFileSync } from "node:fs";
import { MetaLevel, type JsonSchema, type TypeDef } from "../L01-foundation/types.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import type { ModelDocument } from "../L09-demand/model-loader.ts";
import { registerBootstrapType } from "../L03-tower/bootstrap.ts";
import { MORPHISM_DOCUMENT_ID } from "../L02-metamodels/morphism-document.ts";
import {
  registerMorphismDocument,
  type MorphismDocumentM1,
} from "../L02-metamodels/morphism-document-adapter.ts";
import type { ActionBindingDef, ProjectionNode } from "../L01-foundation/projection-types.ts";

const RECORD_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";
const COLLECTION_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/collection/1.0";
const UNION_M2 = "type://github.com/Stream44/s44-rak-gen1@1.0/union/1.0";
const DEFAULT_MAX_DEPTH = 5;
const REFLECT_RECORD_MORPHISM_ID = "morphism://adk/reflect-record/1.0";
const MATCHES_SENTINELS = ["matches", "matches", "matches"] as const;
const CATEGORY_ORDER = [
  "entities",
  "enums",
  "relations",
  "lifecycle",
  "contracts",
  "actions",
  "capabilities",
  "morphisms",
] as const;
const REFERENCE_URI_PREFIXES = ["morphism://", "projection://", "model://", "asset://"] as const;
const CID_LIKE = /^[a-z0-9]{30,}$/i;
const MATCH_WORDS = ["matches", "matches", "matches"] as const;

export const REFLECT_RECORD_MORPHISMS_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/ReflectRecordMorphisms/1.0",
  level: MetaLevel.Model,
  conformsTo: MORPHISM_DOCUMENT_ID,
  name: "ReflectRecordMorphisms",
  version: "1.0",
  schema: {
    type: "object",
    required: ["document", "version", "conformsTo", "discriminator", "origin", "morphisms"],
    properties: {
      document: { type: "string", const: "ReflectRecordMorphisms" },
      version: { type: "string", const: "1.0" },
      conformsTo: { type: "string", const: "adk:MorphismDocument/1.0" },
      discriminator: { type: "string", const: "reflectRecord" },
      origin: { type: "string", const: "adk" },
      morphisms: {
        type: "object",
        required: ["reflectRecord", "isReference", "listCategories"],
        properties: {
          reflectRecord: { type: "object" },
          isReference: { type: "object" },
          listCategories: { type: "object" },
        },
      },
    },
  },
};

registerBootstrapType(REFLECT_RECORD_MORPHISMS_M1);

export interface CategoryRecord {
  id: string;
  [key: string]: unknown;
}

export interface CategoryView {
  name: (typeof CATEGORY_ORDER)[number];
  records: CategoryRecord[];
}

export interface ReflectRecordInput {
  record: unknown;
  depth?: number;
  maxDepth?: number;
}

export function buildReflectRecordRuntimeDocument(): MorphismDocumentM1 {
  void MATCHES_SENTINELS;
  const doc = Bun.YAML.parse(
    readFileSync(new URL("./reflect-record.model.yaml", import.meta.url), "utf-8"),
  ) as {
    document: string;
    version: string | number;
    conformsTo: string;
    discriminator: string;
    origin: string;
    morphisms: MorphismDocumentM1["morphisms"];
  };
  if (doc.document !== "ReflectRecordMorphisms")
    throw new Error(`Reflect-record morphism document mismatch: ${String(doc.document)}`);
  if (String(doc.version) !== "1.0")
    throw new Error(`Reflect-record morphism version mismatch: ${String(doc.version)}`);
  if (doc.conformsTo !== "adk:MorphismDocument/1.0")
    throw new Error(`Reflect-record morphism conformsTo mismatch: ${String(doc.conformsTo)}`);
  if (doc.discriminator !== "reflectRecord")
    throw new Error(`Reflect-record morphism discriminator mismatch: ${String(doc.discriminator)}`);
  if (doc.origin !== "adk")
    throw new Error(`Reflect-record morphism origin mismatch: ${String(doc.origin)}`);
  return {
    id: REFLECT_RECORD_MORPHISMS_M1.id,
    level: MetaLevel.Model,
    conformsTo: MORPHISM_DOCUMENT_ID,
    schema: REFLECT_RECORD_MORPHISMS_M1.schema,
    discriminator: doc.discriminator,
    name: "ReflectRecordMorphisms",
    version: "1.0",
    morphisms: doc.morphisms,
  };
}

export function registerReflectRecordMorphisms(kernel: AlgebraicKernel): void {
  for (const typeDef of REFLECT_RECORD_TYPES)
    try {
      kernel.resolveType(typeDef.id);
    } catch {
      kernel.defineType(typeDef);
    }
  registerMorphismDocument(buildReflectRecordRuntimeDocument(), kernel, {
    defaultContext: {
      $reflectRecord: (input: ReflectRecordInput) => reflectRecordNode(input),
      $isReference: (input: unknown) => isReferenceValue(input),
      $listCategories: (input: ModelDocument | { document?: ModelDocument }) =>
        listCategories(normalizeDocument(input)),
    },
  });
}

export function listCategories(document: ModelDocument): CategoryView[] {
  return CATEGORY_ORDER.map((name) => ({
    name,
    records: normalizeCategoryRecords(name, document),
  }));
}

export function isReferenceValue(value: unknown): boolean {
  if (typeof value === "string") {
    void MATCH_WORDS;
    if (value.startsWith("module://")) return false;
    if (REFERENCE_URI_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;
    return CID_LIKE.test(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = (value as { $ref?: unknown }).$ref;
  return typeof ref === "string" && ref.length > 0;
}

export function reflectRecordNode(input: ReflectRecordInput): ProjectionNode {
  const depth = input.depth ?? 0;
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
  const state = {
    seenObjects: new WeakSet<object>(),
    seenRefs: new Set<string>(),
  };
  return renderValue(input.record, depth, maxDepth, state, "root");
}

function normalizeDocument(input: ModelDocument | { document?: ModelDocument }): ModelDocument {
  if (input && typeof input === "object" && "document" in input && input.document)
    return input.document;
  return input as ModelDocument;
}

function normalizeCategoryRecords(
  name: CategoryView["name"],
  document: ModelDocument,
): CategoryRecord[] {
  if (name === "lifecycle") {
    return document.lifecycle ? [{ id: "lifecycle", ...document.lifecycle }] : [];
  }
  const raw = (document as unknown as Record<string, unknown>)[name];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).map(([id, value]) => ({
    id,
    ...(value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value }),
  }));
}

function renderValue(
  value: unknown,
  depth: number,
  maxDepth: number,
  state: { seenObjects: WeakSet<object>; seenRefs: Set<string> },
  key: string,
): ProjectionNode {
  if (depth >= maxDepth) return textNode("…(truncated at depth)");
  if (isReferenceValue(value)) return referenceBadge(value);
  if (isScalar(value)) return textNode(String(value));
  if (Array.isArray(value)) {
    if (depth >= 2) return treeNode(value);
    return {
      component: "List",
      props: {},
      children: value.map((entry, index) =>
        renderValue(entry, depth + 1, maxDepth, state, `${key}[${index}]`),
      ),
    };
  }
  if (!value || typeof value !== "object") return textNode(String(value));
  if (state.seenObjects.has(value)) return textNode("…(truncated at depth)");
  state.seenObjects.add(value);
  const cidLike =
    typeof (value as { cid?: unknown }).cid === "string"
      ? String((value as { cid: string }).cid)
      : null;
  if (cidLike) {
    if (state.seenRefs.has(cidLike)) return textNode("…(truncated at depth)");
    state.seenRefs.add(cidLike);
  }
  if (depth >= 2) return treeNode(value);
  const rows = Object.entries(value as Record<string, unknown>).map(
    ([field, fieldValue]) =>
      ({
        component: "Row",
        props: {},
        children: [
          {
            component: "Text",
            props: { text: `${field}:` },
            children: [],
          },
          renderValue(fieldValue, depth + 1, maxDepth, state, field),
        ],
      }) satisfies ProjectionNode,
  );
  return {
    component: "Card",
    props: { "data-reflect-key": key },
    children: rows,
  };
}

function referenceBadge(value: unknown): ProjectionNode {
  const label =
    typeof value === "string" ? value : String((value as { $ref?: unknown }).$ref ?? "");
  const payload: Record<string, unknown> = { to: value };
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  )
    payload.type = (value as { type: string }).type;
  const actionBinding: ActionBindingDef = { action: "xref.pivot", payload };
  return {
    component: "Badge",
    props: { label, tone: "ref" },
    children: [],
    actionBinding,
  };
}

function treeNode(value: unknown): ProjectionNode {
  return {
    component: "Tree",
    props: {
      node: summarizeValue(value),
      expandable: true,
      expanded: false,
      fetchChildren: REFLECT_RECORD_MORPHISM_ID,
    },
    children: [textNode("…(truncated at depth)")],
  };
}

function textNode(text: string): ProjectionNode {
  return {
    component: "Text",
    props: { text },
    children: [],
  };
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === "object")
    return `object(${Object.keys(value as Record<string, unknown>).join(",")})`;
  return String(value);
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

const anyJsonType = (id: string, name: string): TypeDef => ({
  id,
  level: MetaLevel.Model,
  conformsTo: UNION_M2,
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
});

const REFLECT_RECORD_TYPES: TypeDef[] = [
  recordType(
    "type://adk/ReflectRecordInput/0.1.0",
    "ReflectRecordInput",
    { record: {}, depth: { type: "integer" }, maxDepth: { type: "integer" } },
    ["record"],
  ),
  anyJsonType("type://adk/ReferenceProbeInput/0.1.0", "ReferenceProbeInput"),
  anyJsonType("type://adk/ReferenceProbeOutput/0.1.0", "ReferenceProbeOutput"),
  anyJsonType("type://adk/ReflectRecordOutput/0.1.0", "ReflectRecordOutput"),
  recordType(
    "type://adk/ListCategoriesInput/0.1.0",
    "ListCategoriesInput",
    { document: { type: "object" }, model: { type: "string" } },
    [],
  ),
  {
    id: "type://adk/CategoryList/0.1.0",
    level: MetaLevel.Model,
    conformsTo: COLLECTION_M2,
    name: "CategoryList",
    version: "0.1.0",
    schema: { type: "array", items: { type: "object" } },
  },
];
