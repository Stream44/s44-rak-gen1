import type { JsonSchema } from "../L01-foundation/types.ts";
import type { ActionType } from "../L07-agency/intent.ts";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import type { ProjectionModel } from "../L01-foundation/projection-types.ts";
import { compileMorphism } from "./algebra.ts";

export function validateDocumentShape(doc: ProjectionModel): void {
  if (!doc || typeof doc !== "object") throw new Error("Projector document must be an object.");
  const missing: string[] = [];
  if (!doc.projector) missing.push("projector");
  if (!doc.version) missing.push("version");
  if (missing.length > 0) {
    throw new Error(`Projector document missing required field(s): ${missing.join(", ")}`);
  }
  const hasPages = doc.pages !== undefined,
    hasMorphism = doc.morphism !== undefined;
  if (hasPages && (!doc.pages || typeof doc.pages !== "object" || Array.isArray(doc.pages))) {
    throw new Error("Projector document field `pages:` must be an object when present.");
  }
  if (hasPages === hasMorphism) {
    throw new Error("Projector document must define exactly one of `pages:` or `morphism:`.");
  }
  if (hasMorphism) doc.morphism = compileMorphism(doc.morphism as unknown);
  if (!doc.routes || !Array.isArray(doc.routes)) doc.routes = [];
  if (doc.actions !== undefined && !Array.isArray(doc.actions)) {
    throw new Error("Projector document field `actions:` must be a list of manifest entries.");
  }
}

export function buildModelActionMap(input: {
  app: ModelBoot | null;
  injectedActions: Map<string, ActionType> | null;
  injectedSchemas: Map<string, JsonSchema> | null;
}): Map<string, ActionType> {
  if (input.injectedActions) return new Map(input.injectedActions);
  const out = new Map<string, ActionType>();
  if (!input.app) return out;
  for (const [verb, id] of Object.entries(input.app.actions)) {
    const match = id.match(/^action:\/\/[^/]+\/([^/]+)\/[^/]+$/),
      name = match ? match[1] : verb;
    out.set(name, {
      id,
      name,
      version: "1.0.0",
      verb,
      inputSchema: input.injectedSchemas?.get(name) ?? { type: "object" },
      targetMachine: input.app.stateMachineId ?? "",
      preconditions: [],
      origin: input.app.origin,
    });
  }
  return out;
}
