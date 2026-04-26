import type { ActionBindingDef, RenderContext } from "../L01-foundation/projection-types.ts";
import resolveBinding from "./morphisms/resolve-binding.ts";

export const resolveProps = (
  raw: Record<string, unknown>,
  context: RenderContext,
): Record<string, unknown> =>
  resolveBinding({ kind: "props", raw, context }).value as Record<string, unknown>;

export const resolveActionBinding = (
  raw: ActionBindingDef,
  context: RenderContext,
): ActionBindingDef => resolveBinding({ kind: "action", raw, context }).value as ActionBindingDef;

export const resolveEditableActionBinding = (
  raw: ActionBindingDef,
  context: RenderContext,
): ActionBindingDef =>
  resolveBinding({ kind: "editable-action", raw, context }).value as ActionBindingDef;

export const truthy = (value: unknown): boolean =>
  !(value === null || value === undefined) &&
  (typeof value !== "boolean" || value) &&
  (typeof value !== "number" || value !== 0) &&
  (typeof value !== "string" || value.length > 0) &&
  (!Array.isArray(value) || value.length > 0);
