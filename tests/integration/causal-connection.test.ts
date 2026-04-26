import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { AlgebraicKernel, AssetRegistry } from "../../L13-facade/index.ts";
import { withPackageTmpDir } from "../../L01-foundation/tmp.ts";
import { createApiHost } from "../../L14-hosts/api-host/host.ts";

const ROOT = resolve(import.meta.dir, "../..");

describe("causal connection integration", () => {
  test("projection alias swap moves alice to bob without restarting the api-host", async () => {
    await withPackageTmpDir("auth-host-", async (tempDir) => {
      const h = await bootAuthHarness(tempDir, "alice");
      try {
        const bodyA = await postJson(`http://127.0.0.1:${h.port}/auth?test_user=alice`);
        expect(bodyA.labels.user).toBe("alice");
        h.registry.register({
          cid: h.variantB.cid,
          id: "projection://adk.example/demo-auth/latest/1.0",
          name: "demo-auth",
          assetKind: "projection",
          implementation: { kind: "value", value: h.variantB },
          instance: h.variantB,
        } as never);
        const bodyB = await postJson(`http://127.0.0.1:${h.port}/auth?test_user=alice`);
        expect(bodyB.labels.user).toBe("bob");
        expect(h.bootCount).toBe(1);
      } finally {
        await h.stop();
      }
    });
  });
});

async function bootAuthHarness(tempDir: string, initialUser: "alice" | "bob") {
  const port = await freePort(),
    registry = new AssetRegistry(),
    variantA = { cid: "cid-a", labels: { user: initialUser } },
    variantB = { cid: "cid-b", labels: { user: "bob" } },
    kernel = AlgebraicKernel.create(),
    base = kernel.morphisms.evaluate.bind(kernel.morphisms),
    bootCount = 1;
  registry.register({
    cid: variantA.cid,
    id: "projection://adk.example/demo-auth/latest/1.0",
    name: "demo-auth",
    assetKind: "projection",
    implementation: { kind: "value", value: variantA },
    instance: variantA,
  } as never);
  kernel.morphisms.evaluate = (async (id, input) =>
    id === "morphism://github.com/Stream44/s44-rak-gen1@1.0/apiHostRequestPipeline/1.0"
      ? (() => {
          const projection = registry.resolve("projection://adk.example/demo-auth/latest/1.0")
            ?.instance as { cid: string; labels: { user: string } } | undefined;
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ labels: projection?.labels, projectionCid: projection?.cid }),
          };
        })()
      : base(id, input)) as never;
  writeFileSync(
    resolve(tempDir, "api-host.yaml"),
    readFileSync(resolve(ROOT, "L14-hosts/api-host/projection.yaml"), "utf-8").replaceAll(
      "port: 3100",
      `port: ${port}`,
    ),
  );
  const apiHost = await createApiHost({
    hostProjectorPath: resolve(tempDir, "api-host.yaml"),
    kernel,
  });
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await apiHost.stop({ drain: true });
  };
  return { apiHost, port, variantB, registry, bootCount, stop };
}

async function postJson(url: string) {
  return await fetch(url, { method: "POST" }).then((response) => response.json() as Promise<any>);
}

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("Failed to allocate port"));
      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
    server.on("error", reject);
  });
}
