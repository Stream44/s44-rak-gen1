import { diff, diffToString } from "../../L13-facade/diff.ts";
import { type CommandContext } from "./shared.ts";

export async function runDiff({ rawArgs }: CommandContext): Promise<number> {
  const [aCid, bCid, ...rest] = rawArgs;
  if (!aCid || !bCid) {
    throw new Error("usage: rak diff <aCid> <bCid> [--format json|text]");
  }
  const format = rest.includes("--format")
    ? (rest[rest.indexOf("--format") + 1] ?? "text")
    : "text";
  const ops = diff({ cid: aCid }, { cid: bCid });
  console.log(format === "json" ? JSON.stringify(ops, null, 2) : diffToString(ops));
  return 0;
}
