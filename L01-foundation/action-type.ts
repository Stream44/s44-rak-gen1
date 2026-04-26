// PP-27: confirmed L01 home — pure shape contract; consumers L07-L14.
import type { JsonSchema } from "./types.ts";

export type ActionKind = "mutate" | "create" | "remove" | "batch" | "custom";
export type KeyStrategy = "uuid" | "nanoid" | "timestamp" | "explicit";

export interface BatchSubmitDef {
  verb: string;
  target: string;
  payload?: Record<string, unknown>;
}

export interface ActionType {
  id: string;
  cid?: string;
  name: string;
  version: string;
  verb: string;
  inputSchema: JsonSchema;
  targetMachine: string;
  entity?: string;
  preconditions: unknown[];
  kind?: ActionKind;
  targetField?: string;
  keyField?: string;
  keyStrategy?: KeyStrategy;
  defaults?: Record<string, unknown>;
  selector?: unknown;
  submit?: BatchSubmitDef;
  origin?: string;
}
