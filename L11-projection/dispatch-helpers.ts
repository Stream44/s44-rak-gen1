import type { surveyCapabilityRequirements } from "./capability-enforcement.ts";
import type { DispatchResult, ResolvedManifest } from "./dispatch.ts";
import { resolveManifestRef } from "./dispatch.ts";
import type {
  DispatchFrameInput,
  DispatchOutcome,
  ProjectionAuthorizationContext,
  ProjectionKernelRuntime,
} from "./runtime-types.ts";

export async function dispatchAuthorize(
  runtime: Pick<ProjectionKernelRuntime, "dispatch">,
  requires: string[] | undefined,
  nextSession: unknown,
  ctx: ProjectionAuthorizationContext,
): Promise<unknown> {
  const result = await runtime.dispatch({
    payload: {
      requires: requires ?? [],
      requiresAny: ctx.requiresAny,
      session: nextSession,
      scope: ctx.scope,
      nodePath: ctx.nodePath,
    },
    ref: "Authorize",
  });
  return result.success
    ? result.value
    : {
        outcome: "deny",
        reason: result.error ?? "authorization failed",
        missing: requires ?? [],
        scope: ctx.scope,
        nodePath: ctx.nodePath,
      };
}

export async function dispatchSurveyCapabilities(
  runtime: Pick<ProjectionKernelRuntime, "dispatch">,
  doc: unknown,
): Promise<ReturnType<typeof surveyCapabilityRequirements>> {
  if (!doc) return [];
  const result = await runtime.dispatch({
    ref: "SurveyCapabilities",
    payload: doc as unknown as Record<string, unknown>,
  });
  return result.success ? (result.value as ReturnType<typeof surveyCapabilityRequirements>) : [];
}

export async function dispatchAndNarrow(
  runtime: Pick<ProjectionKernelRuntime, "dispatch">,
  manifest: ResolvedManifest,
  frame: DispatchFrameInput,
): Promise<DispatchResult | DispatchOutcome> {
  const result = await runtime.dispatch(frame);
  if (
    result.success &&
    result.value &&
    typeof result.value === "object" &&
    "kind" in (result.value as Record<string, unknown>)
  )
    return result.value as DispatchResult;
  if (result.success) return result;
  const actionRef = "ref" in frame ? frame.ref : frame.actionRef;
  const resolved = typeof actionRef === "string" ? resolveManifestRef(manifest, actionRef) : null;
  return {
    kind: resolved?.kind ?? "error",
    success: false,
    error: result.error ?? "Dispatch failed",
  } as DispatchResult;
}
