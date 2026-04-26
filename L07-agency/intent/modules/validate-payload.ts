import type {
  ActionType,
  Intent,
  IntentProcessor,
  IntentStageCarrier,
  IntentStageInput,
} from "../../intent.ts";

export function validatePayload(
  input: IntentStageInput,
  context?: { $processor?: IntentProcessor },
): IntentStageCarrier {
  // Intent stage leaves read $processor from morphism dispatch context.
  const processor = context?.$processor;
  if (!processor) throw new Error("Intent stage missing $processor context");
  const timestamp = new Date().toISOString();
  const { cid: intentId } = processor.encoder.encodeAndHash(input.payload);
  const { cid } = processor.encoder.encodeAndHash({
    actionId: input.action,
    payload: input.payload,
    target: input.target ?? null,
    capabilities: [],
  });
  const intent: Intent = {
    action: input.action,
    target: input.target,
    targetKey: input.targetKey,
    payload: input.payload,
    id: intentId,
    cid,
    timestamp,
    ...(input.issuer ? { issuer: input.issuer } : {}),
  };
  let action: ActionType;
  try {
    action = processor.resolveAction(intent.action);
  } catch {
    return {
      intent,
      action: input.action,
      currentState: undefined,
      previousState: undefined,
      abort: { error: `Unknown action: ${intent.action}` },
    };
  }
  const validation = processor.validator.validate(input.payload, action.inputSchema);
  if (!validation.valid) {
    return {
      intent,
      action,
      currentState: undefined,
      previousState: undefined,
      abort: { error: "validation failed" },
    };
  }
  return { intent, action, currentState: undefined, previousState: undefined };
}

export default validatePayload;
