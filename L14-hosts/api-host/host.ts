import { AlgebraicKernel } from "../../L13-facade/index.ts";
import { createMetaProjectionKernel } from "../../L11-projection/bootstrap.ts";
import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";
import { ensureApiHostPipeline } from "./pipeline.ts";
import { portsOf } from "./ports.ts";

const REQUEST_PIPELINE_MORPHISM =
  "morphism://github.com/Stream44/s44-rak-gen1@1.0/apiHostRequestPipeline/1.0";

export interface ApiHostOptions {
  hostProjectorPath: string;
  kernel: AlgebraicKernel;
}
export interface ApiHostHandle {
  servers: Array<{ port: number; hostname: string; stop: () => Promise<void> }>;
  stop(opts?: { drain?: boolean }): Promise<void>;
}

export async function createApiHost(opts: ApiHostOptions): Promise<ApiHostHandle> {
  ensureApiHostPipeline(opts.kernel);
  const projector = await createMetaProjectionKernel(null, {
    kernel: opts.kernel,
    yamlPath: new URL("../../L00-model/kernel.model.yaml", import.meta.url).pathname,
  });
  const hostProjection = projector.loadYamlFile(opts.hostProjectorPath) as ProjectionModel;
  const declaredScopes = Array.isArray(hostProjection.session.scope)
    ? hostProjection.session.scope
    : [hostProjection.session.scope];
  const inflight = new Set<Promise<Response>>();
  const ports = portsOf(hostProjection);
  if (ports.length !== 1) throw new Error(`Expected exactly one Port in ${opts.hostProjectorPath}`);
  const servers = ports.map((port) =>
    Bun.serve({
      port,
      hostname: "0.0.0.0",
      fetch(request) {
        const p = (async () => {
          try {
            const frame = (await opts.kernel.morphisms.evaluate(
              REQUEST_PIPELINE_MORPHISM,
              { request, hostProjection, declaredScopes },
              { store: null, jwtVerifier: null },
            )) as { status: number; headers?: HeadersInit; body?: BodyInit | null };
            return new Response(frame.body, { status: frame.status, headers: frame.headers });
          } catch {
            return new Response("internal error", { status: 500 });
          }
        })();
        inflight.add(p);
        void p.finally(() => inflight.delete(p));
        return p;
      },
    }),
  );
  return {
    servers: servers.map((server) => ({
      port: Number(server.port ?? ports[0]),
      hostname: "0.0.0.0",
      stop: async () => {
        server.stop(true);
      },
    })),
    async stop(next) {
      if (next?.drain) {
        await Promise.all([...inflight]);
        for (const server of servers) server.stop(false);
        return;
      }
      for (const server of servers) server.stop(true);
    },
  };
}
