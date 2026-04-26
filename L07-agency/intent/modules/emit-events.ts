import { ADK_ORIGIN } from "../../../L01-foundation/utils.ts";
import type { TransitionResult } from "../../../L06-process/engine.ts";
import type {
  ActionType,
  EmittedEvent,
  IntentProcessor,
  IntentResult,
  IntentStageCarrier,
} from "../../intent.ts";

export async function emitEvents(
  carrier: IntentStageCarrier,
  context?: { $processor?: IntentProcessor },
): Promise<IntentResult> {
  // Intent stage leaves read $processor from morphism dispatch context.
  const processor = context?.$processor;
  if (!processor) throw new Error("Intent stage missing $processor context");
  if (carrier.abort)
    return {
      success: false,
      intent: carrier.intent,
      previousState: carrier.previousState,
      emittedEvents: [],
      error: carrier.abort.error,
    };
  const action = carrier.action as ActionType;
  const currentState = carrier.currentState ?? processor.stateStore.get(carrier.intent.targetKey);
  const previousState = currentState;
  let newState: unknown;
  if (action.targetMachine) {
    const machine = processor.kernel.stateMachines.resolve(action.targetMachine);
    const steppedFrom = currentState ?? machine.initialState;
    const stepResult = (await processor.ak.morphisms.evaluate("morphism://adk/step/1.0", {
      machine,
      currentState: steppedFrom,
      event: { verb: action.verb },
    })) as TransitionResult;
    if (stepResult.success === false)
      return {
        success: false,
        intent: carrier.intent,
        previousState: steppedFrom,
        emittedEvents: [],
        error: stepResult.error,
      };
    newState = stepResult.newState;
  } else if (
    action.kind === "mutate" &&
    currentState &&
    typeof currentState === "object" &&
    carrier.intent.payload &&
    typeof carrier.intent.payload === "object"
  ) {
    newState = {
      ...(currentState as Record<string, unknown>),
      ...(carrier.intent.payload as Record<string, unknown>),
    };
  } else {
    newState = carrier.intent.payload;
  }
  processor.stateStore.set(carrier.intent.targetKey, newState);
  const eventData = { previousState, newState, payload: carrier.intent.payload };
  const { cid: eventCid } = processor.encoder.encodeAndHash(eventData);
  const event: EmittedEvent = {
    id: eventCid,
    kind: "submitted",
    entity: action.entity,
    targetMachine: action.targetMachine,
    verb: action.verb,
    type: `event://${action.origin ?? ADK_ORIGIN}/${action.name}/1.0`,
    source: action.targetMachine,
    targetKey: carrier.intent.targetKey,
    beforeState: previousState,
    afterState: newState,
    payload: carrier.intent.payload,
    at: carrier.intent.timestamp,
    causationKey: carrier.intent.id,
    data: eventData,
    causedBy: carrier.intent.id,
    timestamp: carrier.intent.timestamp,
  };
  processor.emitEvent(event);
  return { success: true, intent: carrier.intent, previousState, newState, emittedEvents: [event] };
}

export default emitEvents;
