/**
 * Layer 0: Utilities — canonicalize, CID, TypeURI parsing, $typeRef extraction.
 */

import type { JsonSchema, TypeRef } from "./types.ts";

/**
 * Produce a deterministic canonical JSON string (sorted keys recursively, no whitespace).
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
  return "{" + parts.join(",") + "}";
}

/**
 * Check if a string is a content identifier (CID).
 */
export function isContentId(ref: string): boolean {
  return ref.startsWith("cid:sha256:");
}

/**
 * Check if a string is a type URI ("type://...").
 */
export function isTypeUri(ref: string): boolean {
  return ref.startsWith("type://");
}

/**
 * Parse a type URI into { origin, name, version }. Returns null if malformed.
 * Format: "type://<origin>/<name>/<version>"
 * Example: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0" →
 * { origin: "github.com/Stream44/s44-rak-gen1@1.0", name: "meta", version: "1.0" }
 */
export function parseTypeUri(
  uri: string,
): { origin: string; name: string; version: string } | null {
  if (!isTypeUri(uri)) return null;
  const path = uri.slice("type://".length);
  const versionedOriginRe = /^([^/]+(?:\/[^/]+)*?\/[^/]+@\d+(?:\.\d+)*)\//;
  const versionedMatch = versionedOriginRe.exec(path);
  let origin: string;
  let rest: string;
  if (versionedMatch) {
    origin = versionedMatch[1];
    rest = path.slice(versionedMatch[0].length);
  } else {
    const firstSlash = path.indexOf("/");
    if (firstSlash === -1) return null;
    origin = path.slice(0, firstSlash);
    rest = path.slice(firstSlash + 1);
  }
  const lastSlash = rest.lastIndexOf("/");
  if (lastSlash === -1) return null;
  const name = rest.slice(0, lastSlash);
  const version = rest.slice(lastSlash + 1);
  if (!origin || !name || !version) return null;
  return { origin, name, version };
}

/**
 * Build a type URI from origin, name and version.
 * Example: buildTypeUri("github.com/Stream44/s44-rak-gen1@1.0", "meta", "1.0")
 * → "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0"
 */
export function buildTypeUri(origin: string, name: string, version: string): TypeRef {
  return `type://${origin}/${name}/${version}`;
}

/** The origin for all ADK bootstrap types. */
export const ADK_ORIGIN = "github.com/Stream44/s44-rak-gen1@1.0";

/**
 * Extract all $typeRef targets from a JSON Schema recursively.
 */
export function extractTypeRefs(schema: JsonSchema): TypeRef[] {
  const refs: TypeRef[] = [];

  function walk(s: JsonSchema) {
    if (!s || typeof s !== "object") return;
    if (s.$typeRef) refs.push(s.$typeRef);
    if (s.properties) {
      for (const prop of Object.values(s.properties)) {
        walk(prop as JsonSchema);
      }
    }
    if (s.items && typeof s.items === "object" && !Array.isArray(s.items)) {
      walk(s.items);
    }
    if (s.allOf) s.allOf.forEach(walk);
    if (s.anyOf) s.anyOf.forEach(walk);
    if (s.oneOf) s.oneOf.forEach(walk);
    if (s.not) walk(s.not);
    if (s.additionalProperties && typeof s.additionalProperties === "object") {
      walk(s.additionalProperties as JsonSchema);
    }
  }

  walk(schema);
  return refs;
}

/**
 * Compute the set difference of two schemas' required fields.
 */
export function requiredDiff(
  oldSchema: JsonSchema,
  newSchema: JsonSchema,
): { added: string[]; removed: string[] } {
  const oldRequired = new Set(oldSchema.required ?? []);
  const newRequired = new Set(newSchema.required ?? []);
  const added = [...newRequired].filter((r) => !oldRequired.has(r));
  const removed = [...oldRequired].filter((r) => !newRequired.has(r));
  return { added, removed };
}
