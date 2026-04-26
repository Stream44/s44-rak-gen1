export type PassName =
  | "normalize"
  | "inline"
  | "fold"
  | "specialise"
  | "allocate"
  | "lower"
  | "emit";

export interface CompilerOptions {
  stopAfter?: PassName;
  passes?: PassName[];
  dumpDir?: string;
  strict?: boolean;
}

export interface ResolvedCompilerOptions {
  stopAfter?: PassName;
  passes: PassName[];
  dumpDir?: string;
  strict: boolean;
}

export const DEFAULT_PASSES: PassName[] = [
  "normalize",
  "inline",
  "fold",
  "specialise",
  "allocate",
  "lower",
  "emit",
];

export const DEFAULT_COMPILER_OPTIONS: ResolvedCompilerOptions = {
  stopAfter: undefined,
  passes: DEFAULT_PASSES,
  dumpDir: undefined,
  strict: true,
};

export function resolveCompilerOptions(options: CompilerOptions = {}): ResolvedCompilerOptions {
  return {
    stopAfter: options.stopAfter,
    passes: options.passes ?? DEFAULT_COMPILER_OPTIONS.passes,
    dumpDir: options.dumpDir,
    strict: options.strict ?? DEFAULT_COMPILER_OPTIONS.strict,
  };
}
