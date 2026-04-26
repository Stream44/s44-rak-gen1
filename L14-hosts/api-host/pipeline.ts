import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import {
  installPipeline,
  loadPipelineYaml,
  type PipelineTypeDef,
} from "../_shared/pipeline-registrar.ts";

const PIPELINE = loadPipelineYaml(
  new URL(
    "../../L11-projection/morphisms/api-host-request-pipeline-placeholder.yaml",
    import.meta.url,
  ),
);

const TYPES: PipelineTypeDef[] = [
  {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/api-host/request-context/1.0",
    name: "ApiHostRequestContext",
    version: "1.0",
    schema: {
      type: "object",
      properties: {
        request: { type: "object" },
        hostProjection: { type: "object" },
        declaredScopes: { type: "array", items: { type: "string" } },
      },
      required: ["request", "hostProjection", "declaredScopes"],
      additionalProperties: true,
    },
  },
  {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/api-host/response-frame/1.0",
    name: "ApiHostResponseFrame",
    version: "1.0",
    schema: {
      type: "object",
      properties: { status: { type: "number" }, headers: { type: "object" }, body: {} },
      required: ["status"],
      additionalProperties: true,
    },
  },
];

export function ensureApiHostPipeline(kernel: AlgebraicKernel): void {
  installPipeline(kernel, TYPES, [PIPELINE]);
}
