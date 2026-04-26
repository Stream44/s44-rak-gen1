/**
 * Structural deep-equality over JSON-shaped data (primitives, plain
 * objects, arrays). Uses Object.is so NaN/NaN matches and ±0 differ
 * (SameValue semantics). Does NOT handle Map/Set/Date/typed arrays/
 * class instances. Centralized per PP-27 DC8 (was duplicated at
 * L01-validator, L05-registry, L10-acceptance).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((entry, index) => deepEqual(entry, b[index]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]),
  );
}
