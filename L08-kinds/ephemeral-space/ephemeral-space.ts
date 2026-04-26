import type { KeyedValueStore } from "../storage-space/keyed-value.ts";

export interface EphemeralSpaceConfig {
  name: string;
}

export function createEphemeralSpace(_config: EphemeralSpaceConfig): KeyedValueStore {
  const perBinding = new Map<string, Map<string, unknown>>();

  const ensureBinding = (bindingName: string): Map<string, unknown> => {
    const existing = perBinding.get(bindingName);
    if (existing) return existing;
    const created = new Map<string, unknown>();
    perBinding.set(bindingName, created);
    return created;
  };

  return {
    async open(_openConfig: Record<string, unknown> = {}) {},

    get(bindingName, key) {
      return perBinding.get(bindingName)?.get(key);
    },

    put(bindingName, key, value) {
      ensureBinding(bindingName).set(key, value);
    },

    delete(bindingName, key) {
      perBinding.get(bindingName)?.delete(key);
    },

    has(bindingName, key) {
      return perBinding.get(bindingName)?.has(key) ?? false;
    },

    snapshot(bindingName) {
      return Object.fromEntries(perBinding.get(bindingName) ?? new Map<string, unknown>());
    },

    hydrate(bindingName, records) {
      perBinding.set(bindingName, new Map(Object.entries(records)));
    },

    async flush() {},

    async close() {},
  };
}
