import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createViewer, type ViewerProjectionConfig } from "../../L14-hosts/viewer/viewer.ts";
import {
  listExampleDescriptions,
  resolveExampleConfig,
  resolveSdsConfig,
} from "./example-registry.ts";
import { parseFlag, type CommandContext } from "./shared.ts";

const PACKAGE_DIR = resolve(import.meta.dir, "../..");

function resolveSds(arg: string): string {
  const candidates = [resolve(arg, "sds.yaml"), resolve(PACKAGE_DIR, arg, "sds.yaml")];
  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}

export async function runServe({ rawArgs }: CommandContext): Promise<number> {
  const sdsDir = readFlag(rawArgs, "--sds");
  const exampleName = readFlag(rawArgs, "--example");
  const projector = readFlag(rawArgs, "--projector");
  const config = sdsDir
    ? await resolveSdsConfig(resolveSds(sdsDir), { mount: readFlag(rawArgs, "--mount") ?? "/" })
    : exampleName
      ? await resolveExampleConfig(exampleName, { projector, root: PACKAGE_DIR })
      : buildAdHocConfig(rawArgs);
  if (!config) {
    await printUsage();
    return exampleName ? 2 : 0;
  }
  const viewer = await createViewer({ port: readPort(rawArgs), projections: [config] });
  console.log(`rak serve listening: http://localhost:${viewer.server.port}/`);
  await waitForSigint(async () => viewer.stop({ drain: true }));
  return 0;
}

function buildAdHocConfig(rawArgs: string[]): ViewerProjectionConfig | undefined {
  const projectionPath = firstPositional(rawArgs);
  if (!projectionPath) return undefined;
  return {
    mount: readFlag(rawArgs, "--mount") ?? "/",
    projectorPath: projectionPath,
    modelPaths: readFlag(rawArgs, "--models")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function firstPositional(args: string[]): string | undefined {
  const flags = new Set(["--example", "--mount", "--models", "--port", "--projector", "--sds"]);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (flags.has(value)) {
      index += 1;
      continue;
    }
    if (!value.startsWith("--")) return value;
  }
  return undefined;
}

async function printUsage(): Promise<void> {
  const examples = await listExampleDescriptions(PACKAGE_DIR);
  console.log("Usage:");
  console.log("  rak serve <projection.yaml> [--port N] [--models a.yaml,b.yaml] [--mount /]");
  console.log("  rak serve --sds <sds-dir> [--port N] [--mount /]");
  console.log("  rak serve --example <name> [--projector <subpath>] [--port N]");
  console.log("");
  console.log("Registered examples:");
  for (const example of examples) {
    console.log(`  ${example.name.padEnd(21, " ")} ${example.description}`.trimEnd());
  }
  if (examples.length === 0) console.log("(none)");
  console.log("");
  console.log("See packages/04-ReflexiveAlgebraicKernel/examples/README.md for details.");
}

function readFlag(args: string[], name: string): string | undefined {
  const value = parseFlag(args, name);
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function readPort(args: string[]): number {
  const value = readFlag(args, "--port");
  return value ? Number.parseInt(value, 10) : 0;
}

function waitForSigint(stop: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const onSigint = () => {
      process.off("SIGINT", onSigint);
      void stop().finally(resolve);
    };
    process.on("SIGINT", onSigint);
  });
}
