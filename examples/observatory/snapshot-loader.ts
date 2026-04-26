import {
  ExpressionEvaluator,
  type KernelExpression,
  type ProjectionModel,
} from "../../L13-facade/index.ts";
import type { WorldState } from "./protocol.ts";
import {
  SNAPSHOT_MANIFEST_ID,
  type SnapshotCtxValue,
  type SnapshotManifest,
  type SnapshotManifestEntry,
  validateSnapshotManifest,
} from "../../L02-metamodels/snapshot-manifest.ts";

export type ProjectionDoc = ProjectionModel;
export type SnapshotResolveError = { path: string; reason: string };

const evaluator = new ExpressionEvaluator();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isSelector = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && typeof value.op === "string";
const normalizePath = (path: string) => path.replace(/\[(\d+)\]/g, "/$1").replace(/\./g, "/");
const sentinel = (path: string, reason: string) => ({ __snapshotError: true, path, reason });
const fail = (errors: SnapshotResolveError[], path: string, reason: string) => (
  errors.push({ path, reason }),
  sentinel(path, reason)
);
const selectField = (value: unknown, field: unknown) =>
  typeof field === "string" ? (isRecord(value) ? value[field] : undefined) : value;
const evalExpr = (
  expr: Record<string, unknown>,
  worldState: WorldState,
  ctx: Record<string, unknown>,
) =>
  evaluator.evaluate(
    (expr.op === "get" && typeof expr.path === "string"
      ? { ...expr, path: normalizePath(expr.path) }
      : expr) as KernelExpression,
    { $bind: worldState, $ctx: ctx },
  );
const normalizeReason = (reason: string) =>
  reason.startsWith("Cannot get ") || reason.startsWith("Unbound variable:")
    ? "selector resolved undefined"
    : reason;

export function loadSnapshotManifest(projection: ProjectionDoc): SnapshotManifest {
  const doc = projection as ProjectionDoc & Record<string, unknown>;
  return validateSnapshotManifest(
    {
      id: SNAPSHOT_MANIFEST_ID,
      exportWithDebug: doc.exportWithDebug,
      snapshots: doc.snapshots ?? [],
    },
    Object.keys(doc.pages ?? {}),
  );
}

function resolveNode(
  value: SnapshotCtxValue,
  path: string,
  worldState: WorldState,
  ctx: Record<string, unknown>,
  errors: SnapshotResolveError[],
): unknown {
  if (!isRecord(value)) return value;
  if (isSelector(value)) {
    if (value.op === "first" || value.op === "at") {
      const source = resolveNode(
        value.of as SnapshotCtxValue,
        `${path}.of`,
        worldState,
        ctx,
        errors,
      );
      if (!Array.isArray(source) || source.length === 0)
        return fail(
          errors,
          path,
          Array.isArray(source)
            ? "selector resolved empty array"
            : "selector did not resolve to an array",
        );
      const picked = selectField(
        source[value.op === "first" ? 0 : Number(value.index)],
        value.field,
      );
      return picked === undefined
        ? fail(
            errors,
            path,
            `selector resolved undefined at ${value.op === "first" ? 0 : Number(value.index)}`,
          )
        : picked;
    }
    const result = evalExpr(value, worldState, ctx);
    return result.error
      ? fail(errors, path, normalizeReason(result.error))
      : result.value === undefined
        ? fail(errors, path, "selector resolved undefined")
        : result.value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value))
    out[key] = resolveNode(
      child as SnapshotCtxValue,
      `${path}.${key}`,
      worldState,
      { ...ctx, ...out },
      errors,
    );
  return out;
}

// Loader for adk:SnapshotManifest/1.0.
export function resolveSnapshotCtx(
  entry: SnapshotManifestEntry,
  worldState: WorldState,
): { ctx: Record<string, unknown>; errors: SnapshotResolveError[] } {
  const errors: SnapshotResolveError[] = [],
    ctx: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry.ctx))
    ctx[key] = resolveNode(value, `ctx.${key}`, worldState, ctx, errors);
  return { ctx, errors };
}
