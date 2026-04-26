import { rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUTHORIZE_CACHE_PATH,
  loadAuthorizeBundle,
  persistAuthorizeBundle,
  testAuthorizeInput,
} from "./bench.ts";
import { OpcodeKernelVm } from "./runtime/kernel-vm.ts";

async function child(mode: "cold" | "warm") {
  const t0 = performance.now();
  const bundle =
    mode === "warm"
      ? (loadAuthorizeBundle() ?? persistAuthorizeBundle())
      : persistAuthorizeBundle();
  await new OpcodeKernelVm({ bytecode: bundle }).run(bundle, testAuthorizeInput);
  console.log((performance.now() - t0).toFixed(2));
}

function once(mode: "cold" | "warm"): number {
  const proc = Bun.spawnSync({
    cmd: [
      Bun.which("bun") ?? "bun",
      resolve(import.meta.dir, "cold-start-bench.ts"),
      "child",
      mode,
    ],
    stderr: "inherit",
    stdout: "pipe",
  });
  if (proc.exitCode !== 0) throw new Error(`cold-start child failed (${mode})`);
  return Number(proc.stdout.toString().trim());
}

if (import.meta.main) {
  const [, , kind, mode] = process.argv;
  if (kind === "child" && (mode === "cold" || mode === "warm")) await child(mode);
  else {
    rmSync(AUTHORIZE_CACHE_PATH, { force: true });
    const coldMs = once("cold"),
      warmMs = once("warm");
    console.log(`cold-start: ${coldMs.toFixed(2)} ms`);
    console.log(`warm-start: ${warmMs.toFixed(2)} ms`);
    if (coldMs > 200 || warmMs > 20) process.exit(1);
  }
}
