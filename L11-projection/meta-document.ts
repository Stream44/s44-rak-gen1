import type { ProjectionModel } from "../L01-foundation/projection-types.ts";
import type { JsonSchema } from "../L01-foundation/types.ts";
import type { ActionType } from "../L07-agency/intent.ts";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import { compileMorphism } from "./algebra.ts";
import { buildManifest, validateActionReferences, type ResolvedManifest } from "./dispatch.ts";
import { PrimitiveRegistry } from "./primitive-registry.ts";
import { buildModelActionMap, validateDocumentShape } from "./document-validation.ts";

export function validateDocument(input: ProjectionModel): ProjectionModel {
  if (!input || typeof input !== "object") throw new Error("Projector document must be an object.");
  const missing = ["projector", "version"].filter(
    (key) => !(input as unknown as Record<string, unknown>)[key],
  );
  if (input.session === undefined || input.session === null) missing.push("session");
  else if (
    input.session.scope === undefined ||
    (Array.isArray(input.session.scope) ? input.session.scope.length === 0 : !input.session.scope)
  )
    missing.push("session.scope");
  if (missing.length > 0)
    throw new Error(`Projector document missing required field(s): ${missing.join(", ")}`);
  const hasPages = input.pages !== undefined;
  const hasMorphism = input.morphism !== undefined;
  if (hasPages && (!input.pages || typeof input.pages !== "object" || Array.isArray(input.pages)))
    throw new Error("Projector document field `pages:` must be an object when present.");
  if (hasPages === hasMorphism)
    throw new Error("Projector document must define exactly one of `pages:` or `morphism:`.");
  return {
    ...input,
    ...(hasMorphism ? { morphism: compileMorphism(input.morphism as unknown) } : {}),
    routes: Array.isArray(input.routes) ? input.routes : [],
  };
}

export function buildProjectionManifest(opts: {
  app: ModelBoot | null;
  doc: ProjectionModel;
  injectedActions: Map<string, ActionType> | null;
  injectedSchemas: Map<string, JsonSchema> | null;
  primitiveRegistry: PrimitiveRegistry;
}): ResolvedManifest {
  validateDocumentShape(opts.doc);
  const manifest = buildManifest(
    opts.doc,
    buildModelActionMap({
      app: opts.app,
      injectedActions: opts.injectedActions,
      injectedSchemas: opts.injectedSchemas,
    }),
  );
  validateActionReferences(opts.doc, opts.primitiveRegistry, manifest);
  return manifest;
}

const withIdentity = ({ key, state }: { key: string; state: unknown }): unknown =>
  state && typeof state === "object" && (state as Record<string, unknown>).id === undefined
    ? { ...(state as Record<string, unknown>), id: key }
    : state;

export function syncAutoBindings(
  currentDoc: ProjectionModel,
  app: ModelBoot | null,
  bindings: Map<string, unknown>,
): void {
  const modelId = currentDoc.bindsModel?.split("@")[0];
  const apps = new Map<string, ModelBoot>();
  if (app && modelId) apps.set(modelId, app);
  if (currentDoc.bindsModels) {
    const byModel: Record<string, unknown[]> = {};
    for (const entry of currentDoc.bindsModels) {
      const instances = apps.get(entry.modelId)?.listInstances().map(withIdentity) ?? [];
      byModel[entry.modelId] = instances;
    }
    bindings.set("instances", byModel);
    return;
  }
  if (!modelId || !app) return;
  bindings.set("instances", app.listInstances().map(withIdentity));
}
