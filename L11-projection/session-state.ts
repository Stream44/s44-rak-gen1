import type { JsonSchema } from "../L01-foundation/types.ts";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import type { ActionType } from "../L07-agency/intent.ts";
import type {
  ProjectionAsset,
  ProjectionKind,
  ProjectionModel,
} from "../L01-foundation/projection-types.ts";
import type { ProjectionSession } from "./session.ts";
import { AssetRegistry } from "./asset-registry.ts";

const mergeIdentity = ({ key, state }: { key: string; state: unknown }): unknown => {
  if (!state || typeof state !== "object") return state;
  const rec = state as Record<string, unknown>;
  return rec.id !== undefined ? rec : { ...rec, id: key };
};

export const cloneUiContextStack = (state: Map<string, Record<string, unknown>>) =>
  [...state.entries()].map(([scope, values]) => ({ scope, values: { ...values } }));

export const mergeUiContextFrame = (
  stack: Array<Record<string, unknown>>,
  scope: string,
  initial: Record<string, unknown>,
  state: Map<string, Record<string, unknown>>,
) => [
  ...stack.filter((frame) => frame?.scope !== scope),
  { scope, values: { ...initial, ...(state.get(scope) ?? {}) } },
];

export function bindProjectionInstances(
  doc: ProjectionModel,
  bindings: Map<string, unknown>,
  app: ModelBoot | null,
): void {
  const modelId = doc.bindsModel?.split("@")[0],
    apps = new Map<string, ModelBoot>();
  if (app && modelId) apps.set(modelId, app);
  if (doc.bindsModels) {
    const byModel: Record<string, unknown[]> = {};
    for (const entry of doc.bindsModels) {
      byModel[entry.modelId] = apps.get(entry.modelId)?.listInstances().map(mergeIdentity) ?? [];
    }
    bindings.set("instances", byModel);
    return;
  }
  if (modelId && app) bindings.set("instances", app.listInstances().map(mergeIdentity));
}

export const applyProjectionSessionPatch = (
  session: ProjectionSession,
  patch: Partial<ProjectionSession>,
): ProjectionSession => ({ ...session, ...patch }) as ProjectionSession;

export const registerProjectionKind = (assets: AssetRegistry, kind: ProjectionKind): void =>
  assets.registerKind(kind);

export const registerProjectionAsset = (assets: AssetRegistry, asset: ProjectionAsset): void =>
  assets.register(asset);

export const setProjectionBinding = (
  bindings: Map<string, unknown>,
  name: string,
  value: unknown,
): void => {
  bindings.set(name, value);
};

export const setProjectionUiContext = (
  uiContextState: Map<string, Record<string, unknown>>,
  ctxPath: string,
  path: string,
  value: unknown,
): void => {
  const scope = String(ctxPath),
    values = { ...(uiContextState.get(scope) ?? {}) };
  values[String(path)] = value;
  uiContextState.set(scope, values);
};

export const injectProjectionActionMap = (map: Map<string, ActionType>): Map<string, ActionType> =>
  map;

export const injectProjectionSchemas = (map: Map<string, unknown>): Map<string, JsonSchema> =>
  map as Map<string, JsonSchema>;
