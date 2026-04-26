import { compileMorphism } from "../algebra.ts";
import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";

export default function parseProjectionDoc(input: { yamlText: string }): ProjectionModel {
  const doc = Bun.YAML.parse(input.yamlText) as ProjectionModel;
  if (!doc || typeof doc !== "object") throw new Error("Projector document must be an object.");
  const missing: string[] = [];
  if (!doc.projector) missing.push("projector");
  if (!doc.version) missing.push("version");
  if (doc.bindsModel === undefined || doc.bindsModel === null) missing.push("bindsModel");
  if (missing.length > 0)
    throw new Error(`Projector document missing required field(s): ${missing.join(", ")}`);
  const hasPages = doc.pages !== undefined;
  const hasMorphism = doc.morphism !== undefined;
  if (hasPages && (!doc.pages || typeof doc.pages !== "object" || Array.isArray(doc.pages))) {
    throw new Error("Projector document field `pages:` must be an object when present.");
  }
  if (hasPages === hasMorphism) {
    throw new Error("Projector document must define exactly one of `pages:` or `morphism:`.");
  }
  return {
    ...doc,
    ...(hasMorphism ? { morphism: compileMorphism(doc.morphism as unknown) } : {}),
    routes: Array.isArray(doc.routes) ? doc.routes : [],
  };
}
