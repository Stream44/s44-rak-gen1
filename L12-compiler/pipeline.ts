import { resolveCompilerOptions, type CompilerOptions } from "./options";

export interface Pipeline {
  run(ast: unknown): unknown;
}

export function createPipeline(options: CompilerOptions = {}): Pipeline {
  const _options = resolveCompilerOptions(options);
  return { run: (ast) => ast };
}
