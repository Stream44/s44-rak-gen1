import { test } from "bun:test";
import { resolve } from "node:path";

test("verify-observatory.sh exits 0", { timeout: 300000 }, () => {
  const script = resolve(import.meta.dir, "../../tests/verify-observatory.sh");
  const cwd = resolve(import.meta.dir, "../..");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = Bun.spawnSync({
      cmd: ["bash", script],
      cwd,
      env: { ...process.env, ADK_OBSERVATORY_VERIFY_CHILD: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode === 0) return;
    if (attempt === 1) {
      const stdout = new TextDecoder().decode(result.stdout);
      const stderr = new TextDecoder().decode(result.stderr);
      throw new Error(
        `verify-observatory.sh failed with exit ${result.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      );
    }
  }
});
