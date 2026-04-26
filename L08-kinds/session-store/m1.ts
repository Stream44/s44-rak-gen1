import { MetaLevel, type TypeDef } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";
import "../../L02-metamodels/pluggable-interface.ts";

export interface SessionRecord {
  id: string;
  userId: string;
  scope: string;
  capabilities: Record<string, string>;
  ephemeral: Record<string, unknown>;
  createdAt: number;
  ttlSec?: number;
}
export interface SessionStoreInterface {
  create(user: { id: string; capabilities: Record<string, string> }, scope: string): string;
  get(id: string): SessionRecord | null;
  getByScope(userId: string, scope: string): SessionRecord | null;
  attach(id: string, caps: Record<string, string>, scopes?: string[]): void;
  detach(id: string, capNames: string[]): void;
  destroy(id: string): void;
  destroyByUserScope(userId: string, scope: string): void;
  list(userId?: string): SessionRecord[];
}

const rec = {
  type: "object",
  required: ["id", "userId", "scope", "capabilities", "ephemeral", "createdAt"],
  properties: {
    id: { type: "string" },
    userId: { type: "string" },
    scope: { type: "string" },
    capabilities: { type: "object", additionalProperties: { type: "string" } },
    ephemeral: { type: "object" },
    createdAt: { type: "number" },
    ttlSec: { type: "number" },
  },
} as const;
export const SESSION_STORE_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/session-store/1.0",
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/pluggable-interface/1.0",
  name: "SessionStoreInterface",
  version: "1.0",
  schema: {
    methods: [
      {
        name: "create",
        inputShape: {
          type: "object",
          required: ["user", "scope"],
          properties: {
            user: {
              type: "object",
              required: ["id", "capabilities"],
              properties: {
                id: { type: "string" },
                capabilities: { type: "object", additionalProperties: { type: "string" } },
              },
            },
            scope: { type: "string" },
          },
        },
        outputShape: {
          type: "object",
          required: ["sessionId"],
          properties: { sessionId: { type: "string" } },
        },
      },
      {
        name: "get",
        inputShape: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        outputShape: {
          type: ["object", "null"],
          required: rec.required,
          properties: rec.properties,
        },
      },
      {
        name: "getByScope",
        inputShape: {
          type: "object",
          required: ["userId", "scope"],
          properties: { userId: { type: "string" }, scope: { type: "string" } },
        },
        outputShape: {
          type: ["object", "null"],
          required: rec.required,
          properties: rec.properties,
        },
      },
      {
        name: "attach",
        inputShape: {
          type: "object",
          required: ["id", "caps"],
          properties: {
            id: { type: "string" },
            caps: { type: "object", additionalProperties: { type: "string" } },
            scopes: { type: "array", items: { type: "string" } },
          },
        },
        outputShape: { type: "void" },
      },
      {
        name: "detach",
        inputShape: {
          type: "object",
          required: ["id", "capNames"],
          properties: {
            id: { type: "string" },
            capNames: { type: "array", items: { type: "string" } },
          },
        },
        outputShape: { type: "void" },
      },
      {
        name: "destroy",
        inputShape: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        outputShape: { type: "void" },
      },
      {
        name: "destroyByUserScope",
        inputShape: {
          type: "object",
          required: ["userId", "scope"],
          properties: { userId: { type: "string" }, scope: { type: "string" } },
        },
        outputShape: { type: "void" },
      },
      {
        name: "list",
        inputShape: { type: "object", properties: { userId: { type: "string" } } },
        outputShape: { type: "array", items: rec },
      },
    ],
    implModuleRef: "module://./memory-session-store.ts",
    bootstrapHookName: "registerSessionStore",
  },
};

export function validateSessionStoreM1(doc: unknown): asserts doc is typeof SESSION_STORE_M1 {
  const fail = (message: string): never => {
    throw new Error(`${SESSION_STORE_M1.id}: ${message}`);
  };
  if (!doc || typeof doc !== "object") fail("document must be an object");
  const candidate = doc as TypeDef;
  if (!Array.isArray(candidate.schema?.methods)) fail("missing methods");
  if (
    typeof candidate.schema.implModuleRef !== "string" ||
    !candidate.schema.implModuleRef.startsWith("module://")
  )
    fail("invalid implModuleRef");
  if (
    typeof candidate.schema.bootstrapHookName !== "string" ||
    candidate.schema.bootstrapHookName.length === 0
  )
    fail("invalid bootstrapHookName");
  for (const method of candidate.schema.methods as unknown[])
    if (
      !method ||
      typeof method !== "object" ||
      typeof (method as Record<string, unknown>).name !== "string" ||
      !(method as Record<string, unknown>).inputShape ||
      !(method as Record<string, unknown>).outputShape
    )
      fail("invalid method entry");
}

registerBootstrapType(SESSION_STORE_M1);
