#!/usr/bin/env bun

import { parseArgv } from "../L15-cli/argv.ts";
import { COMMANDS, renderHelp } from "../L15-cli/commands.ts";
import { RAK_VERSION } from "../L13-facade/index.ts";

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const flags = parseArgv(argv);
  if (flags.help) {
    console.log(renderHelp());
    return 0;
  }
  if (flags.version) {
    console.log(`rak ${RAK_VERSION}`);
    return 0;
  }
  const commandName = flags.command ?? "boot";
  const command = COMMANDS[commandName];
  if (!command) {
    console.error(`unknown command: ${flags.command}`);
    console.error("");
    console.error(renderHelp());
    return 5;
  }
  return command.run({ rawArgs: flags.args });
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
