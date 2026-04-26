/**
 * Parity-harness scaffold.
 *
 * This file is scaffolding only. No test cases live here.
 * A future parity battery can run a corpus of inputs through
 * both the compatibility kernel and the meta-circular
 * `27B-projection/ProjectionKernelRuntime`, asserting identical outputs.
 */

export interface ProjectionKernelLike<Input, Output> {
  dispatch(input: Input): Promise<Output> | Output;
}

export interface ParityCase<Input, Output> {
  name: string;
  input: Input;
  assert: (a: Output, b: Output) => void;
}

export interface ParityReport<Input, Output> {
  passed: number;
  failed: Array<ParityCase<Input, Output>>;
  details: string[];
}

export async function runParity<I, O>(
  kernelA: ProjectionKernelLike<I, O>,
  kernelB: ProjectionKernelLike<I, O>,
  cases: ParityCase<I, O>[],
): Promise<ParityReport<I, O>> {
  const failed: Array<ParityCase<I, O>> = [];
  const details: string[] = [];
  let passed = 0;

  for (const c of cases) {
    let a: O | undefined;
    let b: O | undefined;
    let threwA = false;
    let threwB = false;
    let errA: unknown;
    let errB: unknown;

    try {
      a = await kernelA.dispatch(c.input);
    } catch (error) {
      threwA = true;
      errA = error;
    }

    try {
      b = await kernelB.dispatch(c.input);
    } catch (error) {
      threwB = true;
      errB = error;
    }

    if (threwA !== threwB) {
      failed.push(c);
      details.push(
        `${c.name}: throw mismatch - A ${threwA ? "threw" : "did not throw"}, B ${threwB ? "threw" : "did not throw"}${threwA ? ` (A err: ${errorMessage(errA)})` : ""}${threwB ? ` (B err: ${errorMessage(errB)})` : ""}`,
      );
      continue;
    }

    if (threwA && threwB) {
      passed++;
      details.push(`${c.name}: both threw (A: ${errorMessage(errA)}, B: ${errorMessage(errB)})`);
      continue;
    }

    try {
      c.assert(a as O, b as O);
      passed++;
    } catch (error) {
      failed.push(c);
      details.push(
        `${c.name}: assertion failed (A: ${formatValue(a)}, B: ${formatValue(b)}): ${errorMessage(error)}`,
      );
    }
  }

  return { passed, failed, details };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
