import { resolve } from "node:path";
import { listExportDescriptions, runExampleExport } from "./example-registry.ts";
import type { CommandContext } from "./shared.ts";

export async function runExport({ rawArgs }: CommandContext): Promise<number> {
  const name = firstPositional(rawArgs);
  const root = resolve(import.meta.dir, "../..");
  if (!name) {
    const available = await listExportDescriptions(root);
    console.log("Usage: rak export <example-name> [--out <dir>]");
    console.log("");
    console.log("Export-capable examples:");
    for (const entry of available) {
      console.log(`  ${entry.name.padEnd(21, " ")} ${entry.description}`.trimEnd());
    }
    if (available.length === 0) console.log("(none)");
    return 0;
  }
  return runExampleExport(name, rawArgs, root);
}

function firstPositional(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.startsWith("--")) {
      index += 1;
      continue;
    }
    return value;
  }
  return undefined;
}
