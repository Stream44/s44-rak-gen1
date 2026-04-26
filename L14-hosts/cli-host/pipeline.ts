import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import {
  installPipeline,
  loadPipelineYaml,
  type PipelineTypeDef,
} from "../_shared/pipeline-registrar.ts";

const PIPELINE = loadPipelineYaml(
  new URL(
    "../../L11-projection/morphisms/cli-host-request-pipeline-placeholder.yaml",
    import.meta.url,
  ),
);

const TYPES: PipelineTypeDef[] = [
  {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/cli-host/request-context/1.0",
    name: "CliHostRequestContext",
    version: "1.0",
    schema: {
      type: "object",
      properties: {
        argv: { type: "array" },
        projections: { type: "array" },
        declaredScopes: { type: "array", items: { type: "string" } },
        sessionId: { type: "string" },
        jwt: { type: "string" },
      },
      required: ["argv", "projections", "declaredScopes"],
      additionalProperties: true,
    },
  },
  {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/cli-host/run-result/1.0",
    name: "CliRunResult",
    version: "1.0",
    schema: {
      type: "object",
      properties: {
        stdout: { type: "string" },
        stderr: { type: "string" },
        exitCode: { type: "number" },
      },
      required: ["stdout", "stderr", "exitCode"],
      additionalProperties: true,
    },
  },
];

export function ensureCliHostPipeline(kernel: AlgebraicKernel): void {
  installPipeline(kernel, TYPES, [PIPELINE]);
}
