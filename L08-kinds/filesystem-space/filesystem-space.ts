import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { KeyedValueStore } from "../storage-space/keyed-value.ts";

export interface FilesystemSpaceConfig {
  name: string;
  path: string;
  debounceMs?: number;
}

interface BlobEnvelope {
  "@context"?: string;
  "@type"?: "StorageBlob";
  "@savedAt"?: string;
  "@bindings"?: Record<string, { "@schemaVersion"?: string; "records": Record<string, unknown> }>;
  "@binding"?: string;
  "@schemaVersion"?: string;
  "records"?: Record<string, unknown>;
}

export function createFilesystemSpace(config: FilesystemSpaceConfig): KeyedValueStore {
  const perBinding = new Map<string, Map<string, unknown>>();
  const bindingMeta = new Map<string, { schemaVersion?: string }>();
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushNow = () => {
    const bindings: Record<
      string,
      { "@schemaVersion"?: string; "records": Record<string, unknown> }
    > = {};
    for (const [name, records] of perBinding) {
      bindings[name] = {
        ...(bindingMeta.get(name)?.schemaVersion
          ? { "@schemaVersion": bindingMeta.get(name)?.schemaVersion }
          : {}),
        records: Object.fromEntries(records),
      };
    }

    if (perBinding.size === 1) {
      const [[bindingName, records]] = [...perBinding.entries()];
      const compact: BlobEnvelope = {
        "@context": "https://github.com/Stream44/s44-rak-gen1@1.0/L08-kinds/filesystem-space/1.0",
        "@type": "StorageBlob",
        "@savedAt": new Date().toISOString(),
        "@binding": bindingName,
        ...(bindingMeta.get(bindingName)?.schemaVersion
          ? { "@schemaVersion": bindingMeta.get(bindingName)?.schemaVersion }
          : {}),
        "records": Object.fromEntries(records),
      };
      mkdirSync(dirname(config.path), { recursive: true });
      writeFileSync(config.path, JSON.stringify(compact, null, 2), "utf8");
      dirty = false;
      timer = null;
      return;
    }

    const envelope: BlobEnvelope = {
      "@context": "https://github.com/Stream44/s44-rak-gen1@1.0/L08-kinds/filesystem-space/1.0",
      "@type": "StorageBlob",
      "@savedAt": new Date().toISOString(),
      "@bindings": bindings,
    };

    mkdirSync(dirname(config.path), { recursive: true });
    writeFileSync(config.path, JSON.stringify(envelope, null, 2), "utf8");
    dirty = false;
    timer = null;
  };

  const scheduleFlush = () => {
    dirty = true;
    if ((config.debounceMs ?? 50) <= 0) {
      flushNow();
      return;
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(flushNow, config.debounceMs ?? 50);
  };

  const ensureBinding = (bindingName: string): Map<string, unknown> => {
    const existing = perBinding.get(bindingName);
    if (existing) return existing;
    const created = new Map<string, unknown>();
    perBinding.set(bindingName, created);
    return created;
  };

  return {
    async open(_config: Record<string, unknown> = {}) {
      perBinding.clear();
      bindingMeta.clear();
      if (!existsSync(config.path)) return;

      const raw = readFileSync(config.path, "utf8").trim();
      if (!raw) return;

      const envelope = JSON.parse(raw) as BlobEnvelope;
      if (envelope["@bindings"]) {
        for (const [name, binding] of Object.entries(envelope["@bindings"])) {
          perBinding.set(name, new Map(Object.entries(binding.records ?? {})));
          bindingMeta.set(name, { schemaVersion: binding["@schemaVersion"] });
        }
        return;
      }

      if (envelope["@binding"] && envelope.records) {
        perBinding.set(envelope["@binding"], new Map(Object.entries(envelope.records)));
        bindingMeta.set(envelope["@binding"], { schemaVersion: envelope["@schemaVersion"] });
        return;
      }

      if (envelope.records) perBinding.set("default", new Map(Object.entries(envelope.records)));
    },

    setBindingMeta(bindingName, meta) {
      bindingMeta.set(bindingName, { ...bindingMeta.get(bindingName), ...meta });
    },

    get(bindingName, key) {
      return perBinding.get(bindingName)?.get(key);
    },

    put(bindingName, key, value) {
      ensureBinding(bindingName).set(key, value);
      scheduleFlush();
    },

    delete(bindingName, key) {
      perBinding.get(bindingName)?.delete(key);
      scheduleFlush();
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

    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (dirty) flushNow();
    },

    async close() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (dirty) flushNow();
    },
  };
}
