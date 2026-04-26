import { readFileSync } from "node:fs";
import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import { registerBootstrapType } from "../L03-tower/bootstrap.ts";
import { MORPHISM_DOCUMENT_ID } from "../L02-metamodels/morphism-document.ts";
import {
  registerMorphismDocument,
  type MorphismDocumentM1,
} from "../L02-metamodels/morphism-document-adapter.ts";

export const ROUTING_MORPHISMS_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/RoutingMorphisms/1.0",
  level: MetaLevel.Model,
  conformsTo: MORPHISM_DOCUMENT_ID,
  name: "RoutingMorphisms",
  version: "1.0",
  schema: { type: "object" },
};
registerBootstrapType(ROUTING_MORPHISMS_M1);

export function buildRoutingRuntimeDocument(): MorphismDocumentM1 {
  const doc = Bun.YAML.parse(
    readFileSync(new URL("./routing.model.yaml", import.meta.url), "utf-8"),
  ) as { discriminator: string; morphisms: MorphismDocumentM1["morphisms"] };
  return {
    id: ROUTING_MORPHISMS_M1.id,
    level: MetaLevel.Model,
    conformsTo: MORPHISM_DOCUMENT_ID,
    schema: ROUTING_MORPHISMS_M1.schema,
    discriminator: doc.discriminator,
    name: "RoutingMorphisms",
    version: "1.0",
    morphisms: doc.morphisms,
  };
}

export function registerRoutingMorphisms(kernel: AlgebraicKernel): void {
  registerMorphismDocument(buildRoutingRuntimeDocument(), kernel);
}
