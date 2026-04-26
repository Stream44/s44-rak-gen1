export enum ParityMode {
  Source = "source",
  Compiled = "compiled",
  Parity = "parity",
}

export class ParityMismatchError extends Error {
  readonly morphismId: string;
  readonly sourceValue: unknown;
  readonly compiledValue: unknown;
  readonly input: unknown;

  constructor(args: {
    morphismId: string;
    sourceValue: unknown;
    compiledValue: unknown;
    input: unknown;
  }) {
    super(`Parity mismatch for ${args.morphismId}`);
    this.name = "ParityMismatchError";
    this.morphismId = args.morphismId;
    this.sourceValue = args.sourceValue;
    this.compiledValue = args.compiledValue;
    this.input = args.input;
  }
}

export function runParity<T>(mode: ParityMode, fn: () => T): never {
  void mode;
  void fn;
  throw new Error("NOT_IMPLEMENTED: runParity");
}
