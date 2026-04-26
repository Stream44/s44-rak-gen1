import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import type { SchemaValidator } from "../../L01-foundation/validator.ts";
import type { DispatchResult } from "../dispatch.ts";
import type { ProjectionSession } from "../session.ts";

export default async function submitIntent(input: {
  resolved?: any;
  app?: ModelBoot | null;
  session?: ProjectionSession;
  validator?: SchemaValidator;
  [key: string]: unknown;
}): Promise<DispatchResult> {
  const resolved = input.resolved ?? input;
  const frame = resolved.frame ?? {};
  const actionRef = frame.actionRef ?? frame.ref;
  const payload = frame.payload;
  if (resolved.kind === "custom") {
    const result =
      resolved.payloadSchema && payload
        ? input.validator!.validate(payload, resolved.payloadSchema)
        : { valid: true, errors: [] };
    return result.valid
      ? { kind: "custom", success: true, name: resolved.name, payload }
      : {
          kind: "custom",
          success: false,
          name: resolved.name,
          error: `Payload validation failed: ${result.errors.map((entry) => entry.message).join("; ")}`,
        };
  }
  if (resolved.kind === "ephemeral") {
    input.session!.ephemeral.set(resolved.name, payload);
    return { kind: "ephemeral", success: true, name: resolved.name, payload };
  }
  if (!resolved.action)
    return {
      kind: "error",
      success: false,
      error: `Manifest entry "${actionRef}" has no resolved ActionType.`,
    };
  if (!input.app)
    return {
      kind: "error",
      success: false,
      error: `Cannot dispatch model action "${actionRef}": projector has no ModelBoot.`,
    };
  const modelPayload = payload ?? {};
  const result = input.validator!.validate(modelPayload, resolved.action.inputSchema);
  if (!result.valid)
    return {
      kind: "model",
      success: false,
      error: `Payload validation failed: ${result.errors.map((entry) => entry.message).join("; ")}`,
    };
  const capabilityId =
    frame.capabilityId ?? input.session!.currentUser.capabilities[resolved.action.verb];
  const target = frame.target ?? (modelPayload.id as string) ?? resolved.action.targetMachine;
  const intentResult = await input.app.submit(
    resolved.action.verb,
    target,
    modelPayload,
    capabilityId,
  );
  return { kind: "model", success: intentResult.success, intentResult, error: intentResult.error };
}
