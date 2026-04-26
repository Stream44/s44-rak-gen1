import type { IntentProcessor, IntentStageCarrier } from "../../intent.ts";

export function authorizeCapability(
  carrier: IntentStageCarrier,
  _context?: { $processor?: IntentProcessor },
): IntentStageCarrier {
  // TODO: wire Layer-24 authorize. Today 23-intent.ts has no authorize call; this stage exists structurally in the 4-stage compose pipeline.
  return carrier.abort ? carrier : carrier;
}

export default authorizeCapability;
