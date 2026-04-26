import { AlgebraicKernel, MetaLevel, buildTypeUri } from "../../L13-facade/index.ts";
import type { KernelModelDocument } from "../metamodel.ts";
import inferMetamodelRef from "./infer-metamodel-ref.ts";

export default async function registerTypes(input: {
  doc: KernelModelDocument;
  ak: AlgebraicKernel;
}): Promise<{ typeCount: number }> {
  const { doc, ak } = input,
    origin = doc.origin ?? "adk";
  for (const typeDef of Object.values(doc.types))
    ak.defineType({
      id: buildTypeUri(origin, typeDef.name, doc.version),
      level: MetaLevel.Model,
      conformsTo: inferMetamodelRef(typeDef.jsonSchema),
      schema: typeDef.jsonSchema,
      name: typeDef.name,
      version: doc.version,
    });
  return { typeCount: Object.keys(doc.types).length };
}
