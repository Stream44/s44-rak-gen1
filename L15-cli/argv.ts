export type RakFlags = {
  help: boolean;
  version: boolean;
  command?: string;
  args: string[];
};

export function parseArgv(argv: string[]): RakFlags {
  const flags: RakFlags = {
    help: false,
    version: false,
    args: [],
  };

  for (const token of argv) {
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }

    if (token === "--version" || token === "-v") {
      flags.version = true;
      continue;
    }

    if (!flags.command) {
      flags.command = token;
      continue;
    }

    flags.args.push(token);
  }

  return flags;
}
