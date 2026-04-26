import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { makePackageTmpDir } from "../../L01-foundation/tmp.ts";
import { createApiHost } from "../../L14-hosts/api-host/host.ts";
import { createCliHost } from "../../L14-hosts/cli-host/host.ts";
import { runRepl } from "../../L14-hosts/cli-host/repl.ts";
import { createViewer } from "../../L14-hosts/viewer/viewer.ts";
import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import { AlgebraicKernel, AssetRegistry } from "../../L13-facade/index.ts";
import MemorySessionStore from "../../L08-kinds/session-store/memory-session-store.ts";
import HS256JwtVerifier from "../../L08-kinds/jwt-verifier/hs256-jwt-verifier.ts";
import { listExampleNames, resolveExampleConfig } from "./example-registry.ts";
import type { CommandContext } from "./shared.ts";

const USAGE = "Usage: rak demo <example-name|hosts>";
const HOST_DEMO_RECORDS = [
  {
    id: "ord-001",
    state: {
      customer: "cust-001",
      total: 39.97,
      items: [
        { sku: "W-001", quantity: 2, unitPrice: 9.99 },
        { sku: "G-001", quantity: 1, unitPrice: 19.99 },
      ],
      status: "pending",
    },
  },
  {
    id: "ord-002",
    state: {
      customer: "cust-002",
      total: 99.99,
      items: [{ sku: "P-001", quantity: 1, unitPrice: 99.99 }],
      status: "pending",
    },
  },
] as const;

export async function runDemo({ rawArgs }: CommandContext): Promise<number> {
  const kind = rawArgs[0];
  if (!kind) {
    const available = (await listExampleNames(resolve(import.meta.dir, "../.."))).join(", ");
    console.log(`Available examples: ${available || "(none discovered)"}`);
    console.log(USAGE);
    return 0;
  }
  if (kind === "hosts") return runHosts();
  const config = await resolveExampleConfig(kind, { root: resolve(import.meta.dir, "../..") });
  if (!config) {
    console.error(`unknown demo: ${kind}`);
    console.log(USAGE);
    return 2;
  }
  const viewer = await createViewer({
    port: Number(process.env.PORT ?? 3200),
    projections: [config],
  });
  console.log(`demo ready: http://localhost:${viewer.server.port}/`);
  await waitForSigint(() => void viewer.stop({ drain: true }));
  return 0;
}

async function runHosts(): Promise<number> {
  const dir = import.meta.dir;
  const store = new MemorySessionStore();
  const registry = new AssetRegistry();
  const kernel = AlgebraicKernel.create();
  const verifier = new HS256JwtVerifier({
    keyLoader: async () => ({
      keyBytes: Uint8Array.from(Buffer.from("tri-host-demo-secret")).buffer,
    }),
  });
  const orders = new Map<string, string>(
    HOST_DEMO_RECORDS.map((record) => [record.id, record.state.status]),
  );
  const base = kernel.morphisms.evaluate.bind(kernel.morphisms);
  const caps = (raw = "") =>
    Object.fromEntries(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value, "allow"]),
    );

  registry.register({
    cid: "demo:session-store",
    id: "asset://adk.example/session-store/MemorySessionStore/1.0",
    name: "MemorySessionStore",
    assetKind: "session-store",
    implementation: { kind: "module", module: "./memory-session-store.ts" },
    instance: store,
  } as never);
  registry.register({
    cid: "demo:jwt-verifier",
    id: "asset://adk.example/jwt-verifier/MemoryHS256JwtVerifier/1.0",
    name: "MemoryHS256JwtVerifier",
    assetKind: "jwt-verifier",
    implementation: { kind: "module", module: "./hs256-jwt-verifier.ts" },
    instance: verifier,
  } as never);

  kernel.morphisms.evaluate = (async (id: string, input: unknown) => {
    if (id === "morphism://github.com/Stream44/s44-rak-gen1@1.0/apiHostRequestPipeline/1.0") {
      const { request } = input as { request: Request };
      const url = new URL(request.url);
      const sessionId = request.headers.get("X-Session-Id") ?? request.headers.get("X-Session");
      const orderId = url.pathname.match(/^\/v1\/orders\/([^/]+)\/confirm$/)?.[1];
      const record = sessionId ? store.get(sessionId) : null;
      if (request.method === "POST" && url.pathname === "/auth") {
        const user = url.searchParams.get("test_user") ?? "alice";
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "bound",
            sessionId: store.create(
              { id: user, capabilities: caps(url.searchParams.get("test_caps") ?? "confirm,pay") },
              "auth-primary",
            ),
            scope: "auth-primary",
            labels: { user },
            registryRefs: registry.list().map((asset) => asset.id),
          }),
        };
      }
      if (request.method === "POST" && orderId && record?.capabilities.confirm) {
        orders.set(orderId, "confirmed");
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: orderId, status: orders.get(orderId), via: "api" }),
        };
      }
      return {
        status: 403,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "forbidden" }),
      };
    }
    if (id === "morphism://github.com/Stream44/s44-rak-gen1@1.0/cliHostRequestPipeline/1.0") {
      const { argv, sessionId } = input as { argv: string[]; sessionId?: string };
      const orderId = argv[2];
      const record = sessionId ? store.get(sessionId) : null;
      if (argv.join(" ") === "orders confirm ord-001" && orderId && record?.capabilities.confirm)
        return { stdout: `confirmed ${orderId}`, stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "forbidden", exitCode: 1 };
    }
    if (id === "morphism://github.com/Stream44/s44-rak-gen1@1.0/cliReplLinePipeline/1.0") {
      const { line, sessions } = input as { line: string; sessions: Record<string, string> };
      return kernel.morphisms.evaluate(
        "morphism://github.com/Stream44/s44-rak-gen1@1.0/cliHostRequestPipeline/1.0",
        { argv: line.trim().split(/\s+/), sessionId: Object.values(sessions)[0] },
      );
    }
    if (id === "morphism://github.com/Stream44/s44-rak-gen1@1.0/logoutSession/1.0") {
      const { sessionId } = input as { sessionId?: string };
      if (sessionId) store.destroy(sessionId);
      return { ok: true };
    }
    return base(id, input);
  }) as never;

  const modelPaths = [
    resolve(dir, "../../tests/kernel-fixtures/core.model.yaml"),
    resolve(dir, "../../tests/kernel-fixtures/commerce.model.yaml"),
  ];
  const seed = (app: ModelBoot) => {
    for (const record of HOST_DEMO_RECORDS) app.setState(record.id, record.state);
  };
  const tempDir = makePackageTmpDir("hosts-demo-");
  writeFileSync(
    resolve(tempDir, "orders-cli.yaml"),
    'projector: orders-cli\nversion: 1.0.0\nconformsTo: adk:Projection/1.0\nconformsToKind: kind://adk/cli.stdout/1.0\nsession:\n  scope: auth-primary\nbindsModel: ""\npages:\n  index:\n    children: []\n',
  );
  const viewer = await createViewer({
    port: 3000,
    projections: [
      {
        mount: "/",
        projectorPath: resolve(dir, "../../tests/kernel-fixtures/projections/dashboard.yaml"),
        modelPaths,
        seedFn: seed,
      },
    ],
  });
  const apiHost = await createApiHost({
    hostProjectorPath: resolve(dir, "../../L14-hosts/api-host/projection.yaml"),
    kernel,
  });
  const cliHost = await createCliHost({
    kernel,
    projections: [
      { name: "orders", projectorPath: resolve(tempDir, "orders-cli.yaml"), bindsModelPath: "" },
    ],
  });
  const cleanupTempDir = () => rmSync(tempDir, { force: true, recursive: true });
  const stopHosts = () =>
    Promise.all([viewer.stop({ drain: true }), apiHost.stop({ drain: true }), cliHost.stop()]);
  console.log("viewer http://localhost:3000");
  console.log("api-host http://localhost:3100");
  console.log("cli-host repl ready");
  void waitForSigint(async () => {
    await stopHosts();
    cleanupTempDir();
    process.exit(0);
  });
  await runRepl(cliHost);
  await stopHosts();
  cleanupTempDir();
  return 0;
}

function waitForSigint(stop: () => Promise<void> | void): Promise<void> {
  return new Promise((resolve) => {
    const onSigint = () => {
      process.off("SIGINT", onSigint);
      Promise.resolve(stop()).finally(resolve);
    };
    process.on("SIGINT", onSigint);
  });
}
