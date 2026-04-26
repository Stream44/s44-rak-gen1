import { extractTraces } from "../trace-extract.ts";
import type { Trace, Step } from "../acceptance-types.ts";

export default function extractTracesMorphism(input: { rootStep: Step; budget?: number }): Trace[] {
  return extractTraces(input.rootStep, input.budget ? { maxCycleDepth: input.budget } : {});
}
