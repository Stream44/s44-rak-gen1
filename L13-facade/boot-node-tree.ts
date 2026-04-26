import { AlgebraicKernel } from "./kernel.ts";

export async function bootNodeTree(opts: {
  startPath?: string;
  yamlPath?: string;
  compiledKernelMode?: "source" | "compiled" | "parity";
}): Promise<{ kernel: AlgebraicKernel; nodeRoot: null }> {
  void opts;
  throw new Error("bootNodeTree: not implemented yet");
}
