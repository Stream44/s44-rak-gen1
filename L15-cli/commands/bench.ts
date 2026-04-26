import { printTable, runBenchmarks } from "../../L12-compiler/bench.ts";
import { type CommandContext } from "./shared.ts";

export async function runBench(_ctx: CommandContext): Promise<number> {
  const results = await runBenchmarks();
  printTable(results);
  return results.some((result) => result.speedup < 16) ? 1 : 0;
}
