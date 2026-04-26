import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type CommandContext = {
  rawArgs: string[];
};

export type CommandHandler = (ctx: CommandContext) => Promise<number>;

export type CommandSpec = {
  usage: string;
  description: string;
  run: CommandHandler;
};

type SdsDocument = {
  name?: unknown;
  version?: unknown;
  origin?: unknown;
};

export function parseFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

export function requireFlag(args: string[], name: string): string {
  const value = parseFlag(args, name);
  if (!value || value.startsWith("--")) {
    throw new Error(`missing value for ${name}`);
  }
  return value;
}

export function resolveSdsRoot(startDir: string): string {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(resolve(current, "sds.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`could not find sds.yaml from ${startDir}`);
    }
    current = parent;
  }
}

export async function loadSdsDocument(rootDir: string): Promise<SdsDocument> {
  const yaml = await Bun.file(resolve(rootDir, "sds.yaml")).text();
  return (Bun.YAML.parse(yaml) ?? {}) as SdsDocument;
}

export function assertRootSds(doc: SdsDocument): asserts doc is {
  name: string;
  version: string;
  origin: string;
} {
  for (const key of ["name", "version", "origin"] as const) {
    if (typeof doc[key] !== "string" || doc[key].length === 0) {
      throw new Error(`sds.yaml missing required string field: ${key}`);
    }
  }
}
