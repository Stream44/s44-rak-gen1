import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import type { SchemaValidator } from "../../L01-foundation/validator.ts";
import type { DispatchResult, ResolvedManifest } from "../dispatch.ts";
import type { ProjectionSession } from "../session.ts";
import { AlgebraicKernel } from "../../L13-facade/index.ts";
import { evaluateNamedMorphism } from "./evaluate-action-morphism.ts";

export default async function dispatchProjectionFrame(
  frame: {
    actionRef: string;
    target?: string;
    payload?: Record<string, unknown>;
    capabilityId?: string;
  },
  manifest: ResolvedManifest,
  app: ModelBoot | null,
  session: ProjectionSession,
  validator: SchemaValidator,
  dispatchRequirement: string | undefined,
  morphismIdsByName: Map<string, string>,
  algebraBindings: Map<string, Function>,
  ak: AlgebraicKernel,
): Promise<{ success: boolean; value?: unknown; error?: string }> {
  const resolveRefResult = await evaluateDispatchStage(
    "resolveRef",
    { ...frame, frame, manifest },
    morphismIdsByName,
    algebraBindings,
    ak,
  );
  const verdict = (await evaluateDispatchStage(
    "authorize",
    {
      requires:
        dispatchRequirement && dispatchRequirement !== "cap://none" ? [dispatchRequirement] : [],
      session: {
        ...session,
        currentUser: {
          ...session.currentUser,
          capabilities:
            dispatchRequirement && frame.capabilityId
              ? { ...session.currentUser.capabilities, [dispatchRequirement]: frame.capabilityId }
              : session.currentUser.capabilities,
        },
      },
      scope: "action",
      nodePath: `actions.${(resolveRefResult as { name?: string }).name ?? frame.actionRef}`,
    },
    morphismIdsByName,
    algebraBindings,
    ak,
  )) as { outcome: "allow" | "deny"; reason?: string; missing?: string[] };
  if (verdict.outcome === "deny")
    return {
      success: false,
      error: `Capability denied: ${verdict.reason ?? (verdict.missing ?? []).join(", ")}`,
    };
  const intentResult = await evaluateDispatchStage(
    "submitIntent",
    { ...(resolveRefResult as object), resolved: resolveRefResult, app, session, validator },
    morphismIdsByName,
    algebraBindings,
    ak,
  );
  const encoded = (await evaluateDispatchStage(
    "encodeResult",
    { ...(intentResult as object), intentResult, resolved: resolveRefResult },
    morphismIdsByName,
    algebraBindings,
    ak,
  )) as DispatchResult;
  return encoded.success
    ? { success: true, value: encoded }
    : { success: false, error: encoded.error ?? "Dispatch failed" };
}

export async function evaluateDispatchStage(
  name: string,
  input: unknown,
  morphismIdsByName: Map<string, string>,
  algebraBindings: Map<string, Function>,
  ak: AlgebraicKernel,
): Promise<unknown> {
  const morphismId = morphismIdsByName.get(name);
  if (!morphismId) throw new Error(`Unknown morphism ref: ${name}`);
  return evaluateNamedMorphism(ak.morphisms.resolve(morphismId), input, algebraBindings, ak);
}
