import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { makePackageTmpDir } from "../../L01-foundation/tmp.ts";
import { AlgebraicKernel, type AlgebraicKernelOptions } from "../../L13-facade/index.ts";
import { createApiHost } from "./host.ts";

const tempDirs: string[] = [];
const hosts: Array<Awaited<ReturnType<typeof createApiHost>>> = [];
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

afterEach(async () => {
  while (hosts.length > 0) await hosts.pop()!.stop();
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { force: true, recursive: true });
});

describe("createApiHost", () => {
  test("boots and reports the configured Port primitive", async () => {
    const port = await freePort(),
      host = await boot(port);
    expect(host.servers[0]?.port).toBe(port);
  });

  test("GET requests return 200 ok through the placeholder pipeline", async () => {
    const port = await freePort(),
      host = await boot(port),
      response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("undeclared routes still return 200 ok while the placeholder is active", async () => {
    const port = await freePort(),
      host = await boot(port),
      response = await fetch(`http://127.0.0.1:${port}/no-route-here`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("stop with drain waits for in-flight requests before resolving", async () => {
    const port = await freePort(),
      host = await boot(port),
      gate = deferred<void>(),
      marks: string[] = [],
      kernel = (host as never).kernel as AlgebraicKernel | undefined;
    ((kernel ?? lastKernel)!.morphisms.evaluate as typeof lastKernel.morphisms.evaluate) =
      (async () => {
        marks.push("start");
        await gate.promise;
        marks.push("finish");
        return { status: 200, body: "slow" };
      }) as never;
    const requests = [
      fetch(`http://127.0.0.1:${port}/1`),
      fetch(`http://127.0.0.1:${port}/2`),
      fetch(`http://127.0.0.1:${port}/3`),
    ];
    while (marks.filter((mark) => mark === "start").length < 3) await Bun.sleep(5);
    const stop = host.stop({ drain: true }).then(() => marks.push("stopped"));
    await Bun.sleep(20);
    expect(marks).not.toContain("stopped");
    gate.resolve();
    await stop;
    await Promise.all(requests);
    expect(marks.slice(-1)[0]).toBe("stopped");
    expect(marks.filter((mark) => mark === "finish")).toHaveLength(3);
  });

  test("stop without drain closes immediately and rejects in-flight fetches", async () => {
    const port = await freePort(),
      host = await boot(port);
    lastKernel.morphisms.evaluate = (async () => {
      await Bun.sleep(200);
      return { status: 200, body: "late" };
    }) as never;
    const requests = [
      fetch(`http://127.0.0.1:${port}/a`),
      fetch(`http://127.0.0.1:${port}/b`),
      fetch(`http://127.0.0.1:${port}/c`),
    ];
    await Bun.sleep(20);
    await host.stop();
    const results = await Promise.allSettled(requests);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
  });

  test("host.ts stays within the 80 line cap", () => {
    expect(
      readFileSync(resolve(import.meta.dir, "host.ts"), "utf-8").split("\n").length,
    ).toBeLessThanOrEqual(80);
  });

  test("host.ts dispatches through the apiHostRequestPipeline morphism URI", async () => {
    const count = Number(
      (
        await Bun.$`grep -c "morphism://github.com/Stream44/s44-rak-gen1@1.0/apiHostRequestPipeline/1.0" ${resolve(import.meta.dir, "host.ts")}`.text()
      ).trim(),
    );
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

let lastKernel = AlgebraicKernel.create({} as AlgebraicKernelOptions);

async function boot(port: number) {
  lastKernel = AlgebraicKernel.create();
  const dir = makePackageTmpDir("api-host-");
  tempDirs.push(dir);
  const yamlPath = join(dir, "projection.yaml");
  writeFileSync(
    yamlPath,
    `projector: test-host\nversion: 1.0.0\nsession:\n  scope: test-host\nbindsModel: \"\"\nmorphism:\n  op: ref\n  asset: asset://adk.example/host.api/primitive/Port/1.0\n  props:\n    port: ${port}\n`,
  );
  const host = await createApiHost({ hostProjectorPath: yamlPath, kernel: lastKernel });
  hosts.push(host);
  return host;
}

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("Failed to allocate port"));
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
    server.on("error", reject);
  });
}
