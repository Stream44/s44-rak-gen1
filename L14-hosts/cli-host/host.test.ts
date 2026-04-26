import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makePackageTmpDir } from "../../L01-foundation/tmp.ts";
import { AlgebraicKernel } from "../../L13-facade/index.ts";
import { createCliHost } from "./host.ts";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { force: true, recursive: true });
});

describe("createCliHost", () => {
  test("returns a handle with run after validating projections", async () => {
    const host = await boot();
    expect(typeof host.run).toBe("function");
  });

  test("run(['greet']) returns placeholder output", async () => {
    expect(await (await boot()).run(["greet"])).toEqual({ stdout: "ok", stderr: "", exitCode: 0 });
  });

  test("run([]) returns placeholder output without argv decode", async () => {
    expect(await (await boot()).run([])).toEqual({ stdout: "ok", stderr: "", exitCode: 0 });
  });

  test("threads sessionId and jwt through morphism evaluate", async () => {
    const kernel = AlgebraicKernel.create(),
      calls: unknown[] = [],
      host = await boot(kernel);
    kernel.morphisms.evaluate = (async (id, input, context) => (
      calls.push({ id, input, context }),
      { stdout: "ok", stderr: "", exitCode: 0 }
    )) as never;
    await host.run(["anything"], { sessionId: "s-1", jwt: "jwt-tok" });
    expect(calls[0]).toMatchObject({
      id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/cliHostRequestPipeline/1.0",
      input: expect.objectContaining({ sessionId: "s-1", jwt: "jwt-tok" }),
      context: { store: null, jwtVerifier: null },
    });
  });
});

async function boot(kernel = AlgebraicKernel.create()) {
  const dir = makePackageTmpDir("cli-host-");
  tempDirs.push(dir);
  const yamlPath = join(dir, "projection.yaml");
  writeFileSync(yamlPath, projectionYaml("catalogue", "catalogue-read"));
  return createCliHost({
    kernel,
    projections: [{ name: "catalogue", projectorPath: yamlPath, bindsModelPath: "" }],
  });
}

function projectionYaml(name: string, scope: string) {
  return `projector: ${name}\nversion: 1.0.0\nsession:\n  scope: ${scope}\nbindsModel: ""\npages:\n  index:\n    children: []\n`;
}

test("host.ts stays within 80 lines and references the pipeline URI", async () => {
  expect(
    readFileSync(resolve(import.meta.dir, "host.ts"), "utf-8").split("\n").length,
  ).toBeLessThanOrEqual(80);
  expect(
    Number(
      (
        await Bun.$`grep -c "morphism://github.com/Stream44/s44-rak-gen1@1.0/cliHostRequestPipeline/1.0" ${resolve(import.meta.dir, "host.ts")}`.text()
      ).trim(),
    ),
  ).toBeGreaterThanOrEqual(1);
});
