import type { KernelExpression } from "../../../L04-expression/evaluator.ts";
import type { ActionType, IntentProcessor, IntentStageCarrier } from "../../intent.ts";

export function checkPreconditions(
  carrier: IntentStageCarrier,
  context?: { $processor?: IntentProcessor },
): IntentStageCarrier {
  if (carrier.abort) return carrier;
  const action = carrier.action as ActionType;
  // Intent stage leaves read $processor from morphism dispatch context.
  const processor = context?.$processor;
  if (!processor) throw new Error("Intent stage missing $processor context");
  const initialState = action.targetMachine
    ? processor.kernel.stateMachines.resolve(action.targetMachine).initialState
    : undefined;
  const currentState = processor.stateStore.get(carrier.intent.targetKey) ?? initialState;
  for (const precondition of action.preconditions as KernelExpression[]) {
    const result = processor.kernel.evaluate(precondition, {
      $self: carrier.intent.payload,
      $state: currentState,
    });
    if (result.error || !result.value) {
      return {
        ...carrier,
        action,
        currentState,
        previousState: currentState,
        abort: { error: `precondition failed: ${action.name}` },
      };
    }
  }
  return { ...carrier, action, currentState, previousState: currentState };
}

export default checkPreconditions;
