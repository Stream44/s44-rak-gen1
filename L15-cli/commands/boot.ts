import { resolve } from "node:path";
import {
  assertRootSds,
  loadSdsDocument,
  parseFlag,
  resolveSdsRoot,
  type CommandContext,
} from "./shared.ts";

export async function runBoot({ rawArgs }: CommandContext): Promise<number> {
  const requestedRoot = parseFlag(rawArgs, "--root");
  const startDir = requestedRoot ? resolve(requestedRoot) : process.cwd();
  const rootDir = requestedRoot ? startDir : resolveSdsRoot(startDir);
  const doc = await loadSdsDocument(rootDir);
  assertRootSds(doc);
  console.log(`rak boot ready: ${doc.name}@${doc.version} (${doc.origin})`);
  console.log(rootDir);
  return 0;
}
