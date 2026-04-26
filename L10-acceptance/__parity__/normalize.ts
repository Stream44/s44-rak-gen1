import type { SuiteResult } from "../acceptance.ts";

/**
 * Parity normalizer. Current SuiteResult payloads do not surface
 * issued capability IDs, so the CAP-ID tolerance is intentionally a no-op.
 */
type Jsonish = null | boolean | number | string | Jsonish[] | { [key: string]: Jsonish };

const normalizeAnything = (value: unknown): Jsonish => {
  if (Array.isArray(value)) return value.map(normalizeAnything);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalizeAnything(entry)]),
    ) as Jsonish;
  }
  return value as Jsonish;
};

export function normalize(result: SuiteResult): SuiteResult {
  return {
    ...(normalizeAnything(result) as unknown as SuiteResult),
    timestamp: "<TIMESTAMP>",
  };
}

export const deepEqualShape = (a: unknown, b: unknown): boolean =>
  JSON.stringify(normalizeAnything(a)) === JSON.stringify(normalizeAnything(b));
