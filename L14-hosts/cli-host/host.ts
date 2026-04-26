import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import { createMetaProjectionKernel } from "../../L11-projection/bootstrap.ts";
import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";
import { ensureCliHostPipeline } from "./pipeline.ts";

const REQUEST_PIPELINE_MORPHISM =
  "morphism://github.com/Stream44/s44-rak-gen1@1.0/cliHostRequestPipeline/1.0";

export interface CliHostProjectionBinding {
  name: string;
  projectorPath: string;
  bindsModelPath?: string;
}
export interface CliHostOptions {
  projections: CliHostProjectionBinding[];
  kernel: AlgebraicKernel;
}
export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
export interface CliHostHandle {
  run(argv: string[], opts?: { sessionId?: string; jwt?: string }): Promise<CliRunResult>;
  stop(): Promise<void>;
}

export async function createCliHost(opts: CliHostOptions): Promise<CliHostHandle> {
  ensureCliHostPipeline(opts.kernel);
  const projector = await createMetaProjectionKernel(null, {
    kernel: opts.kernel,
    yamlPath: new URL("../../L00-model/kernel.model.yaml", import.meta.url).pathname,
  });
  const projections = opts.projections.map((binding) => ({
    ...binding,
    projection: projector.loadYamlFile(binding.projectorPath) as ProjectionModel,
  }));
  return {
    kernel: opts.kernel,
    projections,
    async run(argv, next) {
      try {
        return (await opts.kernel.morphisms.evaluate(
          REQUEST_PIPELINE_MORPHISM,
          {
            argv,
            projections,
            declaredScopes: projections.flatMap((p) =>
              Array.isArray(p.projection.session.scope)
                ? p.projection.session.scope
                : [p.projection.session.scope],
            ),
            sessionId: next?.sessionId,
            jwt: next?.jwt,
          },
          { store: null, jwtVerifier: null },
        )) as CliRunResult;
      } catch (error) {
        return {
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        };
      }
    },
    async stop() {},
  } as CliHostHandle;
}
