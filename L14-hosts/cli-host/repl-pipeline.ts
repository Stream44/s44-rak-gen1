import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import {
  installPipeline,
  loadPipelineYaml,
  type PipelineTypeDef,
} from "../_shared/pipeline-registrar.ts";

const REPL = loadPipelineYaml(
  new URL(
    "../../L11-projection/morphisms/cli-repl-line-pipeline-placeholder.yaml",
    import.meta.url,
  ),
);

const LOGOUT = loadPipelineYaml(
  new URL("../../L11-projection/morphisms/logout-session-placeholder.yaml", import.meta.url),
);

const TYPES: PipelineTypeDef[] = [
  {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/cli-host/repl-context/1.0",
    name: "CliReplContext",
    version: "1.0",
    schema: {
      type: "object",
      properties: {
        line: { type: "string" },
        activeProjection: { type: ["string", "null"] },
        sessions: { type: "object" },
        projections: { type: "array" },
      },
      required: ["line", "sessions", "projections"],
      additionalProperties: true,
    },
  },
  {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/cli-host/repl-result/1.0",
    name: "CliReplResult",
    version: "1.0",
    schema: {
      type: "object",
      properties: {
        stdout: { type: "string" },
        stderr: { type: "string" },
        exitCode: { type: ["number", "null"] },
        newSessions: { type: "object" },
        activeProjectionChange: { type: "string" },
      },
      additionalProperties: true,
    },
  },
  {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/logout-session/input/1.0",
    name: "LogoutSessionInput",
    version: "1.0",
    schema: {
      type: "object",
      properties: {
        sessionId: { type: ["string", "null"] },
        scope: { type: ["string", "null"] },
      },
      additionalProperties: true,
    },
  },
  {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/logout-session/output/1.0",
    name: "LogoutSessionOutput",
    version: "1.0",
    schema: {
      type: "object",
      properties: { ok: { type: "boolean" } },
      additionalProperties: true,
    },
  },
];

export function ensureReplPipeline(kernel: AlgebraicKernel): void {
  installPipeline(kernel, TYPES, [REPL, LOGOUT]);
}
