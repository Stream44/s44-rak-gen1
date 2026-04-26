import { resolveMacrosInStep } from "../macro-resolve.ts";
import type { Step } from "../acceptance-types.ts";

export default function resolveMacrosInStepMorphism(input: {
  step: Step;
  lastCreatedKey?: string | null;
}): Step {
  return resolveMacrosInStep(input.step, input.lastCreatedKey ?? null);
}
