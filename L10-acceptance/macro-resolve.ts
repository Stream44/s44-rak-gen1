import type { Assertion, Step } from "./acceptance-types.ts";

export function resolveMacrosInStep(step: Step, lastCreatedKey: string | null): Step {
  const resolveMacro = <T>(value: T, fallbackKey?: string): T => {
    if (value === "$lastCreated") {
      if (lastCreatedKey) return lastCreatedKey as T;
      if (fallbackKey) return fallbackKey as T;
      throw new Error(`Macro "$lastCreated" used before any create-like step established it.`);
    }
    if (Array.isArray(value)) return value.map((entry) => resolveMacro(entry, fallbackKey)) as T;
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          resolveMacro(entry, fallbackKey),
        ]),
      ) as T;
    }
    return value;
  };
  const assertions = step.assertions.map((assertion): Assertion => {
    switch (assertion.kind) {
      case "state":
        return { ...assertion, key: resolveMacro(assertion.key, step.targetKey) };
      case "state-equals":
      case "state-field-match":
      case "event-emitted":
        return { ...assertion, targetKey: resolveMacro(assertion.targetKey, step.targetKey) };
      default:
        return assertion;
    }
  });
  return {
    ...step,
    targetKey: resolveMacro(step.targetKey),
    payload: resolveMacro(step.payload),
    assertions,
  };
}
