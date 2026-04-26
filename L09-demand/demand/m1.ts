import { readFileSync } from "fs";
import { MetaLevel, type TypeDef } from "../../L01-foundation/types.ts";
import { registerBootstrapType } from "../../L03-tower/bootstrap.ts";
import { MORPHISM_DOCUMENT_ID } from "../../L02-metamodels/morphism-document.ts";

type DemandMorphismDocument = {
  conformsTo: string;
  id: string;
  version: string;
  discriminator: string;
  morphisms: {
    survey: { impl: { kind: string; ast?: unknown } };
    collectPreconditionRequirements: { impl: { kind: string; uri?: string; export?: string } };
  };
};

export const DEMAND_MORPHISMS_M1: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/DemandMorphisms/1.0",
  level: MetaLevel.Model,
  conformsTo: MORPHISM_DOCUMENT_ID,
  name: "DemandMorphisms",
  version: "1.0",
  description: "Co-located M1 instance for the demand survey morphism document.",
  schema: {
    type: "object",
    required: ["conformsTo", "id", "version", "discriminator", "morphisms"],
    properties: {
      conformsTo: { type: "string", const: "adk:MorphismDocument/1.0" },
      id: { type: "string", const: "adk:DemandMorphisms/1.0" },
      version: { type: "string", const: "1.0" },
      discriminator: { type: "string", const: "demand" },
      morphisms: {
        type: "object",
        required: ["survey", "collectPreconditionRequirements"],
        properties: {
          survey: { type: "object" },
          collectPreconditionRequirements: { type: "object" },
        },
      },
    },
  },
};

registerBootstrapType(DEMAND_MORPHISMS_M1);

export const DemandMorphisms = Bun.YAML.parse(
  readFileSync(new URL("./demand.model.yaml", import.meta.url), "utf-8"),
) as DemandMorphismDocument;
validateDemandDoc(DemandMorphisms);

function validateDemandDoc(doc: DemandMorphismDocument): void {
  if (doc.conformsTo !== "adk:MorphismDocument/1.0")
    throw new Error(`Demand morphism document conformsTo mismatch: ${String(doc.conformsTo)}`);
  if (doc.id !== "adk:DemandMorphisms/1.0")
    throw new Error(`Demand morphism document id mismatch: ${String(doc.id)}`);
  if (doc.discriminator !== "demand")
    throw new Error(
      `Demand morphism document discriminator mismatch: ${String(doc.discriminator)}`,
    );
  if (doc.morphisms?.survey?.impl?.kind !== "algebra")
    throw new Error("Demand morphism survey must be algebra");
  const leaf = doc.morphisms?.collectPreconditionRequirements?.impl;
  if (
    leaf?.kind !== "module" ||
    leaf.uri !== "module://./modules/collect-precondition-requirements.ts" ||
    leaf.export !== "default"
  )
    throw new Error(
      "Demand morphism collectPreconditionRequirements must point at module://./modules/collect-precondition-requirements.ts#default",
    );
}
