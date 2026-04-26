import type { JsonSchema } from "../../L01-foundation/types.ts";

export type SlotId = string;
export interface SlotDescriptor {
  id: SlotId;
  path: string;
  kind: "text" | "attr" | "html";
  attrName?: string;
}
export interface Row {
  key: string;
  html: string;
  slots?: SlotDescriptor[];
}
export interface CtxScopeDescriptor {
  scopePath: string;
  scope: string;
  initial?: Record<string, unknown>;
  mirror?: string[];
  key?: unknown;
}
export type ServerFrame =
  | {
      type: "skeleton";
      version: number;
      html: string;
      slots: SlotDescriptor[];
      ctxScopes?: CtxScopeDescriptor[];
    }
  | { type: "patch"; version: number; updates: Array<{ slotId: SlotId; value: unknown }> }
  | {
      type: "list";
      version: number;
      slotId: SlotId;
      op: "append" | "prepend" | "replace" | "remove" | "move" | "before" | "after";
      rows: Row[];
      key?: string;
      fromKey?: string;
      toKey?: string;
    }
  | { type: "event"; kind: string; payload: unknown }
  | { type: "effect"; adapter: string; op: string; args: unknown }
  | { type: "error"; message: string; slotId?: SlotId };
export type ClientFrame =
  | { type: "action"; ref: string; target?: string | null; payload?: unknown; ctxPath?: string }
  | { type: "custom"; name: string; payload?: unknown; ctxPath?: string }
  | { type: "ui-set"; ctxPath: string; path: string; value: unknown }
  | { type: "ack"; seen: number };

const OBJ = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const slot = (x: unknown): x is SlotDescriptor =>
  OBJ(x) &&
  typeof x.id === "string" &&
  typeof x.path === "string" &&
  (x.kind === "text" || x.kind === "attr" || x.kind === "html") &&
  (x.attrName === undefined || typeof x.attrName === "string");
const row = (x: unknown): x is Row =>
  OBJ(x) &&
  typeof x.key === "string" &&
  typeof x.html === "string" &&
  (x.slots === undefined || (Array.isArray(x.slots) && x.slots.every(slot)));
const ctxScope = (x: unknown): x is CtxScopeDescriptor =>
  OBJ(x) &&
  typeof x.scopePath === "string" &&
  typeof x.scope === "string" &&
  (x.mirror === undefined ||
    (Array.isArray(x.mirror) && x.mirror.every((value) => typeof value === "string")));

export function isServerFrame(x: unknown): x is ServerFrame {
  if (!OBJ(x) || typeof x.type !== "string") return false;
  switch (x.type) {
    case "skeleton":
      return (
        typeof x.version === "number" &&
        typeof x.html === "string" &&
        Array.isArray(x.slots) &&
        x.slots.every(slot) &&
        (x.ctxScopes === undefined || (Array.isArray(x.ctxScopes) && x.ctxScopes.every(ctxScope)))
      );
    case "patch":
      return (
        typeof x.version === "number" &&
        Array.isArray(x.updates) &&
        x.updates.every((u) => OBJ(u) && typeof u.slotId === "string")
      );
    case "list":
      return (
        typeof x.version === "number" &&
        typeof x.slotId === "string" &&
        ["append", "prepend", "replace", "remove", "move", "before", "after"].includes(
          x.op as string,
        ) &&
        Array.isArray(x.rows) &&
        x.rows.every(row) &&
        (x.key === undefined || typeof x.key === "string") &&
        (x.fromKey === undefined || typeof x.fromKey === "string") &&
        (x.toKey === undefined || typeof x.toKey === "string")
      );
    case "event":
      return typeof x.kind === "string";
    case "effect":
      return typeof x.adapter === "string" && typeof x.op === "string";
    case "error":
      return (
        typeof x.message === "string" && (x.slotId === undefined || typeof x.slotId === "string")
      );
    default:
      return false;
  }
}

export function isClientFrame(x: unknown): x is ClientFrame {
  if (!OBJ(x) || typeof x.type !== "string") return false;
  switch (x.type) {
    case "action":
      return (
        typeof x.ref === "string" &&
        (x.target === undefined || x.target === null || typeof x.target === "string") &&
        (x.ctxPath === undefined || typeof x.ctxPath === "string")
      );
    case "custom":
      return (
        typeof x.name === "string" && (x.ctxPath === undefined || typeof x.ctxPath === "string")
      );
    case "ui-set":
      return typeof x.ctxPath === "string" && typeof x.path === "string";
    case "ack":
      return typeof x.seen === "number";
    default:
      return false;
  }
}

const SLOT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["id", "path", "kind"],
  properties: {
    id: { type: "string" },
    path: { type: "string" },
    kind: { enum: ["text", "attr", "html"] },
    attrName: { type: "string" },
  },
  additionalProperties: false,
};
const ROW_SCHEMA: JsonSchema = {
  type: "object",
  required: ["key", "html"],
  properties: {
    key: { type: "string" },
    html: { type: "string" },
    slots: { type: "array", items: SLOT_SCHEMA },
  },
  additionalProperties: false,
};

export const SERVER_FRAME_SCHEMA: JsonSchema = {
  oneOf: [
    {
      type: "object",
      required: ["type", "version", "html", "slots"],
      properties: {
        type: { const: "skeleton" },
        version: { type: "number" },
        html: { type: "string" },
        slots: { type: "array", items: SLOT_SCHEMA },
        ctxScopes: {
          type: "array",
          items: {
            type: "object",
            required: ["scopePath", "scope"],
            properties: {
              scopePath: { type: "string" },
              scope: { type: "string" },
              initial: { type: "object" },
              mirror: { type: "array", items: { type: "string" } },
              key: {},
            },
            additionalProperties: true,
          },
        },
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "version", "updates"],
      properties: {
        type: { const: "patch" },
        version: { type: "number" },
        updates: {
          type: "array",
          items: {
            type: "object",
            required: ["slotId", "value"],
            properties: { slotId: { type: "string" }, value: {} },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "version", "slotId", "op", "rows"],
      properties: {
        type: { const: "list" },
        version: { type: "number" },
        slotId: { type: "string" },
        op: { enum: ["append", "prepend", "replace", "remove", "move", "before", "after"] },
        rows: { type: "array", items: ROW_SCHEMA },
        key: { type: "string" },
        fromKey: { type: "string" },
        toKey: { type: "string" },
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "kind", "payload"],
      properties: { type: { const: "event" }, kind: { type: "string" }, payload: {} },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "adapter", "op", "args"],
      properties: {
        type: { const: "effect" },
        adapter: { type: "string" },
        op: { type: "string" },
        args: {},
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "message"],
      properties: {
        type: { const: "error" },
        message: { type: "string" },
        slotId: { type: "string" },
      },
      additionalProperties: false,
    },
  ],
};

export const CLIENT_FRAME_SCHEMA: JsonSchema = {
  oneOf: [
    {
      type: "object",
      required: ["type", "ref"],
      properties: {
        type: { const: "action" },
        ref: { type: "string" },
        target: { type: ["string", "null"] },
        payload: {},
        ctxPath: { type: "string" },
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "name"],
      properties: {
        type: { const: "custom" },
        name: { type: "string" },
        payload: {},
        ctxPath: { type: "string" },
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "ctxPath", "path", "value"],
      properties: {
        type: { const: "ui-set" },
        ctxPath: { type: "string" },
        path: { type: "string" },
        value: {},
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "seen"],
      properties: { type: { const: "ack" }, seen: { type: "number" } },
      additionalProperties: false,
    },
  ],
};
