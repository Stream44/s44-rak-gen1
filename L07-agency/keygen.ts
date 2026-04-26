import { randomUUID } from "node:crypto";
import type { KeyStrategy } from "../L01-foundation/action-type.ts";

const strategies: Record<KeyStrategy, (payload: Record<string, unknown>) => string> = {
  uuid: () => randomUUID(),
  nanoid: () => Math.random().toString(36).slice(2, 14),
  timestamp: () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  explicit: (payload) => {
    const key = payload.id ?? payload.key;
    if (!key) throw new Error("keyStrategy=explicit requires payload.id or payload.key");
    return String(key);
  },
};

export const generateKey = (
  strategy: KeyStrategy = "uuid",
  payload: Record<string, unknown> = {},
) => strategies[strategy](payload);
