import { RAK_VERSION } from "../L13-facade/index.ts";
import { runBench } from "./commands/bench.ts";
import { runBoot } from "./commands/boot.ts";
import { runDemo } from "./commands/demo.ts";
import { runDiff } from "./commands/diff.ts";
import { runExport } from "./commands/export.ts";
import { runServe } from "./commands/serve.ts";
import type { CommandSpec } from "./commands/shared.ts";

export const COMMANDS: Record<string, CommandSpec> = {
  boot: {
    usage: "rak boot [--root <dir>]",
    description: "Find sds.yaml, load the node root, and exit 0.",
    run: runBoot,
  },
  serve: {
    usage: "rak serve [--port <N>]",
    description: "Boot a discovered example or ad-hoc viewer.",
    run: runServe,
  },
  demo: {
    usage: "rak demo <example-name|hosts>",
    description: "Run a discovered example demo or the tri-host demo.",
    run: runDemo,
  },
  export: {
    usage: "rak export <example-name> [--out <dir>]",
    description: "Run an example-provided export task.",
    run: runExport,
  },
  diff: {
    usage: "rak diff <aCid> <bCid> [--format json|text]",
    description: "Diff two CID references through the facade diff formatter.",
    run: runDiff,
  },
  bench: {
    usage: "rak bench",
    description: "Re-run the compiler benchmarks.",
    run: runBench,
  },
};

export function renderHelp(): string {
  return [
    `rak ${RAK_VERSION}`,
    "",
    "Usage:",
    "  rak <command> [options]",
    "",
    "Commands:",
    ...Object.values(COMMANDS).map(
      (command) => `  ${command.usage.padEnd(40)} ${command.description}`,
    ),
    "",
    "Flags:",
    "  --help, -h     Show help",
    "  --version, -v  Show version",
  ].join("\n");
}
