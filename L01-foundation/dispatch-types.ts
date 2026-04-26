// PP-27: confirmed L01 home — pure shape contract; consumers L07-L14.
import type { ActionType } from "./action-type.ts";
import type { JsonSchema } from "./types.ts";

export interface ResolvedManifestEntry {
  name: string;
  kind: "model" | "custom" | "ephemeral";
  action?: ActionType;
  payloadSchema?: JsonSchema;
}

export interface ResolvedManifest {
  byName: Map<string, ResolvedManifestEntry>;
  byUri: Map<string, ResolvedManifestEntry>;
}

export interface DispatchFrame {
  actionRef: string;
  target?: string;
  payload?: Record<string, unknown>;
  capabilityId?: string;
  origin?: { kind: string; source?: unknown };
}

export interface DispatchResult {
  kind: "custom" | "ephemeral" | "model" | "error";
  success: boolean;
  intentResult?: { newState?: unknown };
  error?: string;
  name?: string;
  payload?: Record<string, unknown>;
}
