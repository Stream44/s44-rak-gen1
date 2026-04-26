import type { ActionType, AlgebraicKernel, JsonSchema } from "../L13-facade/index.ts";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import buildManifestMorphism from "./morphisms/build-manifest.ts";
import emitCompiled from "./morphisms/emit-compiled.ts";
import parseProjectionDoc from "./morphisms/parse-projection-doc.ts";
import resolveExtends from "./morphisms/resolve-extends.ts";
import surveyDemand from "./morphisms/survey-demand.ts";
import walkAst from "./morphisms/walk-ast.ts";
import { surveyCapabilityRequirements } from "./capability-enforcement.ts";

const NAME_FROM_ID = /^action:\/\/[^/]+\/([^/]+)\/[^/]+$/;

export async function compileMetaProjection(
  yamlText: string,
  kernel: AlgebraicKernel,
  modelActions: Map<string, ActionType>,
): Promise<unknown> {
  const parsed = parseProjectionDoc({ yamlText });
  const resolved = await resolveExtends(parsed, kernel);
  const withManifest = buildManifestMorphism({ ...resolved, modelActions });
  const surveyed = surveyDemand(walkAst(withManifest));
  return emitCompiled({ ...surveyed, capReqs: surveyCapabilityRequirements(resolved) });
}

export function buildModelActions(
  actionMap: Map<string, ActionType>,
  app: ModelBoot | null,
  schemaMap: Map<string, JsonSchema> | null,
): Map<string, ActionType> {
  if (actionMap.size > 0) return new Map(actionMap);
  if (!app) return new Map<string, ActionType>();
  return new Map(
    Object.entries(app.actions).map(([verb, id]) => {
      const name = id.match(NAME_FROM_ID)?.[1] ?? verb;
      return [
        name,
        {
          id,
          name,
          version: "1.0.0",
          verb,
          inputSchema: schemaMap?.get(name) ?? { type: "object" },
          targetMachine: app.stateMachineId ?? "",
          preconditions: [],
          origin: app.origin,
        },
      ];
    }),
  );
}
