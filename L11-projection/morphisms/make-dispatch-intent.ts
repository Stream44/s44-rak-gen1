import type { ActionType, Intent } from "../../L13-facade/index.ts";

export default function makeDispatchIntent(
  action: ActionType,
  frame: { payload?: Record<string, unknown>; target?: string },
): Intent {
  return {
    id: `dispatch:${action.name}`,
    action: action.id,
    target: action.targetMachine,
    targetKey: frame.target ?? action.targetMachine,
    payload: frame.payload ?? {},
    timestamp: new Date(0).toISOString(),
  };
}
