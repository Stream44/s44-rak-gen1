export default function normalizeDispatchFrame(
  frame: {
    ref?: string;
    actionRef?: string;
    target?: string;
    payload?: Record<string, unknown>;
    capabilityId?: string;
  },
  hasDispatchAction: boolean,
  hasDirectActionRef: boolean,
): {
  actionRef: string;
  target?: string;
  payload?: Record<string, unknown>;
  capabilityId?: string;
} | null {
  if (typeof frame.actionRef === "string")
    return frame as {
      actionRef: string;
      target?: string;
      payload?: Record<string, unknown>;
      capabilityId?: string;
    };
  if (
    hasDispatchAction &&
    !hasDirectActionRef &&
    typeof frame.ref === "string" &&
    frame.ref !== "Dispatch"
  )
    return {
      actionRef: frame.ref,
      target: frame.target,
      payload: frame.payload,
      capabilityId: frame.capabilityId,
    };
  return null;
}
