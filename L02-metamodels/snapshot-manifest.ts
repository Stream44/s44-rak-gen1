import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";

export const SNAPSHOT_MANIFEST_ID = "adk:SnapshotManifest/1.0" as const;
export const SNAPSHOT_SELECTOR_OPS = new Set([
  "const",
  "var",
  "get",
  "call",
  "lambda",
  "apply",
  "let",
  "if",
  "match",
  "record",
  "array",
  "first",
  "at",
]);

type Primitive = string | number | boolean | null;
export interface SnapshotCtxRecord {
  [key: string]: SnapshotCtxValue;
}
export type SnapshotCtxValue = Primitive | SnapshotSelector | SnapshotCtxRecord;
export type SnapshotSelector =
  | { op: "const"; value: unknown }
  | { op: "var"; name: string }
  | { op: "get"; path: string }
  | { op: "call"; fn: string; args: SnapshotCtxValue[] }
  | { op: "lambda"; param: string; body: SnapshotCtxValue }
  | { op: "apply"; fn: SnapshotCtxValue; arg: SnapshotCtxValue }
  | { op: "let"; name: string; value: SnapshotCtxValue; body: SnapshotCtxValue }
  | { op: "if"; cond: SnapshotCtxValue; then: SnapshotCtxValue; else: SnapshotCtxValue }
  | { op: "match"; scrutinee: SnapshotCtxValue; cases: unknown[] }
  | { op: "record"; fields: Record<string, SnapshotCtxValue> }
  | { op: "array"; elements: SnapshotCtxValue[] }
  | { op: "first"; of: SnapshotCtxValue; field?: string }
  | { op: "at"; of: SnapshotCtxValue; index: number; field?: string };

export interface SnapshotManifestEntry {
  name: string;
  page: string;
  path?: string;
  ctx: Record<string, SnapshotCtxValue>;
  scope?: string;
  debug?: boolean;
}

export interface SnapshotManifest {
  exportWithDebug?: boolean;
  snapshots: SnapshotManifestEntry[];
}

export const SNAPSHOT_MANIFEST_METAMODEL: TypeDef = {
  id: SNAPSHOT_MANIFEST_ID,
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "SnapshotManifest",
  version: "1.0",
  description: "Curated observatory snapshot declarations with selector-backed ctx seeds.",
  schema: {
    type: "object",
    required: ["id", "snapshots"],
    properties: {
      id: { type: "string", const: SNAPSHOT_MANIFEST_ID },
      exportWithDebug: { type: "boolean" },
      snapshots: { type: "array", items: { type: "object" } },
    },
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPrimitive = (value: unknown): value is Primitive =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

function assertSelector(value: Record<string, unknown>, path: string): void {
  const op = value.op;
  if (typeof op !== "string" || !SNAPSHOT_SELECTOR_OPS.has(op)) {
    throw new Error(`${path}.op must name a supported op`);
  }
  if (
    (op === "var" && typeof value.name !== "string") ||
    (op === "get" && typeof value.path !== "string")
  ) {
    throw new Error(`${path} is missing required selector fields`);
  }
  if (op === "call" && (typeof value.fn !== "string" || !Array.isArray(value.args))) {
    throw new Error(`${path} is missing required selector fields`);
  }
  if (op === "lambda" && (typeof value.param !== "string" || value.body === undefined)) {
    throw new Error(`${path} is missing required selector fields`);
  }
  if (op === "apply" && (value.fn === undefined || value.arg === undefined)) {
    throw new Error(`${path} is missing required selector fields`);
  }
  if (
    op === "let" &&
    (typeof value.name !== "string" || value.value === undefined || value.body === undefined)
  ) {
    throw new Error(`${path} is missing required selector fields`);
  }
  if (
    op === "if" &&
    (value.cond === undefined || value.then === undefined || value.else === undefined)
  ) {
    throw new Error(`${path} is missing required selector fields`);
  }
  if (op === "match" && (value.scrutinee === undefined || !Array.isArray(value.cases))) {
    throw new Error(`${path} is missing required selector fields`);
  }
  if (op === "record" && !isRecord(value.fields))
    throw new Error(`${path} is missing required selector fields`);
  if (op === "array" && !Array.isArray(value.elements))
    throw new Error(`${path} is missing required selector fields`);
  if ((op === "first" || op === "at") && value.of === undefined)
    throw new Error(`${path} is missing required selector fields`);
  if (op === "at" && !Number.isInteger(value.index))
    throw new Error(`${path}.index must be an integer`);
  if (value.field !== undefined && typeof value.field !== "string")
    throw new Error(`${path}.field must be a string`);
}

function assertCtxValue(value: unknown, path: string): void {
  if (isPrimitive(value)) return;
  if (!isRecord(value)) throw new Error(`${path} must be a primitive, nested object, or selector`);
  if ("op" in value) {
    assertSelector(value, path);
    return;
  }
  for (const [key, child] of Object.entries(value)) assertCtxValue(child, `${path}.${key}`);
}

export function validateSnapshotManifest(
  input: unknown,
  pages: Iterable<string>,
): SnapshotManifest {
  if (!isRecord(input)) throw new Error("Snapshot manifest must be an object");
  if (input.exportWithDebug !== undefined && typeof input.exportWithDebug !== "boolean") {
    throw new Error("exportWithDebug must be a boolean");
  }
  if (!Array.isArray(input.snapshots)) throw new Error("snapshots must be an array");
  const pageSet = new Set(pages),
    seen = new Set<string>();
  const snapshots = input.snapshots.map((value, index) => {
    const path = `snapshots[${index}]`;
    if (!isRecord(value)) throw new Error(`${path} must be an object`);
    if (typeof value.name !== "string" || value.name.trim() === "")
      throw new Error(`${path}.name must be non-empty`);
    if (seen.has(value.name)) throw new Error(`${path}.name duplicates "${value.name}"`);
    seen.add(value.name);
    if (typeof value.page !== "string" || !pageSet.has(value.page))
      throw new Error(`${path}.page must reference a known pages: key`);
    if (!isRecord(value.ctx)) throw new Error(`${path}.ctx must be an object`);
    if (value.path !== undefined && typeof value.path !== "string")
      throw new Error(`${path}.path must be a string`);
    if (value.scope !== undefined && typeof value.scope !== "string")
      throw new Error(`${path}.scope must be a string`);
    if (value.debug !== undefined && typeof value.debug !== "boolean")
      throw new Error(`${path}.debug must be a boolean`);
    for (const [key, child] of Object.entries(value.ctx))
      assertCtxValue(child, `${path}.ctx.${key}`);
    return {
      name: value.name,
      page: value.page,
      path: value.path,
      ctx: value.ctx as Record<string, SnapshotCtxValue>,
      scope: (value.scope as string | undefined) ?? "*",
      debug: value.debug as boolean | undefined,
    } satisfies SnapshotManifestEntry;
  });
  return { exportWithDebug: input.exportWithDebug as boolean | undefined, snapshots };
}
