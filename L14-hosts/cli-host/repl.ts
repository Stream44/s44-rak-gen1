import { createInterface } from "node:readline/promises";
import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";
import type { CliHostHandle, CliHostProjectionBinding } from "./host.ts";
import { ensureReplPipeline } from "./repl-pipeline.ts";
import {
  applyReplResult,
  evaluateReplLine,
  handleColonCommand,
  type ReplState,
} from "./repl-commands.ts";

export const REPL_LINE_MORPHISM =
  "morphism://github.com/Stream44/s44-rak-gen1@1.0/cliReplLinePipeline/1.0";
export const LOGOUT_MORPHISM = "morphism://github.com/Stream44/s44-rak-gen1@1.0/logoutSession/1.0";

type HostState = CliHostHandle & {
  kernel: AlgebraicKernel;
  projections: Array<CliHostProjectionBinding & { projection: ProjectionModel }>;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  error?: NodeJS.WritableStream;
};

export interface ReplOptions {
  sessions?: Record<string, string>;
}

export async function runRepl(host: CliHostHandle, opts: ReplOptions = {}): Promise<number> {
  const h = host as HostState;
  const sessions: Map<string, string> = new Map(Object.entries(opts.sessions ?? {}));
  const state: ReplState = {
    kernel: h.kernel,
    projections: h.projections,
    sessions,
    output: h.output ?? process.stdout,
    error: h.error ?? process.stderr,
    activeProjection: h.projections[0]?.name ?? null,
  };
  const rl = createInterface({ input: h.input ?? process.stdin, output: state.output });
  ensureReplPipeline(state.kernel);
  state.output.write("adk repl — :help for commands\n");
  try {
    for await (const line of rl) {
      const cmd = await handleColonCommand(state, line);
      if (cmd?.exitCode !== undefined) return cmd.exitCode;
      if (cmd) continue;
      const exitCode = applyReplResult(state, await evaluateReplLine(state, line));
      if (exitCode !== null) return exitCode;
    }
  } finally {
    rl.close();
  }
  return 0;
}
