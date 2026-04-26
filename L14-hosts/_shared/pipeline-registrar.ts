import { readFileSync } from "node:fs";
import { MetaLevel } from "../../L13-facade/index.ts";
import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import { registerMorphismDocument } from "../../L02-metamodels/morphism-document-adapter.ts";

const RECORD_TYPE = "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";

export interface PipelineTypeDef {
  id: string;
  name: string;
  version: string;
  schema: Record<string, unknown>;
}

export type PipelineDocument = { schema: { morphisms: Record<string, unknown> } } & Record<
  string,
  unknown
>;

export function loadPipelineYaml(url: URL): PipelineDocument {
  return Bun.YAML.parse(readFileSync(url, "utf-8")) as PipelineDocument;
}

export function registerPipelineTypes(kernel: AlgebraicKernel, types: PipelineTypeDef[]): void {
  for (const type of types) {
    try {
      kernel.resolveType(type.id);
    } catch {
      kernel.defineType({
        ...type,
        level: MetaLevel.Model,
        conformsTo: RECORD_TYPE,
      } as never);
    }
  }
}

export function registerPipelineMorphisms(
  kernel: AlgebraicKernel,
  pipeline: PipelineDocument,
): void {
  registerMorphismDocument(
    {
      ...pipeline,
      schema: pipeline.schema,
      morphisms: pipeline.schema.morphisms as never,
    } as never,
    kernel,
  );
}

export function installPipeline(
  kernel: AlgebraicKernel,
  types: PipelineTypeDef[],
  pipelines: PipelineDocument[],
): void {
  registerPipelineTypes(kernel, types);
  for (const pipeline of pipelines) registerPipelineMorphisms(kernel, pipeline);
}
