import type { CapabilityEngine } from "../../L07-agency/capability.ts";

/**
 * Morphism-leaf wrapper around Layer 24's CapabilityEngine.authorizeResource
 * (spec 01 §18.11 read-path overload). Replaces the prior synthetic-read-intent
 * adapter.
 *
 * The CapabilityEngine is read from a module-scoped slot populated by the
 * bootstrap layer via wire-verify-one-engine.ts.
 */
let engineSlot: CapabilityEngine | undefined;

export function __setEngine(engine: CapabilityEngine | undefined): void {
  engineSlot = engine;
}

export default function verifyOne(input: {
  capId?: string;
  resourceUri: string;
  subject: string;
}): boolean {
  if (!input.capId) return false;
  if (!engineSlot)
    throw new Error("verify-one: CapabilityEngine not wired; bootstrap must call __setEngine");
  return engineSlot.authorizeResource(input.capId, input.resourceUri, { id: input.subject })
    .authorized;
}
