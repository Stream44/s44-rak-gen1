import { BindingResolver } from "../bindings.ts";
import type { ActionBindingDef, RenderContext } from "../../L01-foundation/projection-types.ts";

export type ResolveBindingKind = "props" | "action" | "editable-action";
export type ResolveBindingValue = Record<string, unknown> | ActionBindingDef;

export interface ResolveBindingInput {
  kind: ResolveBindingKind;
  raw: unknown;
  context: RenderContext;
}

export interface ResolveBindingOutput {
  kind: ResolveBindingKind;
  value: ResolveBindingValue;
}

const resolveProps = (
  raw: Record<string, unknown>,
  resolver: BindingResolver,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, resolver.resolve(value)]));

const resolveActionBinding = (
  ab: ActionBindingDef,
  resolver: BindingResolver,
  editable: boolean,
): ActionBindingDef => {
  const out: ActionBindingDef = { action: ab.action };
  if (ab.action.startsWith("$")) {
    const resolved = resolver.resolve(ab.action);
    out.action = typeof resolved === "string" ? resolved : String(resolved ?? "");
  }
  if (ab.target !== undefined) out.target = resolver.resolve(ab.target);
  if (ab.payload) {
    out.payload = Object.fromEntries(
      Object.entries(ab.payload).map(([key, value]) => [
        key,
        editable && value === "$event.value" ? "$event.value" : resolver.resolve(value),
      ]),
    );
  }
  if (ab.capability) out.capability = ab.capability;
  if (ab.hideIfUnauthorized) out.hideIfUnauthorized = ab.hideIfUnauthorized;
  if (ab.onSuccess) out.onSuccess = ab.onSuccess;
  if (ab.onError) out.onError = ab.onError;
  if (ab.to) out.to = ab.to;
  if (ab.optimistic) out.optimistic = ab.optimistic;
  return out;
};

export default function resolveBinding(input: ResolveBindingInput): ResolveBindingOutput {
  const resolver = new BindingResolver(input.context);
  return input.kind === "props"
    ? { kind: input.kind, value: resolveProps(input.raw as Record<string, unknown>, resolver) }
    : {
        kind: input.kind,
        value: resolveActionBinding(
          input.raw as unknown as ActionBindingDef,
          resolver,
          input.kind === "editable-action",
        ),
      };
}
